import { Matrix } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { dot, normInf, vectorAdd, vectorSub, scale, norm, projNonNegative, linesToAb, mvmul, mtmul } from '../utils/blas';
import { PDHGCoreOptions, PDHGOptions } from '../types/solverOptions';

function pdhgEpsilon(A: Matrix, b: number[], c: number[], xk: number[], yk: number[]) {
  const Ax = mvmul(A, xk);
  const primalFeasNum = norm(vectorSub(Ax, b));
  const primalFeasDen = 1 + norm(b);
  const primalFeasibility = primalFeasNum / primalFeasDen;

  const ATy = mtmul(A, yk);
  const negATy_minus_c = vectorSub(scale(ATy, -1), c);
  const dualFeasNum = norm(projNonNegative(negATy_minus_c));
  const dualFeasDen = 1 + norm(c);
  const dualFeasibility = dualFeasNum / dualFeasDen;

  const cTx = dot(c, xk);
  const bTy = dot(b, yk);
  const dualityGapNum = Math.abs(cTx + bTy);
  const dualityGapDen = 1 + Math.abs(cTx) + Math.abs(bTy);
  const dualityGap = dualityGapNum / dualityGapDen;

  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgIneqEpsilon(A: Matrix, b: number[], c: number[], xk: number[], yk: number[]) {
  const Ax = mvmul(A, xk);
  const Ax_minus_b = vectorSub(Ax, b);
  const primalFeasNum = norm(projNonNegative(Ax_minus_b));
  const primalFeasDen = 1 + norm(b);
  const primalFeasibility = primalFeasNum / primalFeasDen;

  const dualFeasNum = norm(projNonNegative(scale(yk, -1)));
  const dualFeasDen = 1 + norm(c);
  const dualFeasibility = dualFeasNum / dualFeasDen;

  const cTx = dot(c, xk);
  const bTy = dot(b, yk);
  const dualityGapNum = Math.abs(bTy + cTx);
  const dualityGapDen = 1 + Math.abs(cTx) + Math.abs(bTy);
  const dualityGap = dualityGapNum / dualityGapDen;

  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgStandardForm(A: Matrix, b: number[], c: number[], options: PDHGCoreOptions) {
  const { maxit, eta, tau, tol, verbose } = options;

  const m = A.rows;
  const n = A.columns;

  let xk = new Array(n).fill(0.0);
  let yk = new Array(m).fill(0.0);
  let k = 1;

  let epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  const logs = [];

  const logHeader = sprintf("%5s %8s %8s %10s %10s %10s",
    'Iter', 'x', 'y', ' Obj', 'Infeas', 'eps');
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates = [];
  const startTime = performance.now();

  while (k < maxit && epsilonK > tol) {
    iterates.push([...xk]);

    const pObj = -dot(c, xk);
    const dObj = -dot(b, yk);
    const A_xk = mvmul(A, xk);
    const pFeas = normInf(vectorSub(A_xk, b));
    const AT_yk = mtmul(A, yk);
    const dFeas = normInf(projNonNegative(vectorSub(scale(AT_yk, -1), c)));

    let logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e",
      k,
      xk[0] !== undefined ? xk[0] : 0.0,
      yk[0] !== undefined ? -yk[0] : 0.0,
      pObj,
      pFeas,
      epsilonK
    );

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    // Gradient and updates
    const gradX = vectorAdd(c, mtmul(A, yk));
    const x_intermediate = vectorSub(xk, scale(gradX, eta));
    const xk_plus_1 = projNonNegative(x_intermediate);

    const x_extrapolated = vectorAdd(xk_plus_1, vectorSub(xk_plus_1, xk));
    const Ax_extrapolated = mvmul(A, x_extrapolated);
    const y_update_term = vectorSub(Ax_extrapolated, b);
    const yk_plus_1 = vectorAdd(yk, scale(y_update_term, tau));

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

  return [iterates, logs];
}

function pdhgInequalityForm(A: Matrix, b: number[], c: number[], options: PDHGCoreOptions) {
  const { maxit, eta, tau, tol, verbose } = options;

  const m = A.rows;
  const n = A.columns;

  let xk = new Array(n).fill(0.0);
  let yk = new Array(m).fill(1.0);
  let k = 1;

  let epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  const logs = [];

  const logHeader = sprintf("%5s %8s %8s %10s %10s %10s",
    'Iter', 'x', 'y', ' Obj', 'Infeas', 'eps');
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates = [];
  const startTime = performance.now();

  while (k <= maxit && epsilonK > tol) {
    iterates.push([...xk]);

    const pObj = dot(c, xk);
    const dObj = dot(b, yk);

    const Axk = mvmul(A, xk);
    const pFeasVal = normInf(projNonNegative(vectorSub(Axk, b)));
    const dFeasVal = normInf(projNonNegative(scale(yk, -1)));

    let logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e",
      k,
      xk[0] !== undefined ? xk[0] : 0.0,
      xk[1] !== undefined ? xk[1] : 0.0,
      pObj,
      pFeasVal,
      epsilonK
    );

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    // y update
    const Axk_minus_b = vectorSub(Axk, b);
    const y_intermediate = vectorAdd(yk, scale(Axk_minus_b, tau));
    const yk_plus_1 = projNonNegative(y_intermediate);

    // x update
    const y_extrapolated = vectorAdd(yk_plus_1, vectorSub(yk_plus_1, yk));
    const AT_y_extrapolated = mtmul(A, y_extrapolated);
    const gradX = vectorAdd(c, AT_y_extrapolated);
    const xk_plus_1 = vectorSub(xk, scale(gradX, eta));

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

  return [iterates, logs];
}
/**
 * Main PDHG interface.
 *
 * Usage for standard (equality-constrained) LP:
 *   pdhg(A_matrix_or_rows, b_vector, { ineq: false, maxit, eta, tau, verbose, tol })
 *
 * Usage for inequality-form:
 *   pdhg(rowsWithLastColumnAsB, c_vector, { ineq: true, maxit, eta, tau, verbose, tol })
 *
 * Usage for directly providing A, b, c for standard form:
 *   pdhg(A_matrixInstance, b_vector, { isStandardProblem: true, cStandard: c_vector, maxit, eta, tau, verbose, tol })
 */
export function pdhg(linesOrMatrixA: Matrix | number[][], objectiveOrVectorB: number[] | number[][], options: PDHGOptions) {
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
    const A_direct =
      linesOrMatrixA instanceof Matrix
        ? linesOrMatrixA
        : new Matrix(linesOrMatrixA);
    const b_direct = objectiveOrVectorB as number[];
    const c_direct = cStandard;
    return pdhgStandardForm(A_direct, b_direct, c_direct, solverOptions);
  }

  // Otherwise, interpret linesOrMatrixA as rows with last column = b
  const { A, b } = linesToAb(linesOrMatrixA);
  const c_objective = objectiveOrVectorB as number[];
  const m = A.rows;
  const n_orig = A.columns;

  if (ineq) {
    // For inequalities, we minimize c^T x subject to A x <= b
    // Convert to maximizing -c^T x subject to A x <= b, so dual flip sign of c
    const c_min = scale(c_objective, -1);
    return pdhgInequalityForm(A, b, c_min, solverOptions);
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
    const c_hat = [
      ...scale(c_objective, -1),
      ...c_objective,
      ...new Array(m).fill(0),
    ];

    const [chi_iterates, logs] = pdhgStandardForm(
      A_hat,
      b,
      c_hat,
      solverOptions
    );
    // Reconstruct x = x+ - x-
    const x_iterates = (chi_iterates as number[][]).map((chi_k: number[]) => {
      const x_plus = chi_k.slice(0, n_orig);
      const x_minus = chi_k.slice(n_orig, 2 * n_orig);
      return vectorSub(x_plus, x_minus);
    });

    return [x_iterates, logs];
  }
}