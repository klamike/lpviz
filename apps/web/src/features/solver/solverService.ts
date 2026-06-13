import {
  addTraceToBuffer,
  getState,
  updateIteratePaths,
  updateIteratePathsWithTrace,
} from "@/features/core/store";
import type { ResultTextBlock } from "@/features/solver/types";
import { fmtE, fmtF, fmtInt, fmtStr } from "@lpviz/solver-engine/fmt";

type VirtualResultRow =
  | string
  | {
      kind: "ipm";
      iteration: number;
      x: number;
      y: number;
      objective: number;
      infeasibility: number;
      mu: number;
    }
  | {
      kind: "pdhg";
      iteration: number;
      restart?: boolean;
      x: number;
      y: number;
      objective: number;
      infeasibility: number;
      epsilon: number;
    };

// Rows materialize lazily through this view so that a 100k-iteration result
// never pays for building row objects that are not scrolled into view.
export type ResultRowsView<T = VirtualResultRow> = {
  length: number;
  at(index: number): T | undefined;
  // Present on worker-packed results: the ArrayBuffers backing the row columns,
  // handed back to the worker pool once this result stops displaying (see
  // recycleSolverBuffers). Absent for synthesized rows (simplex / central path).
  recyclableBuffers?: ArrayBuffer[];
};

export interface VirtualResultPayload {
  type: "virtual";
  header: string;
  rows: ResultRowsView;
  footer?: string;
}

interface BlocksResultPayload {
  type: "blocks";
  blocks: ResultTextBlock[];
}

export type ResultRenderPayload = VirtualResultPayload | BlocksResultPayload;
export interface IPMResult {
  iterates: {
    solution: {
      x: Float64Array[];
      header: string;
      rows: ResultRowsView<Extract<VirtualResultRow, { kind: "ipm" }>>;
      footer?: string;
      mu?: number[];
    };
  };
}

export interface SimplexResult {
  iterations: Float64Array[];
  phase1Iterations?: Float64Array[];
  logs: string[][];
  mode: "primal" | "dual";
  status?: "optimal" | "unbounded" | "infeasible" | "unavailable";
}

export interface PDHGResult {
  iterations: Float64Array[];
  header: string;
  rows: ResultRowsView<Extract<VirtualResultRow, { kind: "pdhg" }>>;
  footer: string;
  eps?: number[];
  phases?: number[];
  restartIndices?: number[];
}

export interface CentralPathResult {
  iterations: Float64Array[];
  logs: string[];
  tsolve: number;
}

export function applyIPMResult(
  result: IPMResult,
  updateResult: (payload: ResultRenderPayload) => void,
) {
  const sol = result.iterates.solution;
  const { objectiveVector } = getState();
  // worker-packed results arrive with the display z already baked in
  const hasBakedZ = (sol.x[0]?.length ?? 0) >= 3;
  applyCanonicalIterateResult(
    {
      iterations: sol.x,
      header: sol.header,
      rows: sol.rows,
      footer: sol.footer,
      zFrom: hasBakedZ
        ? undefined
        : (xy, index) => {
            const obj = objectiveVector
              ? objectiveVector.x * xy[0] + objectiveVector.y * xy[1]
              : 0;
            const mu = sol.mu?.[index] ?? 0;
            return obj + mu;
          },
    },
    updateResult,
  );
}

export function applySimplexResult(
  result: SimplexResult,
  updateResult: (payload: ResultRenderPayload) => void,
) {
  const phase1Iterations = result.phase1Iterations ?? [];
  const iterations =
    phase1Iterations.length > 0
      ? [...phase1Iterations, ...result.iterations]
      : result.iterations;
  const phases =
    phase1Iterations.length > 0
      ? [
          ...Array.from({ length: phase1Iterations.length }, () => 0),
          ...Array.from({ length: result.iterations.length }, () => 1),
        ]
      : undefined;
  updateIteratePathsWithTrace(iterations, phases);
  updateResult({
    type: "blocks",
    blocks: generateSimplexBlocks(
      result.logs[0],
      result.logs[1],
      result.status,
      phase1Iterations.length,
      result.iterations.length,
    ),
  });
}

export function applyPDHGResult(
  result: PDHGResult,
  updateResult: (payload: ResultRenderPayload) => void,
) {
  const epsArray = result.eps;
  const [cx, cy] = getObjectiveVector();
  // worker-packed results arrive with the display z already baked in
  const hasBakedZ = (result.iterations[0]?.length ?? 0) >= 3;
  applyCanonicalIterateResult(
    {
      iterations: result.iterations,
      header: result.header,
      rows: result.rows,
      footer: result.footer,
      phases: result.phases,
      restartIndices: result.restartIndices,
      zFrom: hasBakedZ
        ? undefined
        : (xy, index) => {
            const eps =
              epsArray && epsArray[index] !== undefined ? epsArray[index]! : 0;
            const pObj = cx * xy[0] + cy * xy[1];
            return pObj + 500 * eps;
          },
    },
    updateResult,
  );
}

