import { Matrix } from "ml-matrix";
import { sprintf } from "sprintf-js";
import { hstack, linesToAb, projectNonNegative, vstack } from "./utils/blas";
import type { Lines, VecN, Vec2N, Vec2Ns, VectorM, VectorN } from "./utils/blas";

const MAX_ITERATIONS_LIMIT = 2 ** 16;

export interface PDHGEqOptions {
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
}

function pdhgEpsilon(A: Matrix, b: VectorM, c: VectorN, xk: VectorN, yk: VectorM) {
  const primalFeasibility = Matrix.sub(A.mmul(xk), b).norm() / (1 + b.norm());
  const dualFeasibility = projectNonNegative(Matrix.sub(A.transpose().mmul(yk).mul(-1), c)).norm() / (1 + c.norm());
  const cTx = c.dot(xk);
  const bTy = b.dot(yk);
  const dualityGap = Math.abs(cTx + bTy) / (1 + Math.abs(cTx) + Math.abs(bTy));
  return primalFeasibility + dualFeasibility + dualityGap;
}

function pdhgStandardForm(A: Matrix, b: VectorM, c: VectorN, options: PDHGEqOptions) {
  const { maxit, eta, tau, tol, verbose } = options;

  const m = A.rows;
  const n = A.columns;

  let xk = Matrix.zeros(n, 1);
  let yk = Matrix.zeros(m, 1);
  let k = 1;

  let epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  const logs = [];

  const logHeader = sprintf("%5s %8s %8s %10s %10s %10s", "Iter", "x", "y", " Obj", "Infeas", "eps");
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates: Vec2Ns = [];
  const eps: number[] = [];
  const startTime = performance.now();

  while (k < maxit && epsilonK > tol) {
    iterates.push(xk.to1DArray());

    const pObj = -c.dot(xk);
    const pFeas = Matrix.sub(A.mmul(xk), b).max();
    let logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e", k, xk.get(0, 0), -yk.get(0, 0), pObj, pFeas, epsilonK);

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    // x_{k+1} = [x_k - η(c + A^T y_k)]_+
    const xk_plus_1 = projectNonNegative(Matrix.sub(xk, Matrix.add(c, A.transpose().mmul(yk)).mul(eta)));
    // x̃_k = x_{k+1} + (x_{k+1} - x_k)
    const x_extrapolated = Matrix.add(xk_plus_1, Matrix.sub(xk_plus_1, xk));
    // y_{k+1} = y_k + τ(Ax̃_k - b)
    const yk_plus_1 = Matrix.add(yk, Matrix.sub(A.mmul(x_extrapolated), b).mul(tau));

    eps.push(epsilonK);

    xk = xk_plus_1;
    yk = yk_plus_1;
    k++;

    epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  }

  const tsolve = (performance.now() - startTime).toFixed(2);
  const finalLogMsg = epsilonK <= tol ? `Converged to primal-dual optimal solution in ${tsolve}ms` : `Did not converge after ${iterates.length} iterations in ${tsolve}ms`;
  if (verbose) console.log(finalLogMsg);
  logs.push(finalLogMsg);

  return {
    iterations: iterates,
    logs: logs,
    eps,
  };
}

export function pdhgEq(lines: Lines, objective: VecN, options: PDHGEqOptions) {
  const { maxit = 1000, eta = 0.25, tau = 0.25, verbose = false, tol = 1e-4 } = options;
  if (maxit > MAX_ITERATIONS_LIMIT) throw new Error("maxit > 2^16 not allowed");

  const { A, b } = linesToAb(lines);
  const c = Matrix.columnVector(objective);
  const n_orig = A.columns;

  // x = x^+ - x^- where x^+, x^- ≥ 0
  // A(x^+ - x^-) = b becomes A[x^+; x^-; s] = b with slack s
  const A_hat = hstack(A, Matrix.mul(A, -1), Matrix.eye(A.rows));

  // ĉ = [-c; c; 0_m]
  const c_hat = vstack([Matrix.mul(c, -1), c, Matrix.zeros(A.rows, 1)]);
  const { iterations: chi_iterates, logs, eps } = pdhgStandardForm(A_hat, b, c_hat, { maxit, eta, tau, verbose, tol });

  // x = x^+ - x^-
  const x_iterates = chi_iterates.map((chi_k: Vec2N) => {
    const x_plus = Matrix.columnVector(chi_k.slice(0, n_orig));
    const x_minus = Matrix.columnVector(chi_k.slice(n_orig, 2 * n_orig));
    return x_plus.sub(x_minus).to1DArray();
  });

  return {
    iterations: x_iterates,
    logs,
    eps,
  };
}
