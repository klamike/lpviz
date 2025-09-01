import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { linesToAb, diag, vstack, vslice } from '../utils/blas';
import { IPMOptions } from '../types/solverOptions';
import { Lines, VecM, VecN, VectorM, VectorN } from '../types/arrays';

// High-level interface for the IPM solver.
// Converts to the proper form for the core solver.
export function ipm(lines: Lines, objective: VecN, opts: IPMOptions) {
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, verbose } = opts;

  if (maxit > 2 ** 16) {
    throw new Error('maxit > 2^16 not allowed');
  }

  const { A, b: bArray } = linesToAb(lines);
  const b = Matrix.columnVector(bArray);
  const c = Matrix.columnVector(objective);

  // Convert   A x ≤ b,  max c^T x   →   −A x ≥ −b,  min −c^T x
  // const Aneg = A.to2DArray().map(row => row.map(v => -v)); // TODO: just keep it a matrix
  const Aneg = A.mul(-1);
  const bneg = b.mul(-1);
  const cneg = c.mul(-1);

  return ipmCore(Aneg, bneg, cneg, {
    eps_p,
    eps_d,
    eps_opt,
    maxit,
    alphaMax,
    verbose,
  });
}

function ipmCore(A: Matrix, b: VectorM, c: VectorN, opts: IPMOptions) {
  const {
    eps_p,
    eps_d,
    eps_opt,
    maxit,
    alphaMax,
    verbose,
  } = opts;
  const m = A.rows; // inequalities
  const n = A.columns; // variables

  const res = {
    iterates: {
      solution:  { x: [] as VecN[], s: [] as VecM[], y: [] as VecM[], mu: [] as VecM, log: [] as string[] },
      predictor: { x: [] as VecN[], s: [] as VecM[], y: [] as VecM[], mu: [] as VecM },
      corrector: { x: [] as VecN[], s: [] as VecM[], y: [] as VecM[], mu: [] as VecM },
    },
  };

  // Initial primal / dual guesses -----------------------------------
  let x = Matrix.zeros(n, 1);
  let s = Matrix.ones(m, 1);
  let y = Matrix.ones(m, 1);

  let deltaAff = Matrix.zeros(n + m + m, 1);
  let deltaCor = Matrix.zeros(n + m + m, 1);

  let niter = 0;
  let converged = false;
  const t0 = Date.now();

  // -----------------------------------------------------------------
  const banner = sprintf(
    "%5s %8s %8s %10s %10s %10s\n",
    'Iter', 'x', 'y', 'Obj', 'Infeas', ' µ',
  );
  if (verbose) console.log(banner);
  res.iterates.solution.log.push(banner);

  while (niter <= maxit) {
    // Residuals, duality gap ----------------------------------------
    
    // Primal Residual: b - (Ax - s)
    const r_p = Matrix.sub(b, Matrix.sub(A.mmul(x), s));
    
    // Dual Residual: c - Aᵀy
    const r_d = Matrix.sub(c, A.transpose().mmul(y));
    
    // Barrier parameter: s'y / m
    const mu   = s.dot(y) / m;

    // Objective: c'x
    const pObj = c.dot(x);

    // Objective gap: |c'x - b'y| / (1 + |c'x|)
    const gap  = Math.abs(pObj - b.dot(y)) / (1 + Math.abs(pObj));

    // Log current iterate -------------------------------------------
    logIter(res.iterates.solution, verbose, x, mu, pObj, r_p.max());
    pushIter(res.iterates.solution, x, s, y, mu);

    // Check convergence ---------------------------------------------
    // Primal residual: |b - Ax| <= eps_p
    // Dual residual: |c - Aᵀy| <= eps_d
    // Objective gap: |c'x - b'y| / (1 + |c'x|) <= eps_opt
    if (r_p.max() <= eps_p && r_d.max() <= eps_d && gap <= eps_opt) {
      converged = true;
      break;
    }

    if (++niter > maxit) break;

    // Compute Newton step -------------------------------------------

    // Assemble Newton KKT matrix K ----------------------------------
    const Y = diag(y);
    const S = diag(s);
    const K = Matrix.zeros(m + n + m, n + m + m);

    // Block [A  -I  0]
    for (let i = 0; i < m; ++i) {
      for (let j = 0; j < n; ++j) K.set(i, j, A.get(i, j));
      K.set(i, n + i, -1);
    }

    // Block [0  0  Aᵀ]
    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < m; ++j) K.set(m + i, n + m + j, A.get(j, i));
    }

    // Block [0  Y  S]
    for (let i = 0; i < m; ++i) {
      K.set(m + n + i, n + i, Y.get(i, i));
      K.set(m + n + i, n + m + i, S.get(i, i));
    }

    // Assembled matrix K: [A  -I  0 ]
    //                     [0   0  Aᵀ]
    //                     [0   Y  S ]

    // Predictor (affine scaling direction) --------------------------
    // rhsAff: [
    //   b - Ax
    //   c - Aᵀy
    //   -s * y
    // ]
    const rhsAff = vstack([
      r_p,
      r_d,
      Matrix.mul(Matrix.mul(s, -1), y)
    ]);
    
    // Solve K * deltaAff = rhsAff
    deltaAff = solve(K, rhsAff);
    const dxAff = vslice(deltaAff, 0, n);
    const dsAff = vslice(deltaAff, n, n + m);
    const dyAff = vslice(deltaAff, n + m, n + m + m);

    // Compute step sizes --------------------------------------------
    const alphaP = alphaStep(s, dsAff);
    const alphaD = alphaStep(y, dyAff);
    const sds = Matrix.add(s, Matrix.mul(dsAff, alphaP));
    const sdy = Matrix.add(y, Matrix.mul(dyAff, alphaD));
    const muAff = sds.dot(sdy) / m;

    // Log predictor -------------------------------------------------
    pushIter(res.iterates.predictor, dxAff, dsAff, dyAff, muAff);

    // Corrector -----------------------------------------------------
    let dx: VectorN, ds: VectorM, dy: VectorM, stepP: number, stepD: number;
    if (!(alphaP >= 0.9 && alphaD >= 0.9)) {
      // Compute corrector (if needed) -------------------------------
      // sigma = (muAff / mu)^3 clamped to [1e-8, 1 - 1e-8]
      const sigma = Math.max(1e-8, Math.min(1 - 1e-8, (muAff / mu) ** 3));
      
      // rhsCor: [
      //   0
      //   0
      //   sigma * mu - ds * dy
      // ]
      const rhsCor = vstack([
        Matrix.zeros(m, 1),
        Matrix.zeros(n, 1),
        // -1 * (ds * dy - sigma * mu)
        Matrix.mul(Matrix.sub(Matrix.mul(dsAff, dyAff), sigma * mu), -1)
      ]);
      
      // Solve K * deltaCor = rhsCor
      deltaCor = solve(K, rhsCor);
      
      // Apply corrector step
      dx = Matrix.add(dxAff, vslice(deltaCor, 0, n));
      ds = Matrix.add(dsAff, vslice(deltaCor, n, n + m));
      dy = Matrix.add(dyAff, vslice(deltaCor, n + m, n + m + m));

      pushIter(res.iterates.corrector, dx, ds, dy, mu);
    } else {
      // No corrector needed
      dx = dxAff;
      ds = dsAff;
      dy = dyAff;
      pushIter(res.iterates.corrector, Matrix.zeros(n, 1), Matrix.zeros(m, 1), Matrix.zeros(m, 1), mu);
    }
    
    // Compute final step sizes
    stepP = alphaMax * alphaStep(s, ds);
    stepD = alphaMax * alphaStep(y, dy);

    // Take the step --------------------------------------------------
    x = Matrix.add(x, Matrix.mul(dx, stepP));
    s = Matrix.add(s, Matrix.mul(ds, stepP));
    y = Matrix.add(y, Matrix.mul(dy, stepD));
  }

  const tSolve = Math.round((Date.now() - t0) * 10) / 10; // ms, one decimal
  logFinal(res.iterates.solution, verbose, converged, tSolve);
  return res;
}


