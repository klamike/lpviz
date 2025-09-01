import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { vdot, vnormInf, vadd, vsub, vscale, vzeros, vones, vcopy, linesToAb } from '../utils/blas';
import { CentralPathOptions, CentralPathXkOptions } from '../types/solverOptions';
import { Lines, Vertices, VecM, VecN, VecNs } from '../types/arrays';

// Use Newton's method to solve for one point on the central path.
// An initial feasible point is required, initially set to the centroid of the vertices.
function centralPathXk(Amatrix: Matrix, bVec: VecM, cVec: VecN, mu: number, x0Vec: VecN, opts: CentralPathXkOptions) {
  const { maxit, epsilon, verbose } = opts;
  
  let x = vcopy(x0Vec);

  // Calculate the objective function value (original + barrier term).
  function calculateObjective(currentX: number[]) {
    const Ax = Amatrix.mmul(Matrix.columnVector(currentX)).to1DArray();
    const r = vsub(bVec, Ax);
    if (r.some((ri: number) => ri <= 0)) {
      return -Infinity;
    }
    return vdot(cVec, currentX) + mu * r.reduce((sum: number, ri: number) => sum + Math.log(ri), 0);
  }

  for (let k = 1; k <= maxit; k++) {
    // Residual: b - Ax
    const Ax_val = Amatrix.mmul(Matrix.columnVector(x)).to1DArray();
    const r = vsub(bVec, Ax_val);

    if (r.some((ri: number) => ri <= 0)) {
      console.error("Infeasible point encountered at iteration " + k);
      return null;
    }

    const invR = r.map((ri: number) => 1.0 / ri);
    const invR2 = r.map((ri: number) => (1.0 / ri) ** 2);

    // Gradient: c - μ * Aᵀ * invR
    const AT_invR = Amatrix.transpose().mmul(Matrix.columnVector(invR)).to1DArray();
    const grad = vsub(cVec, vscale(AT_invR, mu));

    // Hessian: μ * Aᵀ * diag(invR2) * A
    const invR2_diag = Matrix.diag(invR2);
    const AT_diag_invR2 = Amatrix.transpose().mmul(invR2_diag);
    const hess = AT_diag_invR2.mmul(Amatrix).mul(mu); // hessian is n x n

    let dx: VecN;
    try {
        // Newton step: dx = hess \ grad  => solve(hess, grad)
        dx = solve(hess, Matrix.columnVector(grad)).to1DArray();
    } catch (e) {
        console.error("Error solving Newton system at iteration " + k + ": " + e);
        return null;
    }


    // Line search to stay in domain
    let alpha = 1.0;
    let safetyBreaks = 0;
    while (true) {
      const xNew = vadd(x, vscale(dx, alpha));
      const rNew = vsub(bVec, Amatrix.mmul(Matrix.columnVector(xNew)).to1DArray());
      if (rNew.every((ri: number) => ri > 1e-12)) { // Add small tolerance, strictly > 0
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
    const t = 0.5;  // Shrink factor for alpha
    const beta = 0.01; // Sufficient decrease parameter (typically small)
    const gradDotDx = vdot(grad, dx);
    const fx = calculateObjective(x);
    if (fx === -Infinity) { // Should not happen if x is feasible
        console.error("Current point x is out of domain before backtracking at iteration " + k);
        return null;
    }

    safetyBreaks = 0;
    while (true) {
        const xNew = vadd(x, vscale(dx, alpha));
        const fxNew = calculateObjective(xNew);

        if (fxNew === -Infinity) { // Still possible if alpha makes it jump out
             alpha *= t;
        } else if (fxNew >= fx + beta * alpha * gradDotDx) { // Note: Julia uses `<` for min problem, `>` for max. Here, we maximize.
            break;
        } else {
            alpha *= t;
        }
        
        if (alpha < 1e-10) {
            // It might be okay to proceed if domain line search found a valid alpha,
            // but if Armijo fails to make progress, then it's an issue.
            if (verbose) console.warn("Step size too small (Armijo) at iteration " + k + ", using best alpha from domain search.");
            break; 
        }
        safetyBreaks++;
        if (safetyBreaks > 100) {
          console.error("Line search (Armijo) stuck at iteration " + k);
          // Use current alpha that keeps it in domain if possible
          break;
        }
    }

    x = vadd(x, vscale(dx, alpha));

    if (vnormInf(grad) < epsilon) {
      if (verbose) console.log("Converged in " + k + " iterations with mu = " + mu);
      return x;
    }

    if (verbose) {
        const currentFx = calculateObjective(x);
        console.log(sprintf("Iter %d: f(x) = %.6f, ||grad||_inf = %.2e, alpha = %.2f", k, currentFx, vnormInf(grad), alpha));
    }
  }

  if (verbose) console.warn("Did not converge after " + maxit + " iterations for mu = " + mu);
  return null; // Did not converge
}


// Compute the central path, using Newton's method to solve for each point.
export function centralPath(vertices: Vertices, lines: Lines, objective: VecN, opts: CentralPathOptions) {
  const { niter, weights, verbose } = opts;

  if (niter > 2**10) {
    throw new Error("niter > 2^10 not allowed");
  }
  const tStart = Date.now();

  const { filteredLines, filteredWeights } = centralPathFilter(lines, weights);
  // TODO: implement the weighted central path and enable it in the UI
  
  if (filteredLines.length === 0) {
      console.warn("No lines remaining after filtering. Returning empty path.");
      return { iterations: [] as VecNs, logs: ["No lines to process after filtering."], tsolve: 0 };
  }

  const { A: Araw, b: bVec } = linesToAb(filteredLines);
  const Amatrix = new Matrix(Araw);
  const muValues = centralPathMu(niter);

  const centralPathArray: VecNs = [];
  const logs: string[] = [];
  
  let logMsg = sprintf("  %-4s %8s %8s %10s %10s  \n", "Iter", "x", "y", "Obj", "µ");
  if (verbose) console.log(logMsg);
  logs.push(logMsg);

  let x0 = centroid(vertices);

  for (const muK of muValues) {
    const xk = centralPathXk(Amatrix, bVec, objective, muK, x0, { verbose, epsilon: 1e-4, maxit: 2000 }); // Pass relevant opts
    if (xk !== null && xk.length > 0) {
      const Ax = Amatrix.mmul(Matrix.columnVector(xk)).to1DArray();
      const r = vsub(bVec, Ax);
      const objectiveValue = vdot(objective, xk);
      const barrierTerm = muK * r.reduce((sum: number, ri: number) => sum + Math.log(ri), 0);
      const totalObjective = objectiveValue + barrierTerm;
      
      const extendedPoint = [...xk, totalObjective];
      centralPathArray.push(extendedPoint);
      
      const x_val = xk[0] !== undefined ? xk[0] : 0;
      const y_val = xk[1] !== undefined ? xk[1] : 0;
      logMsg = sprintf("  %-4d %+8.2f %+8.2f %+10.1e %10.1e  \n", 
                       centralPathArray.length, 
                       x_val, 
                       y_val, 
                       objectiveValue, 
                       muK);
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
  if (!vertices || vertices.length === 0) return [0, 0];
  const n = vertices[0].length;
  const summed = vzeros(n);
  for (const v of vertices) {
    for (let i = 0; i < n; i++) {
      summed[i] += v[i];
    }
  }
  return vscale(summed, 1.0 / vertices.length);
}

// Filter the lines to only include those with non-zero weights.
// Used to implement the weighted central path.
// NOTE: weighted central path is not fully implemented.
function centralPathFilter(lines: Lines, weights: VecM | null) {
  if (weights && lines.length !== weights.length) {
    throw new Error("Length of lines and weights must match");
  }
  if (!weights) {
    return { filteredLines: vcopy(lines), filteredWeights: vones(lines.length) };
  }
  
  const filteredLines = [];
  const filteredWeights = [];
  for (let i = 0; i < lines.length; i++) {
    if (weights[i] !== 0) {
      filteredLines.push(vcopy(lines[i]));
      filteredWeights.push(weights[i]);
    }
  }
  return { filteredLines, filteredWeights };
}

// Compute the barrier parameter values for the central path.
// This is logspaced 10^3 to 10^-5.
function centralPathMu(niter: number) {
  if (niter <= 0) return [];
  if (niter === 1) return [1000.0];

  const mus: VecM = [];
  const startVal = 3.0;
  const stopVal = -5.0;
  const step = (stopVal - startVal) / (niter - 1);
  for (let i = 0; i < niter; i++) {
    mus.push(10.0 ** (startVal + i * step));
  }
  return mus;
}