import { Matrix } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { linesToAb, projectNonNegative } from '../utils/blas';
import { Lines, VecN, Vec2Ns, VectorM, VectorN } from '../types/arrays';

const MAX_ITERATIONS_LIMIT = 2 ** 16;

export interface PDHGIneqOptions {
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
}

// ε = ||[Ax - b]_+||/(1 + ||b||) + ||[-y]_+||/(1 + ||c||) + |-b^T y + c^T x|/(1 + |c^T x| + |b^T y|)
function pdhgIneqEpsilon(A: Matrix, b: VectorM, c: VectorN, xk: VectorN, yk: VectorM) {
  const Ax = A.mmul(xk);
  const primalFeasibility = projectNonNegative(Matrix.sub(Ax, b)).norm() / (1 + b.norm());
  const dualFeasibility = projectNonNegative(yk.mul(-1)).norm() / (1 + c.norm());
  yk.mul(-1) // put it back

  const cTx = c.dot(xk);
  const bTy = b.dot(yk);
  const dualityGap = Math.abs(-bTy + cTx) / (1 + Math.abs(cTx) + Math.abs(bTy));

  return primalFeasibility + dualFeasibility + dualityGap;
}

// min c^T x s.t. Ax ≤ b, x ≥ 0
export function pdhgIneq(lines: Lines, objective: VecN, options: PDHGIneqOptions) {
  const {
    maxit = 1000,
    eta = 0.25,
    tau = 0.25,
    verbose = false,
    tol = 1e-4,
  } = options;

  if (maxit > MAX_ITERATIONS_LIMIT) {
    throw new Error("maxit > 2^16 not allowed");
  }

  const { A, b } = linesToAb(lines);
  const c = Matrix.mul(Matrix.columnVector(objective), -1);

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
  const eps: number[] = [];
  const startTime = performance.now();

  while (k <= maxit && epsilonK > tol) {
    iterates.push(xk.to1DArray());

    const pObj = c.dot(xk);
    const pFeasVal = projectNonNegative(Matrix.sub(A.mmul(xk), b)).max();

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

    // y_{k+1} = [y_k + τ(Ax_k - b)]_+
    const yk_plus_1 = projectNonNegative(Matrix.add(yk, Matrix.sub(A.mmul(xk), b).mul(tau)));

    // ỹ_k = y_{k+1} + (y_{k+1} - y_k)
    const y_extrapolated = Matrix.add(yk_plus_1, Matrix.sub(yk_plus_1, yk));
    // x_{k+1} = x_k - η(c + A^T ỹ_k)
    const xk_plus_1 = Matrix.sub(xk, Matrix.add(c, A.transpose().mmul(y_extrapolated)).mul(eta));

    eps.push(epsilonK);

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
    logs: logs,
    eps
  };
}
