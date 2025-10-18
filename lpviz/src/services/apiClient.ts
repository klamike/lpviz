import { pdhg } from "../algorithms/pdhg";
import { ipm } from "../algorithms/ipm";
import { centralPath } from "../algorithms/centralPath";
import { simplex } from "../algorithms/simplex";
import { VecN, Vertices, Lines } from "../types/arrays";

interface BaseSolverOptions {
  tol: number;
  verbose: boolean;
}

async function wrapSolverCall<T>(
  solverName: string,
  solverFunction: () => T | Promise<T>
): Promise<T> {
  try {
    const result = await solverFunction();
    return result;
  } catch (error) {
    console.error(`Error in local ${solverName} solver:`, error);
    throw error;
  }
}

const DEFAULT_TOLERANCE = 1e-5;
const DEFAULT_BASE_OPTIONS: BaseSolverOptions = {
  tol: DEFAULT_TOLERANCE,
  verbose: false,
};

export async function fetchCentralPath(
  vertices: Vertices, 
  lines: Lines, 
  objective: VecN, 
  niter: number
) {
  return wrapSolverCall("Central Path", () => {
    const options = { 
      ...DEFAULT_BASE_OPTIONS, 
      niter
    };
    return centralPath(vertices, lines, objective, options);
  });
}

export async function fetchSimplex(lines: Lines, objective: VecN) {
  return wrapSolverCall("Simplex", () => {
    const options = { 
      tol: DEFAULT_TOLERANCE, 
      verbose: false 
    };
    return simplex(lines, objective, options);
  });
}

export async function fetchIPM(
  lines: Lines, 
  objective: VecN, 
  alphamax: number, 
  maxit: number
) {
  return wrapSolverCall("IPM", () => {
    const options = { 
      ...DEFAULT_BASE_OPTIONS,
      eps_p: DEFAULT_TOLERANCE, 
      eps_d: DEFAULT_TOLERANCE, 
      eps_opt: DEFAULT_TOLERANCE, 
      alphaMax: alphamax, 
      maxit 
    };
    return ipm(lines, objective, options);
  });
}

export async function fetchPDHG(
  lines: Lines, 
  objective: VecN, 
  ineq: boolean, 
  maxit: number, 
  eta: number, 
  tau: number
) {
  return wrapSolverCall("PDHG", () => {
    const options = { 
      ...DEFAULT_BASE_OPTIONS,
      ineq, 
      maxit, 
      eta, 
      tau 
    };
    return pdhg(lines, objective, options);
  });
}
