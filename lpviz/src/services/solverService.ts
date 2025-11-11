import {
  getObjectiveState,
  getSolverState,
  getTraceState,
  mutateSolverState,
  updateIteratePathsWithTrace,
  addTraceToBuffer,
} from "../state/state";
import type { ResultRenderPayload, VirtualResultPayload } from "../types/resultPayload";
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
  const logArray = sol.log;
  const iteratesArray2D = sol.x;
  const muArray = sol.mu;
  
  const { objectiveVector } = getObjectiveState();
  const iteratesArray = iteratesArray2D.map((xy, i) => {
    const obj = objectiveVector ? objectiveVector.x * xy[0] + objectiveVector.y * xy[1] : 0;
    const mu = muArray?.[i] ?? 0;
    return [xy[0], xy[1], obj + mu];
  });
  
  updateIteratePathsWithTrace(iteratesArray);
  updateResult(buildIteratePayload(logArray));
}

export function applySimplexResult(result: SimplexResult, updateResult: (payload: ResultRenderPayload) => void) {
  const iteratesArray = result.iterations;
  const phase1logs = result.logs[0];
  const phase2logs = result.logs[1];
  
  updateIteratePathsWithTrace(iteratesArray);
  const html = generateSimplexHTML(phase1logs, phase2logs);
  updateResult({ type: "html", html });
}

export function applyPDHGResult(result: PDHGResult, updateResult: (payload: ResultRenderPayload) => void) {
  const iteratesArray = (result.iterations as number[][]).map((xy: number[], i: number) => {
    const eps = result.eps && result.eps[i] !== undefined ? result.eps[i] : 0;
    const [cx, cy] = getObjectiveVector();
    const pObj = cx * xy[0] + cy * xy[1];
    const z = pObj + 500 * eps;
    return [xy[0], xy[1], z];
  });
  const logArray = result.logs;
  
  updateIteratePathsWithTrace(iteratesArray);
  updateResult(buildIteratePayload(logArray));
}

export function applyCentralPathResult(
  result: CentralPathResult,
  angleStep: number,
  updateResult: (payload: ResultRenderPayload) => void
) {
  const iteratesArray = result.iterations;
  const logArray = result.logs;
  const tsolve = result.tsolve;
  
  mutateSolverState((draft) => {
    draft.originalIteratePath = [...iteratesArray];
    draft.iteratePath = iteratesArray;
  });
  const traceState = getTraceState();
  const solverState = getSolverState();
  if (traceState.traceEnabled && iteratesArray.length > 0) {
    if (solverState.rotateObjectiveMode && traceState.totalRotationAngle >= 2 * Math.PI + 0.9 * angleStep) {
      // Skip trace when rotation is complete
    } else {
      addTraceToBuffer(iteratesArray);
    }
  }
  
  const payload = buildIteratePayload(logArray, {
    includeLastInRows: true,
    footerOverride: `Traced central path in ${Math.round(tsolve * 1000)}ms`,
  });
  updateResult(payload);
}

export function generateSimplexHTML(phase1logs: string[], phase2logs: string[]): string {
  let html = "";
  html += `<div class="iterate-header">Phase 1\n${phase1logs[0]}</div>`;
  for (let i = 1; i < phase1logs.length - 1; i++) {
    html += `<div class="iterate-item-nohover">${phase1logs[i]}</div>`;
  }
  html += `<div class="iterate-footer">${phase1logs[phase1logs.length - 1]}</div>`;
  html += `<div class="iterate-header">Phase 2\n${phase2logs[0]}</div>`;
  for (let i = 1; i < phase2logs.length - 1; i++) {
    html += `<div class="iterate-item" data-index="${i - 1}">${phase2logs[i]}</div>`;
  }
  html += `<div class="iterate-footer">${phase2logs[phase2logs.length - 1]}</div>`;
  return html;
}

export function getObjectiveVector(): [number, number] {
  const snapshot = getObjectiveState();
  if (!snapshot.objectiveVector) {
    throw new Error("Objective vector is not set");
  }
  return [snapshot.objectiveVector.x, snapshot.objectiveVector.y];
}

function buildIteratePayload(
  logArray: string[],
  options: { startIndex?: number; includeLastInRows?: boolean; footerOverride?: string } = {}
): VirtualResultPayload {
  const { startIndex = 1, includeLastInRows = false, footerOverride } = options;
  if (logArray.length === 0) {
    return { type: "virtual", header: "", rows: [], footer: footerOverride };
  }

  const header = logArray[0];
  let footer = footerOverride;
  let endExclusive = logArray.length;

  if (!includeLastInRows && logArray.length - startIndex > 0) {
    endExclusive = Math.max(startIndex, logArray.length - 1);
    footer = footer ?? logArray[logArray.length - 1];
  }

  const rows = logArray.slice(startIndex, endExclusive);
  return {
    type: "virtual",
    header,
    rows,
    footer,
  };
}
