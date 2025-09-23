import {
  addTraceToBuffer,
  state,
  updateIteratePathsWithTrace,
} from "../state/state";
import {
  fetchCentralPath,
  fetchIPM,
  fetchPDHG,
  fetchSimplex,
} from "./apiClient";

export interface IPMOptions {
  alphaMax: number;
  maxIterations: number;
}

export interface PDHGOptions {
  maxIterations: number;
  eta: number;
  tau: number;
  inequalityMode: boolean;
}

export interface CentralPathOptions {
  steps: number;
  objectiveAngleStep: number;
}

export async function computeIPMSolution(
  options: IPMOptions,
  updateResult: (html: string) => void,
): Promise<void> {
  const alphaMax = options.alphaMax;
  const maxit = options.maxIterations;

  const result = await fetchIPM(
    state.computedLines,
    getObjectiveVector(),
    alphaMax,
    maxit,
  );

  const sol = result.iterates.solution;
  const logArray = sol.log;
  const iteratesArray2D = sol.x;
  const muArray = sol.mu;

  const iteratesArray = iteratesArray2D.map((xy, i) => {
    const obj = state.objectiveVector
      ? state.objectiveVector.x * xy[0] + state.objectiveVector.y * xy[1]
      : 0;
    const mu = muArray?.[i] ?? 0;
    return [xy[0], xy[1], obj + mu];
  });

  updateIteratePathsWithTrace(iteratesArray);
  const html = generateIterateHTML(logArray);
  updateResult(html);
}

export async function computeSimplexSolution(
  updateResult: (html: string) => void,
): Promise<void> {
  const result = await fetchSimplex(state.computedLines, getObjectiveVector());

  const iteratesArray = result.iterations;
  const phase1logs = result.logs[0];
  const phase2logs = result.logs[1];

  updateIteratePathsWithTrace(iteratesArray);
  const html = generateSimplexHTML(phase1logs, phase2logs);
  updateResult(html);
}

export async function computePDHGSolution(
  options: PDHGOptions,
  updateResult: (html: string) => void,
): Promise<void> {
  const maxitPDHG = options.maxIterations;
  const pdhgIneq = options.inequalityMode;
  const eta = options.eta;
  const tau = options.tau;

  const result = await fetchPDHG(
    state.computedLines,
    getObjectiveVector(),
    pdhgIneq,
    maxitPDHG,
    eta,
    tau,
  );

  const iteratesArray = result.iterations;
  const logArray = result.logs;

  updateIteratePathsWithTrace(iteratesArray);
  const html = generateIterateHTML(logArray);
  updateResult(html);
}

export async function computeCentralPathSolution(
  options: CentralPathOptions,
  updateResult: (html: string) => void,
): Promise<void> {
  const maxitCentral = options.steps;

  const result = await fetchCentralPath(
    state.computedVertices,
    state.computedLines,
    getObjectiveVector(),
    maxitCentral,
  );

  const iteratesArray = result.iterations;
  const logArray = result.logs;
  const tsolve = result.tsolve;

  state.originalIteratePath = [...iteratesArray];
  state.iteratePath = iteratesArray;
  if (state.traceEnabled && iteratesArray.length > 0) {
    if (
      state.rotateObjectiveMode &&
      state.totalRotationAngle >=
        2 * Math.PI + 0.9 * options.objectiveAngleStep
    ) {
      // Skip trace when rotation is complete
    } else {
      addTraceToBuffer(iteratesArray);
    }
  }

  const html = generateCentralPathHTML(logArray, tsolve);
  updateResult(html);
}

export function generateIterateHTML(
  logArray: string[],
  startIndex: number = 1,
): string {
  let html = "";
  html += `<div class="iterate-header">${logArray[0]}</div>`;
  for (let i = startIndex; i < logArray.length - 1; i++) {
    html += `<div class="iterate-item" data-index="${i - startIndex}">${
      logArray[i]
    }</div>`;
  }
  if (logArray.length > 1) {
    html += `<div class="iterate-footer">${
      logArray[logArray.length - 1]
    }</div>`;
  }
  return html;
}

export function generateSimplexHTML(
  phase1logs: string[],
  phase2logs: string[],
): string {
  let html = "";
  html += `<div class="iterate-header">Phase 1\n${phase1logs[0]}</div>`;
  for (let i = 1; i < phase1logs.length - 1; i++) {
    html += `<div class="iterate-item-nohover">${phase1logs[i]}</div>`;
  }
  html += `<div class="iterate-footer">${
    phase1logs[phase1logs.length - 1]
  }</div>`;
  html += `<div class="iterate-header">Phase 2\n${phase2logs[0]}</div>`;
  for (let i = 1; i < phase2logs.length - 1; i++) {
    html += `<div class="iterate-item" data-index="${i - 1}">${
      phase2logs[i]
    }</div>`;
  }
  html += `<div class="iterate-footer">${
    phase2logs[phase2logs.length - 1]
  }</div>`;
  return html;
}

export function generateCentralPathHTML(
  logArray: string[],
  tsolve: number,
): string {
  let html = "";
  html += `<div class="iterate-header">${logArray[0]}</div>`;
  for (let i = 1; i < logArray.length; i++) {
    html += `<div class="iterate-item" data-index="${i - 1}">${
      logArray[i]
    }</div>`;
  }
  if (logArray.length > 1) {
    html += `<div class="iterate-footer">Traced central path in ${Math.round(
      tsolve * 1000,
    )}ms</div>`;
  }
  return html;
}

export function getObjectiveVector(): [number, number] {
  if (!state.objectiveVector) {
    throw new Error("Objective vector is not set");
  }
  return [state.objectiveVector.x, state.objectiveVector.y];
}
