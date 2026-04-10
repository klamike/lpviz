import { dot, infinityNorm, linesToDenseAb, matVec, solveDenseSystem, transposedMatVec } from "./utils/dense";
import { ipmImplicit } from "./ipmImplicit";
import { computeComplementarityPhase, logFinal, logIter, MAX_ITERATIONS_LIMIT, pushIter, type IPMOptions, type IPMSolutionData } from "./ipmShared";
import type { Lines, VecN } from "./utils/blas";

const SIGMA_MIN = 1e-8;
const SIGMA_MAX = 1 - 1e-8;
const SIGMA_POWER = 3;

export function ipm(lines: Lines, objective: VecN, opts: IPMOptions) {
  if (opts.variant === "implicit") {
    return ipmImplicit(lines, objective, opts);
  }

  const { eps_p, eps_d, eps_opt, maxit, alphaMax, correctorThreshold, verbose, colorByPhase } = opts;

  if (maxit > MAX_ITERATIONS_LIMIT) {
    throw new Error("maxit > 2^16 not allowed");
  }

  const { A, b } = linesToDenseAb(lines);
  const c = Float64Array.from(objective, (value) => -value);
  const bneg = Float64Array.from(b, (value) => -value);
  const Aneg = Float64Array.from(A.data, (value) => -value);

  return ipmCore(
    {
      rows: A.rows,
      cols: A.cols,
      data: Aneg,
    },
    bneg,
    c,
    {
      eps_p,
      eps_d,
      eps_opt,
      maxit,
      alphaMax,
      correctorThreshold,
      verbose,
      colorByPhase,
    },
  );
}

