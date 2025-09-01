import { Matrix } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { vdot, vnormInf, vadd, vsub, vscale, vnorm, vprojNonNegative, linesToAb, mvmul, mtmul } from '../utils/blas';
import { PDHGCoreOptions, PDHGOptions } from '../types/solverOptions';
import { ArrayMatrix, VecM, VecN, Vec2N, Vec2Ns } from '../types/arrays';

function pdhgEpsilon(A: Matrix, b: VecM, c: VecN, xk: VecN, yk: VecM) {
  const Ax = mvmul(A, xk);
  const primalFeasNum = vnorm(vsub(Ax, b));
  const primalFeasDen = 1 + vnorm(b);
  const primalFeasibility = primalFeasNum / primalFeasDen;

  const ATy = mtmul(A, yk);
  const negATy_minus_c = vsub(vscale(ATy, -1), c);
  const dualFeasNum = vnorm(vprojNonNegative(negATy_minus_c));
  const dualFeasDen = 1 + vnorm(c);
  const dualFeasibility = dualFeasNum / dualFeasDen;

  const cTx = vdot(c, xk);
  const bTy = vdot(b, yk);
  const dualityGapNum = Math.abs(cTx + bTy);
  const dualityGapDen = 1 + Math.abs(cTx) + Math.abs(bTy);
  const dualityGap = dualityGapNum / dualityGapDen;

  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgIneqEpsilon(A: Matrix, b: VecM, c: VecN, xk: VecN, yk: VecM) {
  const Ax = mvmul(A, xk);
  const Ax_minus_b = vsub(Ax, b);
  const primalFeasNum = vnorm(vprojNonNegative(Ax_minus_b));
  const primalFeasDen = 1 + vnorm(b);
  const primalFeasibility = primalFeasNum / primalFeasDen;

  const dualFeasNum = vnorm(vprojNonNegative(vscale(yk, -1)));
  const dualFeasDen = 1 + vnorm(c);
  const dualFeasibility = dualFeasNum / dualFeasDen;

  const cTx = vdot(c, xk);
  const bTy = vdot(b, yk);
  const dualityGapNum = Math.abs(bTy + cTx);
  const dualityGapDen = 1 + Math.abs(cTx) + Math.abs(bTy);
  const dualityGap = dualityGapNum / dualityGapDen;

  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgStandardForm(A: Matrix, b: VecM, c: VecN, options: PDHGCoreOptions) {
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

  const iterates: Vec2Ns = [];
  const startTime = performance.now();

  while (k < maxit && epsilonK > tol) {
    iterates.push([...xk]);

    const pObj = -vdot(c, xk);
    const dObj = -vdot(b, yk);
    const A_xk = mvmul(A, xk);
    const pFeas = vnormInf(vsub(A_xk, b));
    const AT_yk = mtmul(A, yk);
    const dFeas = vnormInf(vprojNonNegative(vsub(vscale(AT_yk, -1), c)));

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
    const gradX = vadd(c, mtmul(A, yk));
    const x_intermediate = vsub(xk, vscale(gradX, eta));
    const xk_plus_1 = vprojNonNegative(x_intermediate);

    const x_extrapolated = vadd(xk_plus_1, vsub(xk_plus_1, xk));
    const Ax_extrapolated = mvmul(A, x_extrapolated);
    const y_update_term = vsub(Ax_extrapolated, b);
    const yk_plus_1 = vadd(yk, vscale(y_update_term, tau));

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

  // return [iterates, logs];
  return {
    iterations: iterates,
    logs: logs
  };
}

function pdhgInequalityForm(A: Matrix, b: VecM, c: VecN, options: PDHGCoreOptions) {
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

  const iterates: Vec2Ns = [];
  const startTime = performance.now();

  while (k <= maxit && epsilonK > tol) {
    iterates.push([...xk]);

    const pObj = vdot(c, xk);
    const dObj = vdot(b, yk);

    const Axk = mvmul(A, xk);
    const pFeasVal = vnormInf(vprojNonNegative(vsub(Axk, b)));
    const dFeasVal = vnormInf(vprojNonNegative(vscale(yk, -1)));

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
    const Axk_minus_b = vsub(Axk, b);
    const y_intermediate = vadd(yk, vscale(Axk_minus_b, tau));
    const yk_plus_1 = vprojNonNegative(y_intermediate);

    // x update
    const y_extrapolated = vadd(yk_plus_1, vsub(yk_plus_1, yk));
    const AT_y_extrapolated = mtmul(A, y_extrapolated);
    const gradX = vadd(c, AT_y_extrapolated);
    const xk_plus_1 = vsub(xk, vscale(gradX, eta));

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

  // return [iterates, logs];
  return {
    iterations: iterates,
    logs: logs
  };
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
    const A_direct =
      linesOrMatrixA instanceof Matrix
        ? linesOrMatrixA
        : new Matrix(linesOrMatrixA);
    const b_direct: VecM = objectiveOrVectorB;
    const c_direct = cStandard;
    return pdhgStandardForm(A_direct, b_direct, c_direct, solverOptions);
  }

  // Otherwise, interpret linesOrMatrixA as rows with last column = b
  const { A, b } = linesToAb(linesOrMatrixA);
  const c_objective: VecN = objectiveOrVectorB;
  const m = A.rows;
  const n_orig = A.columns;

  if (ineq) {
    // For inequalities, we minimize c^T x subject to A x <= b
    // Convert to maximizing -c^T x subject to A x <= b, so dual flip sign of c
    const c_min = vscale(c_objective, -1);
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
      ...vscale(c_objective, -1),
      ...c_objective,
      ...new Array(m).fill(0),
    ];

    const { iterations: chi_iterates, logs } = pdhgStandardForm(
      A_hat,
      b,
      c_hat,
      solverOptions
    );
    // Reconstruct x = x+ - x-
    const x_iterates = chi_iterates.map((chi_k: Vec2N) => {
      const x_plus: VecN = chi_k.slice(0, n_orig);
      const x_minus: VecN = chi_k.slice(n_orig, 2 * n_orig);
      return vsub(x_plus, x_minus);
    });

    // return [x_iterates, logs];
    return {
      iterations: x_iterates,
      logs
    };
  }
}