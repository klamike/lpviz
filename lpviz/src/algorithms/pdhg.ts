import { Matrix } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { linesToAb, projectNonNegative } from '../utils/blas';
import { ArrayMatrix, VecM, VecN, Vec2N, Vec2Ns, VectorM, VectorN } from '../types/arrays';

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


function pdhgEpsilon(A: Matrix, b: VectorM, c: VectorN, xk: VectorN, yk: VectorM) {
  const Ax = A.mmul(xk);
  const primalFeasibility = Matrix.sub(Ax, b).norm() / (1 + b.norm());

  const ATy = A.transpose().mmul(yk);
  const negATy_minus_c = Matrix.sub(ATy.mul(-1), c);
  const dualFeasibility = projectNonNegative(negATy_minus_c).norm() / (1 + c.norm());

  const cTx = c.dot(xk);
  const bTy = b.dot(yk);
  const dualityGap = Math.abs(cTx + bTy) / (1 + Math.abs(cTx) + Math.abs(bTy));

  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgIneqEpsilon(A: Matrix, b: VectorM, c: VectorN, xk: VectorN, yk: VectorM) {
  const Ax = A.mmul(xk);
  const primalFeasibility = projectNonNegative(Matrix.sub(Ax, b)).norm() / (1 + b.norm());
  const dualFeasibility = projectNonNegative(yk.mul(-1)).norm() / (1 + c.norm());

  const cTx = c.dot(xk);
  const bTy = b.dot(yk);
  const dualityGap = Math.abs(bTy + cTx) / (1 + Math.abs(cTx) + Math.abs(bTy));

  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgStandardForm(A: Matrix, b: VectorM, c: VectorN, options: PDHGCoreOptions) {
  const { maxit, eta, tau, tol, verbose } = options;

  const m = A.rows;
  const n = A.columns;

  let xk = Matrix.zeros(n, 1);
  let yk = Matrix.zeros(m, 1);
  let k = 1;

  let epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  const logs = [];

  const logHeader = sprintf("%5s %8s %8s %10s %10s %10s",
    'Iter', 'x', 'y', ' Obj', 'Infeas', 'eps');
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates: Vec2Ns = [];
  const startTime = performance.now();

  while (k < maxit && epsilonK > tol) {
    iterates.push(xk.to1DArray());

    const pObj = -c.dot(xk);
    const pFeas = Matrix.sub(A.mmul(xk), b).max();
    const dFeas = projectNonNegative(Matrix.sub(A.transpose().mmul(yk).mul(-1), c)).max();

    let logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e",
      k,
      xk.get(0, 0),
      -yk.get(0, 0),
      pObj,
      pFeas,
      epsilonK
    );

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    // Gradient and updates
    const xk_plus_1 = projectNonNegative(Matrix.sub(xk, Matrix.add(c, A.transpose().mmul(yk)).mul(eta)));
    const x_extrapolated = Matrix.add(xk_plus_1, Matrix.sub(xk_plus_1, xk));
    const yk_plus_1 = Matrix.add(yk, Matrix.sub(A.mmul(x_extrapolated), b).mul(tau));

    xk = xk_plus_1;
    yk = yk_plus_1;
    k++;

    epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  }

  const endTime = performance.now();
  const tsolve = (endTime - startTime).toFixed(2);

  let finalLogMsg: string;
  if (epsilonK <= tol) {
    finalLogMsg = `Converged to primal-dual optimal solution in ${tsolve}ms`;
  } else {
    finalLogMsg = `Did not converge after ${iterates.length} iterations in ${tsolve}ms`;
  }
  if (verbose) console.log(finalLogMsg);
  logs.push(finalLogMsg);

  return {
    iterations: iterates,
    logs: logs
  };
}

function pdhgInequalityForm(A: Matrix, b: VectorM, c: VectorN, options: PDHGCoreOptions) {
  const { maxit, eta, tau, tol, verbose } = options;

  const m = A.rows;
  const n = A.columns;

  let xk = Matrix.zeros(n, 1);
  let yk = Matrix.ones(m, 1);
  let k = 1;

  let epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  const logs = [];

  const logHeader = sprintf("%5s %8s %8s %10s %10s %10s",
    'Iter', 'x', 'y', ' Obj', 'Infeas', 'eps');
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates: Vec2Ns = [];
  const startTime = performance.now();

  while (k <= maxit && epsilonK > tol) {
    iterates.push(xk.to1DArray());

    const pObj = c.dot(xk);
    const pFeasVal = projectNonNegative(Matrix.sub(A.mmul(xk), b)).max();
    const dFeasVal = projectNonNegative(yk.mul(-1)).max();

    let logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e",
      k,
      xk.get(0, 0),
      xk.rows > 1 ? xk.get(1, 0) : 0.0,
      pObj,
      pFeasVal,
      epsilonK
    );

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    // y update
    const yk_plus_1 = projectNonNegative(Matrix.add(yk, Matrix.sub(A.mmul(xk), b).mul(tau)));

    // x update  
    const y_extrapolated = Matrix.add(yk_plus_1, Matrix.sub(yk_plus_1, yk));
    const xk_plus_1 = Matrix.sub(xk, Matrix.add(c, A.transpose().mmul(y_extrapolated)).mul(eta));

    xk = xk_plus_1;
    yk = yk_plus_1;
    k++;

    epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  }

  const endTime = performance.now();
  const tsolve = parseFloat((endTime - startTime).toFixed(2));

  let finalLogMsg: string;
  if (epsilonK <= tol) {
    finalLogMsg = `Converged to primal-dual optimal solution in ${tsolve}ms`;
  } else {
    finalLogMsg = `Did not converge after ${iterates.length} iterations in ${tsolve}ms`;
  }
  if (verbose) console.log(finalLogMsg);
  logs.push(finalLogMsg);

  return {
    iterations: iterates,
    logs: logs
  };
}

