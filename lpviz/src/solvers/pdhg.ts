import { pdhgEq } from "./pdhg_eq";
import { pdhgIneq } from "./pdhg_ineq";
import type { Lines, VecN } from "./utils/blas";

export interface PDHGOptions {
  ineq: boolean;
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
}

export function pdhg(lines: Lines, objective: VecN, options: PDHGOptions) {
  const { ineq = false, maxit = 1000, eta = 0.25, tau = 0.25, verbose = false, tol = 1e-4 } = options;
  const solverOptions = { maxit, eta, tau, verbose, tol };
  return ineq ? pdhgIneq(lines, objective, solverOptions) : pdhgEq(lines, objective, solverOptions);
}
