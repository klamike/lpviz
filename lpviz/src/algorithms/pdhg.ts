import { pdhgEq } from './pdhg_eq';
import { pdhgIneq } from './pdhg_ineq';
import { Lines, VecN } from '../types/arrays';

export interface PDHGOptions {
  ineq: boolean;
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
}

export function pdhg(lines: Lines, objective: VecN, options: PDHGOptions) {
  const {
    ineq = false,
    maxit = 1000,
    eta = 0.25,
    tau = 0.25,
    verbose = false,
    tol = 1e-4,
  } = options;

  const solverOptions = { maxit, eta, tau, verbose, tol };

  if (ineq) {
    return pdhgIneq(lines, objective, solverOptions);
  } else {
    return pdhgEq(lines, objective, solverOptions);
  }
}