import { centralPath } from "../../solvers/centralPath";
import { ipm } from "../../solvers/ipm";
import { pdhg } from "../../solvers/pdhg";
import { simplex } from "../../solvers/simplex";
import type { Lines, VecN, Vertices } from "../utils/blas";

import type { CentralPathResult, IPMResult, PDHGResult, SimplexResult } from "./solverService";

export type SolverWorkerPayload =
  | {
      solver: "ipm";
      lines: Lines;
      objective: VecN;
      alphaMax: number;
      correctorThreshold: number;
      maxit: number;
      colorByPhase: boolean;
    }
  | {
      solver: "simplex";
      lines: Lines;
      objective: VecN;
      dual: boolean;
    }
  | {
      solver: "pdhg";
      lines: Lines;
      objective: VecN;
      ineq: boolean;
      halpern: boolean;
      maxit: number;
      eta: number;
      tau: number;
      colorByBasis: boolean;
    }
  | {
      solver: "central";
      vertices: Vertices;
      lines: Lines;
      objective: VecN;
      niter: number;
    };

type SolverWorkerRequest = SolverWorkerPayload & { id: number };

export type SolverWorkerSuccessResponse =
  | {
      id: number;
      solver: "ipm";
      success: true;
      result: IPMResult;
    }
  | {
      id: number;
      solver: "simplex";
      success: true;
      result: SimplexResult;
    }
  | {
      id: number;
      solver: "pdhg";
      success: true;
      result: PDHGResult;
    }
  | {
      id: number;
      solver: "central";
      success: true;
      result: CentralPathResult;
    };

type SolverWorkerErrorResponse = {
  id: number;
  success: false;
  error: string;
};

export type SolverWorkerResponse = SolverWorkerSuccessResponse | SolverWorkerErrorResponse;

const DEFAULT_TOLERANCE = 1e-5;

interface BaseSolverOptions {
  tol: number;
  verbose: boolean;
}

const DEFAULT_BASE_OPTIONS: BaseSolverOptions = {
  tol: DEFAULT_TOLERANCE,
  verbose: false,
};

async function wrapSolverCall<T>(solverName: string, solverFunction: () => T | Promise<T>): Promise<T> {
  try {
    return await solverFunction();
  } catch (error) {
    console.error(`Error in ${solverName} solver:`, error);
    throw error;
  }
}

async function runCentralPath(vertices: Vertices, lines: Lines, objective: VecN, niter: number) {
  return wrapSolverCall("Central Path", () => {
    const options = { ...DEFAULT_BASE_OPTIONS, niter };
    return centralPath(vertices, lines, objective, options);
  });
}

async function runSimplex(lines: Lines, objective: VecN, dual: boolean) {
  return wrapSolverCall("Simplex", () => {
    const options = { tol: DEFAULT_TOLERANCE, verbose: false, dual };
    return simplex(lines, objective, options);
  });
}

async function runIPM(lines: Lines, objective: VecN, alphamax: number, correctorThreshold: number, maxit: number, colorByPhase: boolean) {
  return wrapSolverCall("IPM", () => {
    const options = {
      ...DEFAULT_BASE_OPTIONS,
      eps_p: DEFAULT_TOLERANCE,
      eps_d: DEFAULT_TOLERANCE,
      eps_opt: DEFAULT_TOLERANCE,
      alphaMax: alphamax,
      correctorThreshold,
      maxit,
      colorByPhase,
    };
    return ipm(lines, objective, options);
  });
}

async function runPDHG(lines: Lines, objective: VecN, ineq: boolean, halpern: boolean, maxit: number, eta: number, tau: number, colorByBasis: boolean) {
  return wrapSolverCall("PDHG", () => {
    const options = { ...DEFAULT_BASE_OPTIONS, ineq, halpern, maxit, eta, tau, colorByBasis };
    return pdhg(lines, objective, options);
  });
}

const ctx = self as unknown as Worker;

async function executeSolver(data: SolverWorkerRequest): Promise<SolverWorkerSuccessResponse> {
  const { id } = data;
  if (data.solver === "ipm") {
    return { id, solver: "ipm", success: true, result: await runIPM(data.lines, data.objective, data.alphaMax, data.correctorThreshold, data.maxit, data.colorByPhase) };
  }
  if (data.solver === "simplex") {
    return { id, solver: "simplex", success: true, result: await runSimplex(data.lines, data.objective, data.dual) };
  }
  if (data.solver === "pdhg") {
    return { id, solver: "pdhg", success: true, result: await runPDHG(data.lines, data.objective, data.ineq, data.halpern, data.maxit, data.eta, data.tau, data.colorByBasis) };
  }
  if (data.solver === "central") {
    return { id, solver: "central", success: true, result: await runCentralPath(data.vertices, data.lines, data.objective, data.niter) };
  }
  const exhaustive: never = data;
  throw new Error(`Unsupported solver: ${JSON.stringify(exhaustive)}`);
}

ctx.addEventListener("message", async (event: MessageEvent<SolverWorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  try {
    ctx.postMessage(await executeSolver(data));
  } catch (error) {
    ctx.postMessage({
      id: data.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