export function pdhg(linesOrMatrixA: Matrix | ArrayMatrix, objectiveOrVectorB: VecM | VecN, options: PDHGOptions) {
  const {
    ineq = false,
    maxit = 1000,
    eta = 0.25,
    tau = 0.25,
    verbose = false,
    tol = 1e-4,
    isStandardProblem = false,
    cStandard = [],
  } = options;

  if (maxit > Math.pow(2, 16)) {
    throw new Error("maxit > 2^16 not allowed");
  }

  const solverOptions = { maxit, eta, tau, verbose, tol };

  // Standard form directly provided
  if (isStandardProblem) {
    const A_direct = linesOrMatrixA instanceof Matrix ? linesOrMatrixA : new Matrix(linesOrMatrixA);
    return pdhgStandardForm(A_direct, Matrix.columnVector(objectiveOrVectorB as VecM), Matrix.columnVector(cStandard), solverOptions);
  }

  // Otherwise, interpret linesOrMatrixA as rows with last column = b
  const { A, b } = linesToAb(linesOrMatrixA);
  const c_objective: VecN = objectiveOrVectorB as VecN;
  const m = A.rows;
  const n_orig = A.columns;

  if (ineq) {
    // For inequalities, we minimize c^T x subject to A x <= b
    // Convert to maximizing -c^T x subject to A x <= b, so dual flip sign of c
    return pdhgInequalityForm(A, b, Matrix.columnVector(c_objective.map(x => -x)), solverOptions);
  } else {
    // Equality-constrained LP in standard form:
    // Minimize c^T x subject to A x = b, x >= 0
    // Convert to PDHG standard form by splitting x into (x+, x-)
    const A_rows = A.to2DArray();
    const A_hat_rows = [];
    for (let i = 0; i < m; i++) {
      // Build each row of A_hat: [A_i | -A_i | I_m_row_i]
      const row = new Array(2 * n_orig + m).fill(0);
      for (let j = 0; j < n_orig; j++) {
        row[j] = A_rows[i][j];
        row[j + n_orig] = -A_rows[i][j];
      }
      row[i + 2 * n_orig] = 1;
      A_hat_rows.push(row);
    }
    const A_hat = new Matrix(A_hat_rows);

    // c_hat = [-c; c; 0_m]
    const c_hat_array = [...c_objective.map(x => -x), ...c_objective, ...new Array(m).fill(0)];
    const { iterations: chi_iterates, logs } = pdhgStandardForm(A_hat, b, Matrix.columnVector(c_hat_array), solverOptions);
    // Reconstruct x = x+ - x-
    const x_iterates = chi_iterates.map((chi_k: Vec2N) => {
      const x_plus: VecN = chi_k.slice(0, n_orig);
      const x_minus: VecN = chi_k.slice(n_orig, 2 * n_orig);
      return x_plus.map((val, i) => val - x_minus[i]);
    });

    return {
      iterations: x_iterates,
      logs
    };
  }
}