// Compute maximum step length α so that x + α*dx ≥ 0
// FIXME: avoid to1DArray?
function alphaScalar(xi: number, dxi: number) {
  return dxi >= 0 ? 1.0 : -xi / dxi;
}
function alphaStep(x: VectorN, dx: VectorN) {
  return Math.min(1.0, Math.min(...x.to1DArray().map((xi: number, i: number) => alphaScalar(xi, dx.get(i, 0)))));
}

function pushIter(d: any, x: VectorN, s: VectorM, y: VectorM, mu: number) {
  d.x.push(x.to1DArray());
  d.s.push(s.to1DArray());
  d.y.push(y.to1DArray());
  d.mu.push(mu);
}
  
function logIter(d: any, verbose: boolean, x: VectorN, mu: number, pObj: number, pRes: number) {
  const msg = sprintf(
    "%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e\n",
    d.x.length, x.get(0, 0), x.get(1, 0), -pObj, pRes, mu,
  );
  if (verbose) console.log(msg);
  d.log.push(msg);
}

function logFinal(d: any, verbose: boolean, converged: boolean, tSolve: number) {
  const msg = converged
    ? `Converged to primal-dual optimal solution in ${tSolve} ms\n`
    : `Did not converge after ${d.x.length - 1} iterations in ${tSolve} ms\n`;
  if (verbose) console.log(msg);
  d.log.push(msg);
}