import { sprintf } from "sprintf-js";
import { formatMilliseconds } from "../utils/time";
import { getState, updateIteratePaths, updateIteratePathsWithTrace, addTraceToBuffer } from "../../state/store";

export type VirtualResultRow =
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

export interface VirtualResultPayload {
  type: "virtual";
  header: string;
  rows: VirtualResultRow[];
  footer?: string;
}

interface HtmlResultPayload {
  type: "html";
  html: string;
}

export type ResultRenderPayload = VirtualResultPayload | HtmlResultPayload;
export interface IPMResult {
  iterates: {
    solution: {
      x: number[][];
      header: string;
      rows: Extract<VirtualResultRow, { kind: "ipm" }>[];
      footer?: string;
      mu?: number[];
      phases?: number[];
    };
  };
}

export interface SimplexResult {
  iterations: number[][];
  logs: string[][];
  mode: "primal" | "dual";
  status?: "optimal" | "unbounded" | "unavailable";
}

export interface PDHGResult {
  iterations: number[][];
  header: string;
  rows: Extract<VirtualResultRow, { kind: "pdhg" }>[];
  footer: string;
  eps?: number[];
  phases?: number[];
  restartIndices?: number[];
}

export interface CentralPathResult {
  iterations: number[][];
  logs: string[];
  tsolve: number;
}

export function applyIPMResult(result: IPMResult, updateResult: (payload: ResultRenderPayload) => void) {
  const sol = result.iterates.solution;
  const { objectiveVector } = getState();
  applyCanonicalIterateResult(
    {
      iterations: sol.x,
      header: sol.header,
      rows: sol.rows,
      footer: sol.footer,
      phases: sol.phases,
      zFrom: (xy, index) => {
        const obj = objectiveVector ? objectiveVector.x * xy[0] + objectiveVector.y * xy[1] : 0;
        const mu = sol.mu?.[index] ?? 0;
        return obj + mu;
      },
    },
    updateResult,
  );
}

export function applySimplexResult(result: SimplexResult, updateResult: (payload: ResultRenderPayload) => void) {
  updateIteratePathsWithTrace(result.iterations);
  updateResult({ type: "html", html: generateSimplexHTML(result.logs[0], result.logs[1], result.mode, result.status) });
}

export function applyPDHGResult(result: PDHGResult, updateResult: (payload: ResultRenderPayload) => void) {
  const epsArray = result.eps;
  const [cx, cy] = getObjectiveVector();
  applyCanonicalIterateResult(
    {
      iterations: result.iterations,
      header: result.header,
      rows: result.rows,
      footer: result.footer,
      phases: result.phases,
      restartIndices: result.restartIndices,
      zFrom: (xy, index) => {
        const eps = epsArray && epsArray[index] !== undefined ? epsArray[index]! : 0;
        const pObj = cx * xy[0] + cy * xy[1];
        return pObj + 500 * eps;
      },
    },
    updateResult,
  );
}

export function applyCentralPathResult(result: CentralPathResult, updateResult: (payload: ResultRenderPayload) => void) {
  applyCanonicalIterateResult(
    {
      iterations: result.iterations,
      header: result.logs[0] ?? "",
      rows: result.logs.slice(1, -1),
      footer: `Traced central path in ${formatMilliseconds(result.tsolve * 1000)}`,
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
  iterations: number[][];
  header: string;
  rows: VirtualResultRow[];
  footer?: string;
  zFrom?: (xy: number[], index: number) => number;
  updateTrace?: boolean;
  phases?: number[];
  restartIndices?: number[];
};

export function formatVirtualResultRow(row: VirtualResultRow): string {
  if (typeof row === "string") return row;
  if (row.kind === "ipm") {
    return sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e", row.iteration, row.x, row.y, row.objective, row.infeasibility, row.mu);
  }
  const iterationLabel = row.restart ? `${row.iteration}r` : `${row.iteration}`;
  return sprintf("%5s %+8.2f %+8.2f %+10.1e %+10.1e %10.1e", iterationLabel, row.x, row.y, row.objective, row.infeasibility, row.epsilon);
}

function applyCanonicalIterateResult(
  { iterations, header, rows, footer, zFrom, updateTrace = true, phases, restartIndices }: CanonicalIterateResult,
  updateResult: (payload: ResultRenderPayload) => void,
) {
  const iteratesWithZ = zFrom ? iterations.map((xy, index) => [xy[0], xy[1], zFrom(xy, index)]) : iterations;

  if (updateTrace) {
    updateIteratePathsWithTrace(iteratesWithZ, phases, restartIndices);
  } else {
    updateIteratePaths(iteratesWithZ, phases, restartIndices);
  }

  updateResult(buildIteratePayload({ header, rows, footer }));
}

function generateSimplexHTML(
  phase1logs: string[] = [],
  phase2logs: string[] = [],
  mode: SimplexResult["mode"] = "primal",
  status: SimplexResult["status"] = "optimal",
): string {
  const normalizeLog = (value: string) => value.replace(/\n+$/g, "");
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const renderBlock = (className: string, text: string, attrs = "") =>
    `<div class="${className}"${attrs} style="white-space: pre-wrap">${escapeHtml(normalizeLog(text))}</div>`;

  const phase1Header = phase1logs[0] ?? "No phase 1 logs.";
  const phase1Rows = phase1logs.length > 2 ? phase1logs.slice(1, -1) : [];
  const phase1Footer = phase1logs.length > 1 ? phase1logs[phase1logs.length - 1] : "";

  const phase2Header = phase2logs[0] ?? "No phase 2 logs.";
  const phase2Rows =
    phase2logs.length <= 1 ? [] : status === "unbounded" || status === "unavailable" ? phase2logs.slice(1) : phase2logs.slice(1, -1);
  const phase2Footer =
    status === "unbounded"
      ? "Unbounded LP"
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
          renderBlock("iterate-header", `${phase1Title}\n${phase1Header}`),
          ...phase1Rows.map((log) => renderBlock("iterate-item-nohover", log)),
          ...(phase1Footer ? [renderBlock("iterate-footer", phase1Footer)] : []),
        ];

  return [
    ...setupBlocks,
    renderBlock("iterate-header", `${phase2Title}\n${phase2Header}`),
    ...phase2Rows.map((log, i) => renderBlock("iterate-item", log, ` data-index="${i}"`)),
    ...(phase2Footer ? [renderBlock("iterate-footer", phase2Footer)] : []),
  ].join("");
}

function getObjectiveVector(): [number, number] {
  const { objectiveVector } = getState();
  if (!objectiveVector) throw new Error("Objective vector is not set");
  return [objectiveVector.x, objectiveVector.y];
}

function buildIteratePayload({ header, rows, footer }: { header: string; rows: VirtualResultRow[]; footer?: string }): VirtualResultPayload {
  return {
    type: "virtual",
    header,
    rows,
    footer,
  };
}
