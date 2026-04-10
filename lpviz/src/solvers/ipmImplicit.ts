import { dot, infinityNorm, linesToDenseAb, matVec, solveDenseSystem, transposedMatVec } from "./utils/dense";
import {
  computeComplementarityPhase,
  logFinal,
  logIter,
  MAX_ITERATIONS_LIMIT,
  pushIter,
  type IPMOptions,
  type IPMSolutionData,
} from "./ipmShared";
import type { Lines, VecN } from "./utils/blas";

const INITIAL_MU = 1;
const MIN_MU = 1e-12;
const DEFAULT_CENTERING_SIGMA = 0.5;
const LINE_SEARCH_SHRINK_FACTOR = 0.5;
const LINE_SEARCH_SUFFICIENT_DECREASE = 1e-4;
const MAX_LINE_SEARCH_ITERATIONS = 32;
const MIN_STEP_SIZE = 1e-10;

type DenseSystem = {
  rows: number;
  cols: number;
  data: Float64Array;
};

type ResidualScratch = {
  ax: Float64Array;
  atLambda: Float64Array;
  rX: Float64Array;
  rI: Float64Array;
  rLambda: Float64Array;
  rS: Float64Array;
  s: Float64Array;
  lambda: Float64Array;
  bPlus: Float64Array;
  bMinus: Float64Array;
};

type ResidualMetrics = {
  pRes: number;
  dRes: number;
  gap: number;
  pObj: number;
};

function softplus(mu: number, value: number) {
  return 0.5 * (value + Math.sqrt(value * value + 4 * mu));
}

function softplusDerivative(mu: number, value: number) {
  const denominator = Math.sqrt(value * value + 4 * mu);
  return 0.5 * (1 + value / denominator);
}

function evaluateResiduals(
  A: DenseSystem,
  b: Float64Array,
  c: Float64Array,
  x: Float64Array,
  v: Float64Array,
  mu: number,
  scratch: ResidualScratch,
): ResidualMetrics {
  const { ax, atLambda, rX, rI, rLambda, rS, s, lambda, bPlus, bMinus } = scratch;

  matVec(A, x, ax);
  for (let i = 0; i < A.rows; i++) {
    lambda[i] = softplus(mu, v[i]!);
    s[i] = softplus(mu, -v[i]!);
    bPlus[i] = softplusDerivative(mu, v[i]!);
    bMinus[i] = softplusDerivative(mu, -v[i]!);
    rI[i] = ax[i]! - b[i]! - s[i]!;
    rLambda[i] = 0;
    rS[i] = 0;
  }

  transposedMatVec(A, lambda, atLambda);
  for (let j = 0; j < A.cols; j++) {
    rX[j] = c[j]! - atLambda[j]!;
  }

  const pObj = dot(c, x);
  return {
    pRes: infinityNorm(rI),
    dRes: infinityNorm(rX),
    gap: Math.abs(pObj - dot(b, lambda)) / (1 + Math.abs(pObj)),
    pObj,
  };
}

function buildImplicitSystem(
  system: Float64Array,
  rhs: Float64Array,
  A: DenseSystem,
  bPlus: Float64Array,
  bMinus: Float64Array,
  rX: Float64Array,
  rI: Float64Array,
  rLambda: Float64Array,
  rS: Float64Array,
) {
  const { rows: m, cols: n, data } = A;
  const size = n + m;
  system.fill(0);

  // LP specialization of the paper's condensed implicit system J(v).
  for (let j = 0; j < n; j++) {
    const rowOffset = j * size;
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let i = 0; i < m; i++) {
        sum += data[i * n + j]! * data[i * n + k]!;
      }
      system[rowOffset + k] = -sum;
    }

    let rhsValue = -rX[j]!;
    for (let i = 0; i < m; i++) {
      const aij = data[i * n + j]!;
      system[rowOffset + n + i] = -aij * (bPlus[i]! + bMinus[i]!);
      rhsValue += aij * (rI[i]! - rLambda[i]! + rS[i]!);
    }
    rhs[j] = rhsValue;
  }

  for (let i = 0; i < m; i++) {
    const rowOffset = (n + i) * size;
    for (let j = 0; j < n; j++) {
      system[rowOffset + j] = -data[i * n + j]!;
    }
    system[rowOffset + n + i] = -bMinus[i]!;
    rhs[n + i] = rI[i]! + rS[i]!;
  }
}

function findLineSearchStep(
  A: DenseSystem,
  b: Float64Array,
  c: Float64Array,
  x: Float64Array,
  v: Float64Array,
  mu: number,
  dx: Float64Array,
  dv: Float64Array,
  alphaMax: number,
  currentResidual: number,
  targetResidual: number,
  candidateX: Float64Array,
  candidateV: Float64Array,
  scratch: ResidualScratch,
) {
  let step = Math.min(1, Math.max(MIN_STEP_SIZE, alphaMax));

  for (let lineSearchIteration = 0; lineSearchIteration < MAX_LINE_SEARCH_ITERATIONS; lineSearchIteration++) {
    for (let j = 0; j < x.length; j++) {
      candidateX[j] = x[j]! + step * dx[j]!;
    }
    for (let i = 0; i < v.length; i++) {
      candidateV[i] = v[i]! + step * dv[i]!;
    }

    const candidateMetrics = evaluateResiduals(A, b, c, candidateX, candidateV, mu, scratch);
    const candidateResidual = Math.max(candidateMetrics.pRes, candidateMetrics.dRes);
    if (
      candidateResidual <= targetResidual ||
      candidateResidual <= currentResidual * (1 - LINE_SEARCH_SUFFICIENT_DECREASE * step)
    ) {
      return step;
    }

    step *= LINE_SEARCH_SHRINK_FACTOR;
    if (step < MIN_STEP_SIZE) {
      return 0;
    }
  }

  return 0;
}

