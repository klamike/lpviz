import { Matrix, solve } from "ml-matrix";
import { sprintf } from "sprintf-js";
import {
  Lines,
  VecN,
  VecNs,
  VectorM,
  VectorN,
  Vertices,
} from "../types/arrays";
import { diag, linesToAb } from "../utils/blas";

export interface CentralPathOptions {
  niter: number;
  verbose: boolean;
}

export interface CentralPathXkOptions {
  maxit: number;
  epsilon: number;
  verbose: boolean;
}

// Use Newton's method to solve for one point on the central path.
// An initial feasible point is required, initially set to the centroid of the vertices.
function centralPathXk(
  Amatrix: Matrix,
  bVec: VectorM,
  cVec: VectorN,
  mu: number,
  x0Vec: VectorN,
  opts: CentralPathXkOptions,
) {
  const { maxit, epsilon, verbose } = opts;

  let x = x0Vec.clone();

  // Calculate the objective function value (original + barrier term).
  function calculateObjective(currentX: VectorN) {
    const Ax = Amatrix.mmul(currentX);
    const r = Matrix.sub(bVec, Ax);
    if (r.min() <= 0) {
      return -Infinity;
    }
    return cVec.dot(currentX) + mu * r.log().sum();
  }

  for (let k = 1; k <= maxit; k++) {
    // Residual: b - Ax
    const Ax_val = Amatrix.mmul(x);
    const r = Matrix.sub(bVec, Ax_val);

    if (r.min() <= 0) {
      console.error("Infeasible point encountered at iteration " + k);
      return null;
    }

    const invR = Matrix.pow(r, -1);
    const invR2 = Matrix.pow(invR, 2);

    // Gradient: c - μ * Aᵀ * (1 / r)
    const AT_invR = Amatrix.transpose().mmul(invR);
    const grad = Matrix.sub(cVec, AT_invR.mul(mu));

    // Hessian: μ * Aᵀ * diag(1 / r^2) * A
    const invR2_diag = diag(invR2);
    const AT_diag_invR2 = Amatrix.transpose().mmul(invR2_diag);
    const hess = AT_diag_invR2.mmul(Amatrix).mul(mu); // hessian is n x n

    let dx: VectorN;
    try {
      // Newton step: dx = hess \ grad  => solve(hess, grad)
      dx = solve(hess, grad);
    } catch (e) {
      console.error("Error solving Newton system at iteration " + k + ": " + e);
      return null;
    }

    // Line search to stay in domain
    let alpha = 1.0;
    let safetyBreaks = 0;
    while (true) {
      const xNew = Matrix.add(x, Matrix.mul(dx, alpha));
      const rNew = Matrix.sub(bVec, Amatrix.mmul(xNew));
      if (rNew.min() > 1e-12) {
        // Add small tolerance, strictly > 0
        break;
      }
      alpha *= 0.5;
      if (alpha < 1e-10) {
        console.error("Step size too small (domain) at iteration " + k);
        return null;
      }
      safetyBreaks++;
      if (safetyBreaks > 100) {
        console.error("Line search (domain) stuck at iteration " + k);
        return null;
      }
    }

    // Backtracking line search for sufficient increase (Armijo)
    const t = 0.5; // Shrink factor for alpha
    const beta = 0.01; // Sufficient decrease parameter (typically small)
    const gradDotDx = grad.dot(dx);
    const fx = calculateObjective(x);
    if (fx === -Infinity) {
      // Should not happen if x is feasible
      console.error(
        "Current point x is out of domain before backtracking at iteration " +
          k,
      );
      return null;
    }

    safetyBreaks = 0;
    while (true) {
      const xNew = Matrix.add(x, Matrix.mul(dx, alpha));
      const fxNew = calculateObjective(xNew);

      if (fxNew === -Infinity) {
        // Still possible if alpha makes it jump out
        alpha *= t;
      } else if (fxNew >= fx + beta * alpha * gradDotDx) {
        break;
      } else {
        alpha *= t;
      }

      if (alpha < 1e-10) {
        // It might be okay to proceed if domain line search found a valid alpha,
        // but if Armijo fails to make progress, then it's an issue.
        if (verbose)
          console.warn(
            "Step size too small (Armijo) at iteration " +
              k +
              ", using best alpha from domain search.",
          );
        break;
      }
      safetyBreaks++;
      if (safetyBreaks > 100) {
        console.error("Line search (Armijo) stuck at iteration " + k);
        // Use current alpha that keeps it in domain if possible
        break;
      }
    }

    x = Matrix.add(x, Matrix.mul(dx, alpha));

    if (grad.max() < epsilon) {
      if (verbose)
        console.log("Converged in " + k + " iterations with mu = " + mu);
      return x;
    }

    if (verbose) {
      const currentFx = calculateObjective(x);
      console.log(
        sprintf(
          "Iter %d: f(x) = %.6f, ||grad||_inf = %.2e, alpha = %.2f",
          k,
          currentFx,
          grad.max(),
          alpha,
        ),
      );
    }
  }

  if (verbose)
    console.warn(
      "Did not converge after " + maxit + " iterations for mu = " + mu,
    );
  return null; // Did not converge
}

