import { pdhgEq } from "./pdhg_eq";
import { pdhgIneq } from "./pdhg_ineq";
import type { Lines, VecN } from "./utils/blas";

interface PDHGOptions {
  ineq: boolean;
  halpern: boolean;
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
  colorByBasis: boolean;
}

export function pdhg(lines: Lines, objective: VecN, options: PDHGOptions) {
  const { ineq = false, halpern = false, maxit = 1000, eta = 0.25, tau = 0.25, verbose = false, tol = 1e-4, colorByBasis = false } = options;
  const solverOptions = { maxit, eta, tau, verbose, tol, colorByBasis, halpern };
  return ineq ? pdhgIneq(lines, objective, solverOptions) : pdhgEq(lines, objective, solverOptions);
}
