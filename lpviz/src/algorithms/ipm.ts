import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { vzeros, vones, vcopy, vdot, vnormInf, vadd, vsub, vscale, linesToAb, vmult } from '../utils/blas';
import { IPMOptions } from '../types/solverOptions';
import { Lines, VecM, VecN, ArrayMatrix } from '../types/arrays';

// High-level interface for the IPM solver.
// Converts to the proper form for the core solver.
export function ipm(lines: Lines, objective: VecN, opts: IPMOptions) {
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, verbose } = opts;

  if (maxit > 2 ** 16) {
    throw new Error('maxit > 2^16 not allowed');
  }

  const { A, b } = linesToAb(lines);

  // Convert   A x ≤ b,  max c^T x   →   −A x ≥ −b,  min −c^T x
  // const Aneg = A.to2DArray().map(row => row.map(v => -v)); // TODO: just keep it a matrix
  const Aneg = A.mul(-1);
  const bneg = b.map((v: number) => -v);
  const cneg = objective.map(v => -v);

  return ipmCore(Aneg, bneg, cneg, {
    eps_p,
    eps_d,
    eps_opt,
    maxit,
    alphaMax,
    verbose,
  });
}

function ipmCore(A: Matrix, b: VecM, c: VecN, opts: IPMOptions) {
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
      solution:  { x: [] as VecN, s: [] as VecM, y: [] as VecM, mu: [] as VecM, log: [] as string[] },
      predictor: { x: [] as VecN, s: [] as VecM, y: [] as VecM, mu: [] as VecM },
      corrector: { x: [] as VecN, s: [] as VecM, y: [] as VecM, mu: [] as VecM },
    },
  };

  // Initial primal / dual guesses -----------------------------------
  let x = vzeros(n);
  let s = vones(m);
  let y = vones(m);

  let deltaAff = vzeros(n + m + m);
  let deltaCor = vzeros(n + m + m);

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
    
    // Primal Residual: b - Ax
    const r_p = vsub(b, vsub(A.mmul(Matrix.columnVector(x)).to1DArray(), s));
    
    // Dual Residual: c - Aᵀy
    const r_d = vsub(c, A.transpose().mmul(Matrix.columnVector(y)).to1DArray());
    
    // Barrier parameter: s'y / m
    const mu   = vdot(s, y) / m;

    // Objective: c'x
    const pObj = vdot(c, x);

    // Objective gap: |c'x - b'y| / (1 + |c'x|)
    const gap  = Math.abs(pObj - vdot(b, y)) / (1 + Math.abs(pObj));

    // Log current iterate -------------------------------------------
    logIter(res.iterates.solution, verbose, x, mu, pObj, vnormInf(r_p));
    pushIter(res.iterates.solution, x, s, y, mu);

    // Check convergence ---------------------------------------------
    // Primal residual: |b - Ax| <= eps_p
    // Dual residual: |c - Aᵀy| <= eps_d
    // Objective gap: |c'x - b'y| / (1 + |c'x|) <= eps_opt
    if (vnormInf(r_p) <= eps_p && vnormInf(r_d) <= eps_d && gap <= eps_opt) {
      converged = true;
      break;
    }

    if (++niter > maxit) break;

    // Compute Newton step -------------------------------------------

    // Assemble Newton KKT matrix K ----------------------------------
    const Y = Matrix.diag(y);
    const S = Matrix.diag(s);
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
    const rhsAff = [
      ...r_p,
      ...r_d,
      ...vmult(vscale(s, -1), y)
    ];
    
    // Solve K * deltaAff = rhsAff
    deltaAff = solve(K, Matrix.columnVector(rhsAff)).to1DArray();
    const dxAff = deltaAff.slice(0, n);
    const dsAff = deltaAff.slice(n, n + m);
    const dyAff = deltaAff.slice(n + m);

    // Compute step sizes --------------------------------------------
    const alphaP = alphaStep(s, dsAff);
    const alphaD = alphaStep(y, dyAff);
    const muAff  = vdot(
      vadd(s, vscale(dsAff, alphaP)),
      vadd(y, vscale(dyAff, alphaD))
    ) / m;

    // Log predictor -------------------------------------------------
    pushIter(res.iterates.predictor, dxAff, dsAff, dyAff, muAff);

    // Corrector -----------------------------------------------------
    let dx: VecN, ds: VecM, dy: VecM, stepP: number, stepD: number;
    if (!(alphaP >= 0.9 && alphaD >= 0.9)) {
      // Compute corrector (if needed) -------------------------------
      // sigma = (muAff / mu)^3 clamped to [1e-8, 1 - 1e-8]
      const sigma = Math.max(1e-8, Math.min(1 - 1e-8, (muAff / mu) ** 3));
      
      // rhsCor: [
      //   0
      //   0
      //   sigma * mu - ds * dy
      // ]
      const dsdy = vmult(dsAff, dyAff);
      const sigmamu = vscale(vones(m), sigma * mu);
      const rhsCor = [
        ...vzeros(m),
        ...vzeros(n),
        ...vsub(sigmamu, dsdy)
      ];
      
      // Solve K * deltaCor = rhsCor
      deltaCor = solve(K, Matrix.columnVector(rhsCor)).to1DArray();
      
      // Apply corrector step
      dx = vadd(dxAff, deltaCor.slice(0, n));
      ds = vadd(dsAff, deltaCor.slice(n, n + m));
      dy = vadd(dyAff, deltaCor.slice(n + m));

      pushIter(res.iterates.corrector, dx, ds, dy, mu);
    } else {
      // No corrector needed
      dx = dxAff;
      ds = dsAff;
      dy = dyAff;
      pushIter(res.iterates.corrector, vzeros(n), vzeros(m), vzeros(m), mu);
    }
    
    // Compute final step sizes
    stepP = alphaMax * alphaStep(s, ds);
    stepD = alphaMax * alphaStep(y, dy);

    // Take the step --------------------------------------------------
    x = vadd(x, vscale(dx, stepP));
    s = vadd(s, vscale(ds, stepP));
    y = vadd(y, vscale(dy, stepD));
  }

  const tSolve = Math.round((Date.now() - t0) * 10) / 10; // ms, one decimal
  logFinal(res.iterates.solution, verbose, converged, tSolve);
  return res;
}


// Compute maximum step length α so that x + α*dx ≥ 0
function alphaScalar(xi: number, dxi: number) {
  return dxi >= 0 ? 1.0 : -xi / dxi;
}
function alphaStep(x: VecN, dx: VecN) {
  return Math.min(1.0, Math.min(...x.map((xi: number, i: number) => alphaScalar(xi, dx[i]))));
}

function pushIter(d: any, x: VecN, s: VecM, y: VecM, mu: number) {
  d.x.push(vcopy(x));
  d.s.push(vcopy(s));
  d.y.push(vcopy(y));
  d.mu.push(mu);
}
  
function logIter(d: any, verbose: boolean, x: VecN, mu: number, pObj: number, pRes: number) {
  const msg = sprintf(
    "%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e\n",
    d.x.length, x[0], x[1], -pObj, pRes, mu,
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