export function applyCentralPathResult(
  result: CentralPathResult,
  updateResult: (payload: ResultRenderPayload) => void,
) {
  applyCanonicalIterateResult(
    {
      iterations: result.iterations,
      header: result.logs[0] ?? "",
      // central-path logs carry no footer line (the footer below is synthesized)
      rows: result.logs.slice(1),
      footer: `Traced central path in ${Math.round(result.tsolve * 1000)}ms`,
      updateTrace: false,
    },
    updateResult,
  );

  const { traceEnabled } = getState();
  if (traceEnabled && result.iterations.length > 0) {
    addTraceToBuffer(result.iterations);
  }
}

type CanonicalIterateResult = {
  iterations: Float64Array[];
  header: string;
  rows: ResultRowsView;
  footer?: string;
  zFrom?: (xy: Float64Array, index: number) => number;
  updateTrace?: boolean;
  phases?: number[];
  restartIndices?: number[];
};

export function formatVirtualResultRow(row: VirtualResultRow): string {
  if (typeof row === "string") return row;
  if (row.kind === "ipm") {
    return `${fmtInt(row.iteration, 5)} ${fmtF(row.x, 8, 2)} ${fmtF(row.y, 8, 2)} ${fmtE(row.objective, 10, 1)} ${fmtE(row.infeasibility, 10, 1)} ${fmtE(row.mu, 10, 1, false)}`;
  }
  const iterationLabel = row.restart ? `${row.iteration}r` : `${row.iteration}`;
  return `${fmtStr(iterationLabel, 5)} ${fmtF(row.x, 8, 2)} ${fmtF(row.y, 8, 2)} ${fmtE(row.objective, 10, 1)} ${fmtE(row.infeasibility, 10, 1)} ${fmtE(row.epsilon, 10, 1, false)}`;
}

function applyCanonicalIterateResult(
  {
    iterations,
    header,
    rows,
    footer,
    zFrom,
    updateTrace = true,
    phases,
    restartIndices,
  }: CanonicalIterateResult,
  updateResult: (payload: ResultRenderPayload) => void,
) {
  const iteratesWithZ = zFrom
    ? iterations.map((xy, index) =>
        Float64Array.of(xy[0]!, xy[1]!, zFrom(xy, index)),
      )
    : iterations;

  if (updateTrace) {
    updateIteratePathsWithTrace(iteratesWithZ, phases, restartIndices);
  } else {
    updateIteratePaths(iteratesWithZ, phases, restartIndices);
  }

  updateResult(buildIteratePayload({ header, rows, footer }));
}

function generateSimplexBlocks(
  phase1logs: string[] = [],
  phase2logs: string[] = [],
  status: SimplexResult["status"] = "optimal",
  phase1IterationCount = 0,
  phase2IterationCount = 0,
): ResultTextBlock[] {
  const normalizeLog = (value: string) => value.replace(/\n+$/g, "");
  const createBlock = (
    className: ResultTextBlock["className"],
    text: string,
    index?: number,
  ): ResultTextBlock => ({
    className,
    text: normalizeLog(text),
    index,
  });

  const phase1Header = phase1logs[0] ?? "No phase 1 logs.";
  const phase1Rows = phase1logs.length > 2 ? phase1logs.slice(1, -1) : [];
  const phase1Footer =
    phase1logs.length > 1 ? phase1logs[phase1logs.length - 1] : "";

  const phase2Header = phase2logs[0] ?? "No phase 2 logs.";
  const phase2Rows =
    phase2logs.length <= 1
      ? []
      : status === "unbounded" ||
          status === "infeasible" ||
          status === "unavailable"
        ? phase2logs.slice(1)
        : phase2logs.slice(1, -1);
  const phase2Footer =
    status === "unbounded"
      ? "Unbounded LP"
      : status === "infeasible"
        ? "Infeasible LP"
        : status === "unavailable"
          ? "Dual simplex unavailable"
          : phase2logs.length > 1
            ? phase2logs[phase2logs.length - 1]
            : "";

  const phase1Title = "Phase 1";
  const phase2Title = "Phase 2";
  const setupBlocks =
    phase1logs.length === 0
      ? []
      : [
          createBlock("iterate-header", `${phase1Title}\n${phase1Header}`),
          ...phase1Rows.map((log, i) =>
            i < phase1IterationCount
              ? createBlock("iterate-item", log, i)
              : createBlock("iterate-item-nohover", log),
          ),
          ...(phase1Footer
            ? [createBlock("iterate-footer", phase1Footer)]
            : []),
        ];

  return [
    ...setupBlocks,
    createBlock("iterate-header", `${phase2Title}\n${phase2Header}`),
    ...phase2Rows.map((log, i) =>
      i < phase2IterationCount
        ? createBlock("iterate-item", log, phase1IterationCount + i)
        : createBlock("iterate-item-nohover", log),
    ),
    ...(phase2Footer ? [createBlock("iterate-footer", phase2Footer)] : []),
  ];
}

function getObjectiveVector(): [number, number] {
  const { objectiveVector } = getState();
  if (!objectiveVector) throw new Error("Objective vector is not set");
  return [objectiveVector.x, objectiveVector.y];
}

function buildIteratePayload({
  header,
  rows,
  footer,
}: {
  header: string;
  rows: ResultRowsView;
  footer?: string;
}): VirtualResultPayload {
  return {
    type: "virtual",
    header,
    rows,
    footer,
  };
}