// Compute the central path, using Newton's method to solve for each point.
export function centralPath(
  vertices: Vertices,
  lines: Lines,
  objective: VecN,
  opts: CentralPathOptions,
) {
  const { niter, verbose } = opts;

  if (niter > 2 ** 10) {
    throw new Error("niter > 2^10 not allowed");
  }
  const tStart = Date.now();

  const { A, b } = linesToAb(lines);
  const c = Matrix.columnVector(objective);
  const muValues = centralPathMu(niter);

  const centralPathArray: VecNs = [];
  const logs: string[] = [];

  let logMsg = sprintf(
    "  %-4s %8s %8s %10s %10s  \n",
    "Iter",
    "x",
    "y",
    "Obj",
    "µ",
  );
  if (verbose) console.log(logMsg);
  logs.push(logMsg);

  let x0 = centroid(vertices);

  for (const muK of muValues) {
    const xk = centralPathXk(A, b, c, muK, x0, {
      verbose,
      epsilon: 1e-4,
      maxit: 2000,
    }); // Pass relevant opts
    if (xk !== null && xk.rows > 0) {
      const Ax = A.mmul(xk);
      const r = Matrix.sub(b, Ax);
      const objectiveValue = c.dot(xk);
      const barrierTerm = muK * r.log().sum();
      const totalObjective = objectiveValue + barrierTerm;

      const extendedPoint = [...xk.to1DArray(), totalObjective];
      centralPathArray.push(extendedPoint);

      const x_val = xk.get(0, 0) !== undefined ? xk.get(0, 0) : 0;
      const y_val = xk.get(1, 0) !== undefined ? xk.get(1, 0) : 0;
      logMsg = sprintf(
        "  %-4d %+8.2f %+8.2f %+10.1e %10.1e  \n",
        centralPathArray.length,
        x_val,
        y_val,
        objectiveValue,
        muK,
      );
      if (verbose) console.log(logMsg);
      logs.push(logMsg);
      x0 = xk;
    } else {
      if (verbose) console.log(`Failed to find x_k for mu = ${muK}. Skipping.`);
    }
  }
  const tsolve = (Date.now() - tStart) / 1000.0; // seconds
  return { iterations: centralPathArray, logs: logs, tsolve: tsolve };
}

// Compute the centroid of the vertices. Used to initialize the centralPath solver.
function centroid(vertices: Vertices) {
  // if (!vertices || vertices.length === 0) return [0, 0];
  const n = vertices[0].length;
  const summed = Matrix.zeros(n, 1);
  for (const v of vertices) {
    for (let i = 0; i < n; i++) {
      summed.set(i, 0, summed.get(i, 0) + v[i]);
    }
  }
  return summed.div(vertices.length);
}

// Compute the barrier parameter values for the central path.
// This is logspaced 10^3 to 10^-5.
function centralPathMu(niter: number) {
  if (niter <= 0) return [];
  if (niter === 1) return [1000.0];

  const mus = [];
  const startVal = 3.0;
  const stopVal = -5.0;
  const step = (stopVal - startVal) / (niter - 1);
  for (let i = 0; i < niter; i++) {
    mus.push(10.0 ** (startVal + i * step));
  }
  return mus;
}
