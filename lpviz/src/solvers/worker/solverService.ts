import { getState, updateIteratePaths, updateIteratePathsWithTrace, addTraceToBuffer } from "../../state/store";

export interface VirtualResultPayload {
  type: "virtual";
  header: string;
  rows: string[];
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
      log: string[];
      mu?: number[];
    };
  };
}

export interface SimplexResult {
  iterations: number[][];
  logs: string[][];
}

export interface PDHGResult {
  iterations: number[][];
  logs: string[];
  eps?: number[];
}

export interface CentralPathResult {
  iterations: number[][];
  logs: string[];
  tsolve: number;
}

export function applyIPMResult(result: IPMResult, updateResult: (payload: ResultRenderPayload) => void) {
  const sol = result.iterates.solution;
  const { objectiveVector } = getState();

  updateIteratesAndRender({
    iterations: sol.x,
    logs: sol.log,
    updateResult,
    zFrom: (xy, index) => {
      const obj = objectiveVector ? objectiveVector.x * xy[0] + objectiveVector.y * xy[1] : 0;
      const mu = sol.mu?.[index] ?? 0;
      return obj + mu;
    },
  });
}

export function applySimplexResult(result: SimplexResult, updateResult: (payload: ResultRenderPayload) => void) {
  updateIteratePathsWithTrace(result.iterations);
  updateResult({ type: "html", html: generateSimplexHTML(result.logs[0], result.logs[1]) });
}

export function applyPDHGResult(result: PDHGResult, updateResult: (payload: ResultRenderPayload) => void) {
  const epsArray = result.eps;
  const [cx, cy] = getObjectiveVector();
  updateIteratesAndRender({
    iterations: result.iterations,
    logs: result.logs,
    updateResult,
    zFrom: (xy, index) => {
      const eps = epsArray && epsArray[index] !== undefined ? epsArray[index]! : 0;
      const pObj = cx * xy[0] + cy * xy[1];
      return pObj + 500 * eps;
    },
  });
}

export function applyCentralPathResult(result: CentralPathResult, updateResult: (payload: ResultRenderPayload) => void) {
  updateIteratesAndRender({
    iterations: result.iterations,
    logs: result.logs,
    updateResult,
    payloadOptions: {
      includeLastInRows: true,
      footerOverride: `Traced central path in ${Math.round(result.tsolve * 1000)}ms`,
    },
    updateTrace: false,
  });

  const { traceEnabled } = getState();
  if (traceEnabled && result.iterations.length > 0) {
    addTraceToBuffer(result.iterations);
  }
}

type IterateRenderParams = {
  iterations: number[][];
  logs: string[];
  updateResult: (payload: ResultRenderPayload) => void;
  zFrom?: (xy: number[], index: number) => number;
  payloadOptions?: Parameters<typeof buildIteratePayload>[1];
  updateTrace?: boolean;
};

function updateIteratesAndRender({ iterations, logs, updateResult, zFrom, payloadOptions, updateTrace = true }: IterateRenderParams) {
  const iteratesWithZ = zFrom ? iterations.map((xy, index) => [xy[0], xy[1], zFrom(xy, index)]) : iterations;

  if (updateTrace) {
    updateIteratePathsWithTrace(iteratesWithZ);
  } else {
    updateIteratePaths(iteratesWithZ);
  }

  updateResult(buildIteratePayload(logs, payloadOptions));
}

function generateSimplexHTML(phase1logs: string[], phase2logs: string[]): string {
  const parts = [`<div class="iterate-header">Phase 1\n${phase1logs[0]}</div>`, ...phase1logs.slice(1, -1).map((log) => `<div class="iterate-item-nohover">${log}</div>`), `<div class="iterate-footer">${phase1logs[phase1logs.length - 1]}</div>`, `<div class="iterate-header">Phase 2\n${phase2logs[0]}</div>`, ...phase2logs.slice(1, -1).map((log, i) => `<div class="iterate-item" data-index="${i}">${log}</div>`), `<div class="iterate-footer">${phase2logs[phase2logs.length - 1]}</div>`];
  return parts.join("");
}

function getObjectiveVector(): [number, number] {
  const { objectiveVector } = getState();
  if (!objectiveVector) throw new Error("Objective vector is not set");
  return [objectiveVector.x, objectiveVector.y];
}

function buildIteratePayload(
  logArray: string[],
  options: {
    startIndex?: number;
    includeLastInRows?: boolean;
    footerOverride?: string;
  } = {},
): VirtualResultPayload {
  const { startIndex = 1, includeLastInRows = false, footerOverride } = options;
  if (logArray.length === 0) {
    return { type: "virtual", header: "", rows: [], footer: footerOverride };
  }

  const endIdx = includeLastInRows || logArray.length - startIndex === 0 ? logArray.length : Math.max(startIndex, logArray.length - 1);

  return {
    type: "virtual",
    header: logArray[0],
    rows: logArray.slice(startIndex, endIdx),
    footer: footerOverride ?? (includeLastInRows ? undefined : logArray[logArray.length - 1]),
  };
}
