import { centralPath } from "../../solvers/centralPath";
import { ipm } from "../../solvers/ipm";
import { pdhg } from "../../solvers/pdhg";
import { simplex } from "../../solvers/simplex";
import type { Lines, VecN, Vertices } from "../../types/arrays";

import type { CentralPathResult, IPMResult, PDHGResult, SimplexResult } from "./solverService";

export type SolverModeWorker = "central" | "ipm" | "simplex" | "pdhg";

export type SolverWorkerPayload =
  | {
      solver: "ipm";
      lines: Lines;
      objective: VecN;
      alphaMax: number;
      maxit: number;
    }
  | {
      solver: "simplex";
      lines: Lines;
      objective: VecN;
    }
  | {
      solver: "pdhg";
      lines: Lines;
      objective: VecN;
      ineq: boolean;
      maxit: number;
      eta: number;
      tau: number;
    }
  | {
      solver: "central";
      vertices: Vertices;
      lines: Lines;
      objective: VecN;
      niter: number;
    };

export type SolverWorkerRequest = SolverWorkerPayload & { id: number };

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

export type SolverWorkerErrorResponse = {
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

async function runSimplex(lines: Lines, objective: VecN) {
  return wrapSolverCall("Simplex", () => {
    const options = { tol: DEFAULT_TOLERANCE, verbose: false };
    return simplex(lines, objective, options);
  });
}

async function runIPM(lines: Lines, objective: VecN, alphamax: number, maxit: number) {
  return wrapSolverCall("IPM", () => {
    const options = { ...DEFAULT_BASE_OPTIONS, eps_p: DEFAULT_TOLERANCE, eps_d: DEFAULT_TOLERANCE, eps_opt: DEFAULT_TOLERANCE, alphaMax: alphamax, maxit };
    return ipm(lines, objective, options);
  });
}

async function runPDHG(lines: Lines, objective: VecN, ineq: boolean, maxit: number, eta: number, tau: number) {
  return wrapSolverCall("PDHG", () => {
    const options = { ...DEFAULT_BASE_OPTIONS, ineq, maxit, eta, tau };
    return pdhg(lines, objective, options);
  });
}

const ctx = self as unknown as Worker;

async function executeSolver(data: SolverWorkerRequest): Promise<SolverWorkerSuccessResponse> {
  const { id } = data;
  if (data.solver === "ipm") {
    return { id, solver: "ipm", success: true, result: await runIPM(data.lines, data.objective, data.alphaMax, data.maxit) };
  }
  if (data.solver === "simplex") {
    return { id, solver: "simplex", success: true, result: await runSimplex(data.lines, data.objective) };
  }
  if (data.solver === "pdhg") {
    return { id, solver: "pdhg", success: true, result: await runPDHG(data.lines, data.objective, data.ineq, data.maxit, data.eta, data.tau) };
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