export function ipmImplicit(lines: Lines, objective: VecN, opts: IPMOptions) {
  if (opts.maxit > MAX_ITERATIONS_LIMIT) {
    throw new Error("maxit > 2^16 not allowed");
  }

  const { A, b } = linesToDenseAb(lines);
  const c = Float64Array.from(objective, (value) => -value);
  const bneg = Float64Array.from(b, (value) => -value);
  const Aneg = Float64Array.from(A.data, (value) => -value);

  return ipmImplicitCore(
    {
      rows: A.rows,
      cols: A.cols,
      data: Aneg,
    },
    bneg,
    c,
    opts,
  );
}

function ipmImplicitCore(A: DenseSystem, b: Float64Array, c: Float64Array, opts: IPMOptions) {
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, verbose, colorByPhase } = opts;
  const m = A.rows;
  const n = A.cols;
  const systemSize = n + m;
  const centeringSigma = Math.max(0.001, Math.min(0.999, opts.implicitSigma ?? DEFAULT_CENTERING_SIGMA));

  const solution: IPMSolutionData = {
    x: [],
    s: [],
    y: [],
    mu: [],
    header: " Iter        x        y        Obj     Infeas          µ",
    rows: [],
    phases: colorByPhase ? [] : undefined,
  };
  const result = { iterates: { solution } };

  const x = new Float64Array(n);
  const v = new Float64Array(m);
  let mu = INITIAL_MU;

  const currentScratch: ResidualScratch = {
    ax: new Float64Array(m),
    atLambda: new Float64Array(n),
    rX: new Float64Array(n),
    rI: new Float64Array(m),
    rLambda: new Float64Array(m),
    rS: new Float64Array(m),
    s: new Float64Array(m),
    lambda: new Float64Array(m),
    bPlus: new Float64Array(m),
    bMinus: new Float64Array(m),
  };
  const candidateScratch: ResidualScratch = {
    ax: new Float64Array(m),
    atLambda: new Float64Array(n),
    rX: new Float64Array(n),
    rI: new Float64Array(m),
    rLambda: new Float64Array(m),
    rS: new Float64Array(m),
    s: new Float64Array(m),
    lambda: new Float64Array(m),
    bPlus: new Float64Array(m),
    bMinus: new Float64Array(m),
  };
  const system = new Float64Array(systemSize * systemSize);
  const rhs = new Float64Array(systemSize);
  const delta = new Float64Array(systemSize);
  const luScratch = new Float64Array(systemSize * systemSize);
  const candidateX = new Float64Array(n);
  const candidateV = new Float64Array(m);

  let converged = false;
  let failureMessage: string | null = null;
  const startTime = performance.now();

  if (verbose) console.log(solution.header);

  for (let iteration = 0; iteration < maxit; iteration++) {
    const metrics = evaluateResiduals(A, b, c, x, v, mu, currentScratch);
    const currentResidual = Math.max(metrics.pRes, metrics.dRes);

    logIter(solution, verbose, x, mu, metrics.pObj, currentResidual);
    pushIter(solution, x, currentScratch.s, currentScratch.lambda, mu);
    if (colorByPhase) {
      solution.phases!.push(computeComplementarityPhase(currentScratch.s, currentScratch.lambda));
    }

    if (metrics.pRes <= eps_p && metrics.dRes <= eps_d && metrics.gap <= eps_opt) {
      converged = true;
      break;
    }

    buildImplicitSystem(
      system,
      rhs,
      A,
      currentScratch.bPlus,
      currentScratch.bMinus,
      currentScratch.rX,
      currentScratch.rI,
      currentScratch.rLambda,
      currentScratch.rS,
    );

    try {
      solveDenseSystem(system, systemSize, rhs, delta, luScratch);
    } catch (error) {
      failureMessage = `Implicit IPM linear solve failed: ${error instanceof Error ? error.message : String(error)}`;
      if (verbose) console.log(failureMessage);
      break;
    }

    const dx = delta.subarray(0, n);
    const dv = delta.subarray(n, systemSize);
    const targetResidual = Math.max(eps_p, eps_d);
    const step = findLineSearchStep(
      A,
      b,
      c,
      x,
      v,
      mu,
      dx,
      dv,
      alphaMax,
      currentResidual,
      targetResidual,
      candidateX,
      candidateV,
      candidateScratch,
    );

    if (step <= 0) {
      failureMessage = "Implicit IPM line search failed to reduce the residual.";
      if (verbose) console.log(failureMessage);
      break;
    }

    for (let j = 0; j < n; j++) {
      x[j] = candidateX[j]!;
    }
    for (let i = 0; i < m; i++) {
      v[i] = candidateV[i]!;
    }
    mu = Math.max(MIN_MU, centeringSigma * mu);
  }

  const solveTime = performance.now() - startTime;
  logFinal(solution, verbose, converged, solveTime, failureMessage, "IPM");
  return result;
}

function candidateScratchMetrics(scratch: ResidualScratch) {
  return Math.max(infinityNorm(scratch.rI), infinityNorm(scratch.rX));
}
