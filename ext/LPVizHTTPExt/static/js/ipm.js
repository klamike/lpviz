const zeros = (k) => Array(k).fill(0);
const ones  = (k) => Array(k).fill(1);
const copy  = (arr) => arr.slice();
const dot   = (u,v) => u.reduce((s,ui,i) => s + ui*v[i], 0);
const normInf = (v) => v.reduce((m,vi) => Math.max(m, Math.abs(vi)), 0);

function vectorAdd(a, b) { return a.map((ai, i) => ai + b[i]); }
function vectorSub(a, b) { return a.map((ai, i) => ai - b[i]); }
function scale(v, k)     { return v.map(vi => vi * k); }

export function ipm(lines, objective, opts = {}) {
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
  const Aneg = A.map(row => row.map(v => -v));
  const bneg = b.map(v => -v);
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

function ipmCore(Araw, b, c, opts) {
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
  const A = new window.mlMatrix.Matrix(Araw);

  // Result structure replicates Julia layout
  const res = {
    iterates: {
      solution:  { x: [], s: [], y: [], mu: [], log: [] },
      predictor: { x: [], s: [], y: [], mu: [] },
      corrector: { x: [], s: [], y: [], mu: [] },
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
    '%4s %6s %6s  %8s %8s  %7s %7s  %7s\n',
    'Iter', 'x', 'y', 'PObj', 'DObj', 'PFeas', 'DFeas', 'mu',
  );
  if (verbose) process.stdout.write(banner);
  res.iterates.solution.log.push(banner);

  while (niter <= maxit) {
    // Residuals, duality gap ----------------------------------------
    const r_p = vectorSub(b, vectorSub(A.mmul(window.mlMatrix.Matrix.columnVector(x)).to1DArray(), s));
    const r_d = vectorSub(c, A.transpose().mmul(window.mlMatrix.Matrix.columnVector(y)).to1DArray());
    const mu   = dot(s, y) / m;

    const pObj = dot(c, x);
    const dObj = dot(b, y);
    const gap  = Math.abs(pObj - dObj) / (1 + Math.abs(pObj));

    // Log current iterate -------------------------------------------
    logIter(res.iterates.solution, verbose, x, mu, pObj, dObj, normInf(r_p), normInf(r_d));
    pushIter(res.iterates.solution, x, s, y, mu);

    if (normInf(r_p) <= eps_p && normInf(r_d) <= eps_d && gap <= eps_opt) {
      converged = true;
      break;
    }

    if (++niter > maxit) break;

    // Build diagonal matrices ---------------------------------------
    const Y = window.mlMatrix.Matrix.diag(y);
    const S = window.mlMatrix.Matrix.diag(s);

    // Assemble Newton KKT matrix K ----------------------------------
    const K = window.mlMatrix.Matrix.zeros(m + n + m, n + m + m);

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
    const rhsAff = [].concat(
      r_p,
      r_d,
      s.map((si, i) => -si * y[i]),
    );

    deltaAff = window.mlMatrix.solve(K, window.mlMatrix.Matrix.columnVector(rhsAff)).to1DArray();
    const dxAff = deltaAff.slice(0, n);
    const dsAff = deltaAff.slice(n, n + m);
    const dyAff = deltaAff.slice(n + m);

    const alphaP = alphaStep(s, dsAff);
    const alphaD = alphaStep(y, dyAff);
    const muAff  = dot(vectorAdd(s, scale(dsAff, alphaP)), vectorAdd(y, scale(dyAff, alphaD))) / m;

    pushIter(res.iterates.predictor, dxAff, dsAff, dyAff, muAff);

    // Corrector (if needed) -----------------------------------------
    let dx, ds, dy, stepP, stepD;
    if (!(alphaP >= 0.9 && alphaD >= 0.9)) {
      const sigma = Math.max(1e-8, Math.min(1 - 1e-8, (muAff / mu) ** 3));
      const rhsCor = [].concat(
        zeros(m),
        zeros(n),
        s.map((si, i) => sigma * mu - dsAff[i] * dyAff[i]),
      );
      deltaCor = window.mlMatrix.solve(K, window.mlMatrix.Matrix.columnVector(rhsCor)).to1DArray();

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


function linesToAb(lines) {
  const A = lines.map(r => r.slice(0, -1));
  const b = lines.map(r => r[r.length - 1]);
  return { A, b };
}

function alphaScalar(xi, dxi) {
  return dxi >= 0 ? 1.0 : -xi / dxi;
}

function alphaStep(x, dx) {
  return Math.min(1.0, Math.min(...x.map((xi, i) => alphaScalar(xi, dx[i]))));
}

function pushIter(d, x, s, y, mu) {
  d.x.push(copy(x));
  d.s.push(copy(s));
  d.y.push(copy(y));
  d.mu.push(mu);
}

function logIter(d, verbose, x, mu, pObj, dObj, pRes, dRes) {
  const msg = sprintf(
    '%-4d %+6.2f %+6.2f  %+.1e %+.1e  %.1e %.1e  %.1e\n',
    d.x.length, x[0], x[1] ?? 0, -pObj, -dObj, pRes, dRes, mu,
  );
  if (verbose) process.stdout.write(msg);
  d.log.push(msg);
}

function logFinal(d, verbose, converged, tSolve) {
  const msg = converged
    ? `Converged to primal‑dual optimal solution in ${tSolve} ms\n`
    : `Did not converge after ${d.x.length - 1} iterations in ${tSolve} ms\n`;
  if (verbose) process.stdout.write(msg);
  d.log.push(msg);
}

// FIXME: format is broken
function sprintf(fmt, ...args) {
  let i = 0;
  return fmt.replace(/%([-+0-9.]*[dfs])/g, () => String(args[i++]));
}
