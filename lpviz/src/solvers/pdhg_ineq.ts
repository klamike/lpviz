import { Matrix } from "ml-matrix";
import { sprintf } from "sprintf-js";
import { linesToAb, projectNonNegative } from "./utils/blas";
import type { Lines, VecN, Vec2Ns, VectorM, VectorN } from "./utils/blas";

const MAX_ITERATIONS_LIMIT = 2 ** 16;

interface PDHGIneqOptions {
  maxit: number;
  eta: number;
  tau: number;
  tol: number;
  verbose: boolean;
  showBasis: boolean;
}

function pdhgIneqEpsilon(A: Matrix, b: VectorM, c: VectorN, xk: VectorN, yk: VectorM) {
  const primalFeasibility = projectNonNegative(Matrix.sub(A.mmul(xk), b)).norm() / (1 + b.norm());
  const dualFeasibility = projectNonNegative(yk.mul(-1)).norm() / (1 + c.norm());
  yk.mul(-1); // put it back
  const cTx = c.dot(xk);
  const bTy = b.dot(yk);
  const dualityGap = Math.abs(bTy + cTx) / (1 + Math.abs(cTx) + Math.abs(bTy));
  return primalFeasibility + dualFeasibility + dualityGap;
}

function detectBasisIneq(yk: VectorM): Set<number> {
  const m = yk.rows;
  const basis = new Set<number>();

  for (let i = 0; i < m; i++) {
    const yi = yk.get(i, 0);
    if (yi > 1e-10) {
      basis.add(i);
    }
  }

  return basis;
}

function basisToColorIndex(basis: Set<number>, m: number, numColors: number): number {
  let value = 0;
  for (let i = 0; i < m; i++) {
    if (basis.has(i)) {
      value |= (1 << i);
    }
  }
  return value % numColors;
}

export function pdhgIneq(lines: Lines, objective: VecN, options: PDHGIneqOptions) {
  const { maxit = 1000, eta = 0.25, tau = 0.25, verbose = false, tol = 1e-4, showBasis = false } = options;
  if (maxit > MAX_ITERATIONS_LIMIT) throw new Error("maxit > 2^16 not allowed");

  const { A, b } = linesToAb(lines);
  const c = Matrix.mul(Matrix.columnVector(objective), -1);

  const m = A.rows;
  const n = A.columns;

  let xk = Matrix.zeros(n, 1);
  let yk = Matrix.ones(m, 1);
  let k = 1;

  let epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  const logs = [];

  const basisHeaderName = "basis";
  const padding = showBasis ? " ".repeat(Math.max(0, m - basisHeaderName.length)) : "";
  const paddedBasisTitle = showBasis ? (basisHeaderName + padding) : "";
  const logHeader = showBasis
    ? sprintf("%5s %8s %8s %10s %10s %10s %s", "Iter", "x", "y", " Obj", "Infeas", "eps", paddedBasisTitle)
    : sprintf("%5s %8s %8s %10s %10s %10s", "Iter", "x", "y", " Obj", "Infeas", "eps");
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates: Vec2Ns = [];
  const eps: number[] = [];
  const phases: number[] = [];

  let currentBasis = showBasis ? detectBasisIneq(yk) : new Set<number>();
  let currentColorIndex = 0;

  const startTime = performance.now();

  while (k <= maxit && epsilonK > tol) {
    iterates.push(xk.to1DArray());
    if (showBasis) {
      currentColorIndex = basisToColorIndex(currentBasis, m, 10);
      phases.push(currentColorIndex);
    }

    let logMsg: string;
    if (showBasis) {
      const basisString = Array.from({ length: m }, (_, i) => (currentBasis.has(i) ? "1" : "0")).join("");
      logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e %s", k, xk.get(0, 0), xk.rows > 1 ? xk.get(1, 0) : 0.0, c.dot(xk), projectNonNegative(Matrix.sub(A.mmul(xk), b)).max(), epsilonK, basisString);
    } else {
      logMsg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e", k, xk.get(0, 0), xk.rows > 1 ? xk.get(1, 0) : 0.0, c.dot(xk), projectNonNegative(Matrix.sub(A.mmul(xk), b)).max(), epsilonK);
    }
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

    if (showBasis) {
      currentBasis = detectBasisIneq(yk);
    }

    epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  }

  const tsolve = parseFloat((performance.now() - startTime).toFixed(2));
  const finalLogMsg = epsilonK <= tol ? `Converged to primal-dual optimal solution in ${tsolve}ms` : `Did not converge after ${iterates.length} iterations in ${tsolve}ms`;
  if (verbose) console.log(finalLogMsg);
  logs.push(finalLogMsg);

  return {
    iterations: iterates,
    logs: logs,
    eps,
    phases,
  };
}
