import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { dot, normInf, vectorAdd, vectorSub, scale, zeros, ones, copy, linesToAb } from '../utils/blas';
import { CentralPathOptions, CentralPathXkOptions } from '../types/solverOptions';
import { Lines, Vertices, VecM, VecN, VecNs } from '../types/arrays';

// --- Central Path specific functions ---
function centroid(vertices: Vertices) {
  if (!vertices || vertices.length === 0) return [0, 0]; // Default for 2D if no vertices
  const n = vertices[0].length;
  const summed = zeros(n);
  for (const v of vertices) {
    for (let i = 0; i < n; i++) {
      summed[i] += v[i];
    }
  }
  return scale(summed, 1.0 / vertices.length);
}

function centralPathFilter(lines: Lines, weights: VecM | null) {
  if (weights && lines.length !== weights.length) {
    throw new Error("Length of lines and weights must match");
  }
  if (!weights) {
    return { filteredLines: copy(lines), filteredWeights: ones(lines.length) };
  }
  
  const filteredLines = [];
  const filteredWeights = [];
  for (let i = 0; i < lines.length; i++) {
    if (weights[i] !== 0) {
      filteredLines.push(copy(lines[i]));
      filteredWeights.push(weights[i]);
    }
  }
  return { filteredLines, filteredWeights };
}

function centralPathMu(niter: number) {
  // Equivalent to Julia's: 10.0 .^ range(3, stop=-5, length=niter)
  if (niter <= 0) return [];
  if (niter === 1) return [1000.0]; // range(3, stop=-5, length=1) -> 3.0.  10^3 = 1000

  const mus: VecM = [];
  const startVal = 3.0;
  const stopVal = -5.0;
  const step = (stopVal - startVal) / (niter - 1);
  for (let i = 0; i < niter; i++) {
    mus.push(10.0 ** (startVal + i * step));
  }
  return mus;
}


function centralPathXk(Amatrix: Matrix, bVec: VecM, cVec: VecN, mu: number, x0Vec: VecN, opts: CentralPathXkOptions) {
  const { maxit, epsilon, verbose } = opts;
  
  let x = copy(x0Vec);

  // The Julia code has an assertion: @assert w == ones(m) "w must be ones"
  // It doesn't use 'w' in gradient/hessian calculation. We will omit 'w' parameter here
  // or assume it's implicitly ones for the barrier term sum(log(r_i)).

  function calculateObjective(currentX: number[]) {
    const Ax = Amatrix.mmul(Matrix.columnVector(currentX)).to1DArray();
    const r = vectorSub(bVec, Ax);
    if (r.some((ri: number) => ri <= 0)) {
      return -Infinity; // Outside domain
    }
    return dot(cVec, currentX) + mu * r.reduce((sum: number, ri: number) => sum + Math.log(ri), 0);
  }

  for (let k = 1; k <= maxit; k++) {
    const Ax_val = Amatrix.mmul(Matrix.columnVector(x)).to1DArray();
    const r = vectorSub(bVec, Ax_val);

    if (r.some((ri: number) => ri <= 0)) {
      console.error("Infeasible point encountered at iteration " + k);
      return null; // Or throw error as in Julia
    }

    const invR = r.map((ri: number) => 1.0 / ri);
    const invR2 = r.map((ri: number) => (1.0 / ri) ** 2);

    // Gradient: c - μ * Aᵀ * invR
    const AT_invR = Amatrix.transpose().mmul(Matrix.columnVector(invR)).to1DArray();
    const grad = vectorSub(cVec, scale(AT_invR, mu));

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
      const xNew = vectorAdd(x, scale(dx, alpha));
      const rNew = vectorSub(bVec, Amatrix.mmul(Matrix.columnVector(xNew)).to1DArray());
      if (rNew.every((ri: number) => ri > 1e-12)) { // Add small tolerance, strictly > 0
          break;
      }
      alpha *= 0.5;
      if (alpha < 1e-10) {
        console.error("Step size too small (domain) at iteration " + k);
        return null; // Or throw error
      }
      safetyBreaks++;
      if (safetyBreaks > 100) { // Prevent infinite loop
          console.error("Line search (domain) stuck at iteration " + k);
          return null;
      }
    }
    
    // Backtracking line search for sufficient increase (Armijo)
    const t = 0.5;  // Shrink factor for alpha
    const beta = 0.01; // Sufficient decrease parameter (typically small)
    const gradDotDx = dot(grad, dx);
    const fx = calculateObjective(x);
    if (fx === -Infinity) { // Should not happen if x is feasible
        console.error("Current point x is out of domain before backtracking at iteration " + k);
        return null;
    }

    safetyBreaks = 0;
    while (true) {
        const xNew = vectorAdd(x, scale(dx, alpha));
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
            // To match Julia's "error", we might return null. Or just proceed.
            // For now, let's break and use the alpha that keeps it in domain.
            break; 
        }
        safetyBreaks++;
        if (safetyBreaks > 100) { // Prevent infinite loop
          console.error("Line search (Armijo) stuck at iteration " + k);
          // Use current alpha that keeps it in domain if possible
          break;
        }
    }

    x = vectorAdd(x, scale(dx, alpha));

    if (normInf(grad) < epsilon) {
      if (verbose) console.log("Converged in " + k + " iterations with mu = " + mu);
      return x;
    }

    if (verbose) {
        const currentFx = calculateObjective(x); // Recalculate f(x) for logging
        // Ensure console.log can handle potentially large/formatted strings if sprintf is limited
        console.log(sprintf("Iter %d: f(x) = %.6f, ||grad||_inf = %.2e, alpha = %.2f", k, currentFx, normInf(grad), alpha));
    }
  }

  if (verbose) console.warn("Did not converge after " + maxit + " iterations for mu = " + mu);
  return null; // Did not converge
}


export function centralPath(vertices: Vertices, lines: Lines, objective: VecN, opts: CentralPathOptions) {
  const { niter, weights, verbose } = opts;

  if (niter > 2**10) {
    throw new Error("niter > 2^10 not allowed");
  }
  const tStart = Date.now();

  const { filteredLines, filteredWeights } = centralPathFilter(lines, weights);
  
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
  if (objective.length !== x0.length) { // Ensure x0 has correct dimension if objective implies n
      if (objective.length !== Amatrix.columns) {
          throw new Error("Objective vector dimension does not match number of variables in A.");
      }
      // If centroid was e.g. 2D but problem is higher-D from 'lines', re-init x0.
      // A simple (potentially naive) starting point if centroid is mismatched:
      if (x0.length !== Amatrix.columns) {
          console.warn(`Centroid dimension (${x0.length}) mismatch with problem dimension (${Amatrix.columns}). Re-initializing x0.`);
          x0 = zeros(Amatrix.columns);
      }
  }


  for (const muK of muValues) {
    const xk = centralPathXk(Amatrix, bVec, objective, muK, x0, { verbose, epsilon: 1e-4, maxit: 2000 }); // Pass relevant opts
    if (xk !== null && xk.length > 0) {
      const Ax = Amatrix.mmul(Matrix.columnVector(xk)).to1DArray();
      const r = vectorSub(bVec, Ax);
      const objectiveValue = dot(objective, xk);
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