import { Matrix, solve } from "ml-matrix";
import { sprintf } from "sprintf-js";
import { linesToAb, diag, vstack, vslice, hstack } from "./utils/blas";
import { Lines, VecM, VecN, VectorM, VectorN } from "../types/arrays";

const MAX_ITERATIONS_LIMIT = 2 ** 16;
const CORRECTOR_THRESHOLD = 0.9;
const SIGMA_MIN = 1e-8;
const SIGMA_MAX = 1 - 1e-8;
const SIGMA_POWER = 3;

export interface IPMOptions {
  eps_p: number;
  eps_d: number;
  eps_opt: number;
  maxit: number;
  alphaMax: number;
  verbose: boolean;
}

interface IPMSolutionData {
  x: VecN[];
  s: VecM[];
  y: VecM[];
  mu: number[];
  log: string[];
}

// Convert A x ≤ b, max c^T x → −A x ≥ −b, min −c^T x
export function ipm(lines: Lines, objective: VecN, opts: IPMOptions) {
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, verbose } = opts;

  if (maxit > MAX_ITERATIONS_LIMIT) {
    throw new Error("maxit > 2^16 not allowed");
  }

  const { A, b } = linesToAb(lines);
  const c = Matrix.columnVector(objective);

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
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, verbose } = opts;
  const m = A.rows; // inequalities
  const n = A.columns; // variables

  const solution: IPMSolutionData = { x: [], s: [], y: [], mu: [], log: [] };
  const res = {
    iterates: {
      solution,
    },
  };

  let x = Matrix.zeros(n, 1);
  let s = Matrix.ones(m, 1);
  let y = Matrix.ones(m, 1);

  let deltaAff = Matrix.zeros(n + m + m, 1);
  let deltaCor = Matrix.zeros(n + m + m, 1);

  let niter = 0;
  let converged = false;
  const t0 = Date.now();

  const banner = sprintf("%5s %8s %8s %10s %10s %10s\n", "Iter", "x", "y", "Obj", "Infeas", " µ");
  if (verbose) console.log(banner);
  solution.log.push(banner);

  while (niter <= maxit) {
    // r_p = b - (Ax - s)
    const r_p = Matrix.sub(b, Matrix.sub(A.mmul(x), s));
    // r_d = c - A^T y
    const r_d = Matrix.sub(c, A.transpose().mmul(y));
    // μ = s^T y / m
    const mu = s.dot(y) / m;
    // c^T x
    const pObj = c.dot(x);
    // |c^T x - b^T y| / (1 + |c^T x|)
    const gap = Math.abs(pObj - b.dot(y)) / (1 + Math.abs(pObj));

    logIter(solution, verbose, x, mu, pObj, r_p.max());
    pushIter(solution, x, s, y, mu);

    // ||r_p|| ≤ ε_p, ||r_d|| ≤ ε_d, gap ≤ ε_opt
    if (r_p.max() <= eps_p && r_d.max() <= eps_d && gap <= eps_opt) {
      converged = true;
      break;
    }

    if (++niter > maxit) break;

    // K = [A  -I  0 ]
    //     [0   0  A^T]
    //     [0   Y  S ]
    const Y = diag(y);
    const S = diag(s);
    const I = Matrix.eye(m);
    const Z_mn = Matrix.zeros(m, n);
    const Z_nm = Matrix.zeros(n, m);
    const Z_mm = Matrix.zeros(m, m);
    const Z_nn = Matrix.zeros(n, n);

    const K = vstack([hstack(A, I.mul(-1), Z_mm), hstack(Z_nn, Z_nm, A.transpose()), hstack(Z_mn, Y, S)]);

    // [r_p, r_d, -s⊙y]
    const rhsAff = vstack([r_p, r_d, Matrix.mul(Matrix.mul(s, -1), y)]);

    deltaAff = solve(K, rhsAff);
    const dxAff = vslice(deltaAff, 0, n);
    const dsAff = vslice(deltaAff, n, n + m);
    const dyAff = vslice(deltaAff, n + m, n + m + m);

    const alphaP = alphaStep(s, dsAff);
    const alphaD = alphaStep(y, dyAff);
    const sds = Matrix.add(s, Matrix.mul(dsAff, alphaP));
    const sdy = Matrix.add(y, Matrix.mul(dyAff, alphaD));
    // μ_aff = (s + α_p ds)^T (y + α_d dy) / m
    const muAff = sds.dot(sdy) / m;

    let dx: VectorN, ds: VectorM, dy: VectorM;
    if (!(alphaP >= CORRECTOR_THRESHOLD && alphaD >= CORRECTOR_THRESHOLD)) {
      const sigma = Math.max(SIGMA_MIN, Math.min(SIGMA_MAX, (muAff / mu) ** SIGMA_POWER));
      const rhsCor = vstack([Matrix.zeros(m, 1), Matrix.zeros(n, 1), Matrix.mul(Matrix.sub(Matrix.mul(dsAff, dyAff), sigma * mu), -1)]);
      deltaCor = solve(K, rhsCor);
      dx = Matrix.add(dxAff, vslice(deltaCor, 0, n));
      ds = Matrix.add(dsAff, vslice(deltaCor, n, n + m));
      dy = Matrix.add(dyAff, vslice(deltaCor, n + m, n + m + m));
    } else {
      dx = dxAff;
      ds = dsAff;
      dy = dyAff;
    }

    const stepP = alphaMax * alphaStep(s, ds);
    const stepD = alphaMax * alphaStep(y, dy);

    // x ← x + α_p dx, s ← s + α_p ds, y ← y + α_d dy
    x = Matrix.add(x, Matrix.mul(dx, stepP));
    s = Matrix.add(s, Matrix.mul(ds, stepP));
    y = Matrix.add(y, Matrix.mul(dy, stepD));
  }

  const tSolve = Math.round((Date.now() - t0) * 10) / 10;
  logFinal(solution, verbose, converged, tSolve);
  return res;
}

function alphaStep(x: VectorN, dx: VectorN) {
  return Math.min(1.0, Math.min(...x.to1DArray().map((xi: number, i: number) => (dx.get(i, 0) >= 0 ? 1.0 : -xi / dx.get(i, 0)))));
}

function pushIter(d: IPMSolutionData, x: VectorN, s: VectorM, y: VectorM, mu: number) {
  d.x.push(x.to1DArray());
  d.s.push(s.to1DArray());
  d.y.push(y.to1DArray());
  d.mu.push(mu);
}

function logIter(d: IPMSolutionData, verbose: boolean, x: VectorN, mu: number, pObj: number, pRes: number) {
  const msg = sprintf("%5d %+8.2f %+8.2f %+10.1e %+10.1e %10.1e\n", d.x.length, x.get(0, 0), x.get(1, 0), -pObj, pRes, mu);
  if (verbose) console.log(msg);
  d.log.push(msg);
}

function logFinal(d: IPMSolutionData, verbose: boolean, converged: boolean, tSolve: number) {
  const msg = converged ? `Converged to primal-dual optimal solution in ${tSolve} ms\n` : `Did not converge after ${d.x.length - 1} iterations in ${tSolve} ms\n`;
  if (verbose) console.log(msg);
  d.log.push(msg);
}
