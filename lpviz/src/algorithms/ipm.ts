import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { zeros, ones, copy, dot, normInf, vectorAdd, vectorSub, scale, linesToAb } from '../utils/blas';


export function ipm(lines: number[][], objective: number[],
  opts: {
    eps_p: number,
    eps_d: number,
    eps_opt: number,
    maxit: number,
    alphaMax: number,
    verbose: boolean
  } = {
  eps_p: 1e-6,
  eps_d: 1e-6,
  eps_opt: 1e-6,
  maxit: 30,
  alphaMax: 0.999,
  verbose: false
}) {
  const {
    eps_p = 1e-6,
    eps_d = 1e-6,
    eps_opt = 1e-6,
    maxit = 30,
    alphaMax = 0.999,
    verbose = false,
  } = opts;

  if (maxit > 2 ** 16) {
    throw new Error('maxit > 2^16 not allowed');
  }

  const { A, b } = linesToAb(lines);

  // Convert   A x ≤ b,  max c^T x   →   −A x ≥ −b,  min −c^T x
  const Aneg = A.to2DArray().map(row => row.map(v => -v)); // TODO: just keep it a matrix
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

function ipmCore(Araw: number[][], b: number[], c: number[], opts: { eps_p: number, eps_d: number, eps_opt: number, maxit: number, alphaMax: number, verbose: boolean }) {
  const {
    eps_p,
    eps_d,
    eps_opt,
    maxit,
    alphaMax,
    verbose,
  } = opts;

  const m = Araw.length;              // # inequalities
  const n = Araw[0].length;           // # variables
  const A = new Matrix(Araw);

  // Result structure replicates Julia layout
  const res = {
    iterates: {
      solution:  { x: [] as number[], s: [] as number[], y: [] as number[], mu: [] as number[], log: [] as string[] },
      predictor: { x: [] as number[], s: [] as number[], y: [] as number[], mu: [] as number[] },
      corrector: { x: [] as number[], s: [] as number[], y: [] as number[], mu: [] as number[] },
    },
  };

  // Initial primal / dual guesses -----------------------------------
  let x = zeros(n);
  let s = ones(m);
  let y = ones(m);

  let deltaAff = zeros(n + m + m);
  let deltaCor = zeros(n + m + m);

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
    const r_p = vectorSub(b, vectorSub(A.mmul(Matrix.columnVector(x)).to1DArray(), s));
    const r_d = vectorSub(c, A.transpose().mmul(Matrix.columnVector(y)).to1DArray());
    const mu   = dot(s, y) / m;

    const pObj = dot(c, x);
    const gap  = Math.abs(pObj - dot(b, y)) / (1 + Math.abs(pObj));

    // Log current iterate -------------------------------------------
    logIter(res.iterates.solution, verbose, x, mu, pObj, normInf(r_p));
    pushIter(res.iterates.solution, x, s, y, mu);

    if (normInf(r_p) <= eps_p && normInf(r_d) <= eps_d && gap <= eps_opt) {
      converged = true;
      break;
    }

    if (++niter > maxit) break;

    // Build diagonal matrices ---------------------------------------
    const Y = Matrix.diag(y);
    const S = Matrix.diag(s);

    // Assemble Newton KKT matrix K ----------------------------------
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

    // Predictor ------------------------------------------------------
    const rhsAff = [...r_p, ...r_d, ...s.map((si, i) => -si * y[i])];

    deltaAff = solve(K, Matrix.columnVector(rhsAff)).to1DArray();
    const dxAff = deltaAff.slice(0, n);
    const dsAff = deltaAff.slice(n, n + m);
    const dyAff = deltaAff.slice(n + m);

    const alphaP = alphaStep(s, dsAff);
    const alphaD = alphaStep(y, dyAff);
    const muAff  = dot(vectorAdd(s, scale(dsAff, alphaP)), vectorAdd(y, scale(dyAff, alphaD))) / m;

    pushIter(res.iterates.predictor, dxAff, dsAff, dyAff, muAff);

    // Corrector (if needed) -----------------------------------------
    let dx: number[], ds: number[], dy: number[], stepP: number, stepD: number;
    if (!(alphaP >= 0.9 && alphaD >= 0.9)) {
      const sigma = Math.max(1e-8, Math.min(1 - 1e-8, (muAff / mu) ** 3));
      const rhsCor = [...zeros(m), ...zeros(n), ...s.map((si, i) => sigma * mu - dsAff[i] * dyAff[i])];
      deltaCor = solve(K, Matrix.columnVector(rhsCor)).to1DArray();

      dx = vectorAdd(dxAff, deltaCor.slice(0, n));
      ds = vectorAdd(dsAff, deltaCor.slice(n, n + m));
      dy = vectorAdd(dyAff, deltaCor.slice(n + m));
      pushIter(res.iterates.corrector, dx, ds, dy, mu);
    } else {
      dx = dxAff;
      ds = dsAff;
      dy = dyAff;
      pushIter(res.iterates.corrector, zeros(n), zeros(m), zeros(m), mu);
    }

    stepP = alphaMax * alphaStep(s, ds);
    stepD = alphaMax * alphaStep(y, dy);

    // Take the step --------------------------------------------------
    x = vectorAdd(x, scale(dx, stepP));
    s = vectorAdd(s, scale(ds, stepP));
    y = vectorAdd(y, scale(dy, stepD));
  }

  const tSolve = Math.round((Date.now() - t0) * 10) / 10; // ms, one decimal
  logFinal(res.iterates.solution, verbose, converged, tSolve);
  return res;
}


function alphaScalar(xi: number, dxi: number) {
  return dxi >= 0 ? 1.0 : -xi / dxi;
}

function alphaStep(x: number[], dx: number[]) {
  return Math.min(1.0, Math.min(...x.map((xi: number, i: number) => alphaScalar(xi, dx[i]))));
}

function pushIter(d: { x: any; s: any; y: any; mu: any; log?: any[]; }, x: number[], s: number[], y: number[], mu: number) {
  d.x.push(copy(x));
  d.s.push(copy(s));
  d.y.push(copy(y) as number[]);
  d.mu.push(mu);
}
  
function logIter(d: { x: any; s: any; y: any; mu: any; log: any; }, verbose: boolean, x: number[], mu: number, pObj: number, pRes: number) {
  const msg = sprintf(
    "%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e\n",
    d.x.length, x[0], x[1] ?? 0, -pObj, pRes, mu,
  );
  if (verbose) console.log(msg);
  d.log.push(msg);
}

function logFinal(d: { x: any; s: any; y: any; mu: any; log: any; }, verbose: boolean, converged: boolean, tSolve: number) {
  const msg = converged
    ? `Converged to primal-dual optimal solution in ${tSolve} ms\n`
    : `Did not converge after ${d.x.length - 1} iterations in ${tSolve} ms\n`;
  if (verbose) console.log(msg);
  d.log.push(msg);
}