function ipmCore(
  A: { rows: number; cols: number; data: Float64Array },
  b: Float64Array,
  c: Float64Array,
  opts: IPMOptions,
) {
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, correctorThreshold, verbose, colorByPhase } = opts;
  const m = A.rows;
  const n = A.cols;
  const systemSize = n + 2 * m;

  const solution: IPMSolutionData = {
    x: [],
    s: [],
    y: [],
    mu: [],
    header: " Iter        x        y        Obj     Infeas          µ",
    rows: [],
    phases: colorByPhase ? [] : undefined,
  };
  const res = { iterates: { solution } };

  let x = new Float64Array(n);
  let s = new Float64Array(m).fill(1);
  let y = new Float64Array(m).fill(1);

  const ax = new Float64Array(m);
  const aty = new Float64Array(n);
  const rP = new Float64Array(m);
  const rD = new Float64Array(n);
  const K = new Float64Array(systemSize * systemSize);
  const rhsAff = new Float64Array(systemSize);
  const rhsCor = new Float64Array(systemSize);
  const deltaAff = new Float64Array(systemSize);
  const deltaCor = new Float64Array(systemSize);
  const luScratch = new Float64Array(systemSize * systemSize);
  const dx = new Float64Array(n);
  const ds = new Float64Array(m);
  const dy = new Float64Array(m);

  let iteration = 0;
  let converged = false;
  let failureMessage: string | null = null;
  const startTime = performance.now();

  if (verbose) console.log(solution.header);

  while (++iteration <= maxit) {
    matVec(A, x, ax);
    transposedMatVec(A, y, aty);

    for (let i = 0; i < m; i++) {
      rP[i] = b[i]! - ax[i]! + s[i]!;
    }
    for (let j = 0; j < n; j++) {
      rD[j] = c[j]! - aty[j]!;
    }

    const mu = dot(s, y) / m;
    const pObj = dot(c, x);
    const gap = Math.abs(pObj - dot(b, y)) / (1 + Math.abs(pObj));
    const pRes = infinityNorm(rP);

    logIter(solution, verbose, x, mu, pObj, pRes);
    pushIter(solution, x, s, y, mu);
    if (colorByPhase) {
      solution.phases!.push(computeComplementarityPhase(s, y));
    }

    if (pRes <= eps_p && infinityNorm(rD) <= eps_d && gap <= eps_opt) {
      converged = true;
      break;
    }

    buildKktSystem(K, A, s, y);
    for (let i = 0; i < m; i++) rhsAff[i] = rP[i]!;
    for (let j = 0; j < n; j++) rhsAff[m + j] = rD[j]!;
    for (let i = 0; i < m; i++) rhsAff[m + n + i] = -s[i]! * y[i]!;

    try {
      solveDenseSystem(K, systemSize, rhsAff, deltaAff, luScratch);
    } catch (error) {
      failureMessage = `IPM linear solve failed: ${error instanceof Error ? error.message : String(error)}`;
      if (verbose) console.log(failureMessage);
      break;
    }

    const dxAff = deltaAff.subarray(0, n);
    const dsAff = deltaAff.subarray(n, n + m);
    const dyAff = deltaAff.subarray(n + m, systemSize);

    const alphaP = alphaStep(s, dsAff);
    const alphaD = alphaStep(y, dyAff);
    let muAff = 0;
    for (let i = 0; i < m; i++) {
      muAff += (s[i]! + alphaP * dsAff[i]!) * (y[i]! + alphaD * dyAff[i]!);
    }
    muAff /= m;

    if (!(alphaP >= correctorThreshold && alphaD >= correctorThreshold)) {
      const sigma = Math.max(SIGMA_MIN, Math.min(SIGMA_MAX, (muAff / mu) ** SIGMA_POWER));
      rhsCor.fill(0);
      for (let i = 0; i < m; i++) {
        rhsCor[m + n + i] = -(dsAff[i]! * dyAff[i]! - sigma * mu);
      }

      try {
        solveDenseSystem(K, systemSize, rhsCor, deltaCor, luScratch);
      } catch (error) {
        failureMessage = `IPM corrector solve failed: ${error instanceof Error ? error.message : String(error)}`;
        if (verbose) console.log(failureMessage);
        break;
      }

      for (let j = 0; j < n; j++) dx[j] = dxAff[j]! + deltaCor[j]!;
      for (let i = 0; i < m; i++) {
        ds[i] = dsAff[i]! + deltaCor[n + i]!;
        dy[i] = dyAff[i]! + deltaCor[n + m + i]!;
      }
    } else {
      dx.set(dxAff);
      ds.set(dsAff);
      dy.set(dyAff);
    }

    const stepP = alphaMax * alphaStep(s, ds);
    const stepD = alphaMax * alphaStep(y, dy);
    for (let j = 0; j < n; j++) x[j] += dx[j]! * stepP;
    for (let i = 0; i < m; i++) {
      s[i] += ds[i]! * stepP;
      y[i] += dy[i]! * stepD;
    }
  }

  const solveTime = performance.now() - startTime;
  logFinal(solution, verbose, converged, solveTime, failureMessage);
  return res;
}

function buildKktSystem(K: Float64Array, A: { rows: number; cols: number; data: Float64Array }, s: Float64Array, y: Float64Array) {
  const m = A.rows;
  const n = A.cols;
  const size = n + 2 * m;
  K.fill(0);

  for (let i = 0; i < m; i++) {
    const rowOffset = i * size;
    const aOffset = i * n;
    for (let j = 0; j < n; j++) {
      K[rowOffset + j] = A.data[aOffset + j]!;
    }
    K[rowOffset + n + i] = -1;
  }

  for (let j = 0; j < n; j++) {
    const rowOffset = (m + j) * size;
    for (let i = 0; i < m; i++) {
      K[rowOffset + n + m + i] = A.data[i * n + j]!;
    }
  }

  for (let i = 0; i < m; i++) {
    const rowOffset = (m + n + i) * size;
    K[rowOffset + n + i] = y[i]!;
    K[rowOffset + n + m + i] = s[i]!;
  }
}

function alphaStep(values: ArrayLike<number>, delta: ArrayLike<number>) {
  let alpha = 1;
  for (let i = 0; i < values.length; i++) {
    const direction = delta[i]!;
    if (direction < 0) {
      alpha = Math.min(alpha, -values[i]! / direction);
    }
  }
  return alpha;
}
