export interface CentralPathOptions {
  niter: number;
  weights: number[] | null;
  verbose: boolean;
}

export interface CentralPathXkOptions {
  maxit: number;
  epsilon: number;
  verbose: boolean;
}

export interface IPMOptions {
  eps_p: number;
  eps_d: number;
  eps_opt: number;
  maxit: number;
  alphaMax: number;
  verbose: boolean;
}

export interface PDHGCoreOptions {
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
}

export interface PDHGOptions extends PDHGCoreOptions {
  ineq: boolean;
  isStandardProblem: boolean;
  cStandard: number[];
}

export interface SimplexOptions {
  tol: number;
  verbose: boolean;
}
