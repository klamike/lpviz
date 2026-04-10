import { dot, linesToDenseAb, matVec, solveDenseSystem, transposedMatVec } from "./utils/dense";
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

const INITIAL_DUAL_SLACK = 1;
const DEFAULT_CENTERING_SIGMA = 0.5;
const MIN_MU = 1e-12;
const LINE_SEARCH_ARMIJO_GAMMA = 1e-4;
const LINE_SEARCH_BACKTRACK_FACTOR = 0.9;
const MIN_STEP_SIZE = 1e-12;
const PROJECTED_FALLBACK_STEP_THRESHOLD = 1e-8;

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
  bPlus: Float64Array;
  bMinus: Float64Array;
};

type ResidualMetrics = {
  pRes: number;
  dRes: number;
  cRes: number;
  gap: number;
  pObj: number;
  merit: number;
};

function softplus(beta: number, value: number) {
  return 0.5 * (value + Math.sqrt(value * value + 4 * beta));
}

function softplusInverse(value: number, beta: number) {
  return value - beta / value;
}

function softplusDerivative(beta: number, value: number) {
  const denominator = Math.sqrt(value * value + 4 * beta);
  return 0.5 * (1 + value / denominator);
}

function euclideanNormSquared(vector: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i]!;
    sum += value * value;
  }
  return sum;
}

function euclideanNorm(vector: ArrayLike<number>) {
  return Math.sqrt(euclideanNormSquared(vector));
}

function evaluateResiduals(
  A: DenseSystem,
  b: Float64Array,
  c: Float64Array,
  x: Float64Array,
  lambda: Float64Array,
  s: Float64Array,
  v: Float64Array,
  beta: number,
  scratch: ResidualScratch,
): ResidualMetrics {
  const { ax, atLambda, rX, rI, rLambda, rS, bPlus, bMinus } = scratch;

  matVec(A, x, ax);
  for (let i = 0; i < A.rows; i++) {
    rI[i] = ax[i]! - b[i]! - s[i]!;
    rLambda[i] = lambda[i]! - softplus(beta, v[i]!);
    rS[i] = s[i]! - softplus(beta, -v[i]!);
    bPlus[i] = softplusDerivative(beta, v[i]!);
    bMinus[i] = softplusDerivative(beta, -v[i]!);
  }

  transposedMatVec(A, lambda, atLambda);
  for (let j = 0; j < A.cols; j++) {
    rX[j] = c[j]! - atLambda[j]!;
  }

  const pObj = dot(c, x);
  const pRes = euclideanNorm(rI);
  const dRes = euclideanNorm(rX);
  const cRes = Math.max(euclideanNorm(rLambda), euclideanNorm(rS));

  return {
    pRes,
    dRes,
    cRes,
    gap: dot(lambda, s),
    pObj,
    merit: 0.5 * (euclideanNormSquared(rX) + euclideanNormSquared(rI) + euclideanNormSquared(rLambda) + euclideanNormSquared(rS)),
  };
}

function buildSoftplusBaseSystem(A: DenseSystem) {
  const { rows: m, cols: n, data } = A;
  const size = n + m;
  const system = new Float64Array(size * size);

  for (let j = 0; j < n; j++) {
    const rowOffset = j * size;
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let i = 0; i < m; i++) {
        sum += data[i * n + j]! * data[i * n + k]!;
      }
      system[rowOffset + k] = -sum;
    }

    for (let i = 0; i < m; i++) {
      system[rowOffset + n + i] = -data[i * n + j]!;
    }
  }

  for (let i = 0; i < m; i++) {
    const rowOffset = (n + i) * size;
    for (let j = 0; j < n; j++) {
      system[rowOffset + j] = -data[i * n + j]!;
    }
  }

  return system;
}

function initializeImplicitState(
  A: DenseSystem,
  b: Float64Array,
  c: Float64Array,
  x: Float64Array,
  lambda: Float64Array,
  s: Float64Array,
  v: Float64Array,
) {
  const { rows: m, cols: n, data } = A;
  const systemSize = n + m;
  const startSystem = new Float64Array(systemSize * systemSize);
  const startRhs = new Float64Array(systemSize);
  const startSolution = new Float64Array(systemSize);
  const luScratch = new Float64Array(systemSize * systemSize);

  for (let i = 0; i < m; i++) {
    const rowOffset = (n + i) * systemSize;
    const aOffset = i * n;
    for (let j = 0; j < n; j++) {
      const aij = data[aOffset + j]!;
      startSystem[rowOffset + j] = aij;
      startSystem[j * systemSize + (n + i)] = -aij;
    }
    startSystem[rowOffset + (n + i)] = 1;
  }

  for (let j = 0; j < n; j++) {
    startRhs[j] = -c[j]!;
  }
  for (let i = 0; i < m; i++) {
    startRhs[n + i] = b[i]!;
  }

  try {
    solveDenseSystem(startSystem, systemSize, startRhs, startSolution, luScratch);
  } catch {
    x.fill(0);
    lambda.fill(INITIAL_DUAL_SLACK);
    s.fill(INITIAL_DUAL_SLACK);
    const muFallback = dot(lambda, s) / m;
    for (let i = 0; i < m; i++) {
      v[i] = softplusInverse(lambda[i]!, muFallback);
    }
    return;
  }

  let lambdaMin = Number.POSITIVE_INFINITY;
  let slackMin = Number.POSITIVE_INFINITY;
  for (let i = 0; i < m; i++) {
    const lambdaHat = startSolution[n + i]!;
    const slackHat = -lambdaHat;
    lambdaMin = Math.min(lambdaMin, lambdaHat);
    slackMin = Math.min(slackMin, slackHat);
  }

  const lambdaShift = Math.max(0, INITIAL_DUAL_SLACK - lambdaMin);
  const slackShift = Math.max(0, INITIAL_DUAL_SLACK - slackMin);

  for (let j = 0; j < n; j++) {
    x[j] = startSolution[j]!;
  }
  for (let i = 0; i < m; i++) {
    const lambdaHat = startSolution[n + i]!;
    lambda[i] = lambdaHat + lambdaShift;
    s[i] = -lambdaHat + slackShift;
  }

  const mu = Math.max(MIN_MU, dot(lambda, s) / m);
  for (let i = 0; i < m; i++) {
    v[i] = softplusInverse(lambda[i]!, mu);
  }
}

function buildImplicitSystem(
  system: Float64Array,
  rhs: Float64Array,
  baseSystem: Float64Array,
  A: DenseSystem,
  bMinus: Float64Array,
  rX: Float64Array,
  rI: Float64Array,
  rLambda: Float64Array,
  rS: Float64Array,
) {
  const { rows: m, cols: n, data } = A;
  const size = n + m;
  system.set(baseSystem);

  for (let i = 0; i < m; i++) {
    system[(n + i) * size + n + i] = -bMinus[i]!;
  }

  for (let j = 0; j < n; j++) {
    let rhsValue = -rX[j]!;
    for (let i = 0; i < m; i++) {
      rhsValue += data[i * n + j]! * (rI[i]! - rLambda[i]! + rS[i]!);
    }
    rhs[j] = rhsValue;
  }

  for (let i = 0; i < m; i++) {
    rhs[n + i] = rI[i]! + rS[i]!;
  }
}

function findLineSearchStep(
  A: DenseSystem,
  b: Float64Array,
  c: Float64Array,
  x: Float64Array,
  lambda: Float64Array,
  s: Float64Array,
  v: Float64Array,
  beta: number,
  dx: Float64Array,
  dlambda: Float64Array,
  ds: Float64Array,
  dv: Float64Array,
  currentMerit: number,
  candidateX: Float64Array,
  candidateLambda: Float64Array,
  candidateS: Float64Array,
  candidateV: Float64Array,
  scratch: ResidualScratch,
) {
  let step = 1;

  while (step >= MIN_STEP_SIZE) {
    for (let j = 0; j < x.length; j++) {
      candidateX[j] = x[j]! + step * dx[j]!;
    }
    for (let i = 0; i < lambda.length; i++) {
      candidateLambda[i] = lambda[i]! + step * dlambda[i]!;
      candidateS[i] = s[i]! + step * ds[i]!;
      candidateV[i] = v[i]! + step * dv[i]!;
    }

    let nonnegativeDualSlack = true;
    for (let i = 0; i < lambda.length; i++) {
      if (candidateLambda[i]! < 0 || candidateS[i]! < 0) {
        nonnegativeDualSlack = false;
        break;
      }
    }

    if (nonnegativeDualSlack) {
      const candidateMetrics = evaluateResiduals(A, b, c, candidateX, candidateLambda, candidateS, candidateV, beta, scratch);
      if (candidateMetrics.merit <= (1 - LINE_SEARCH_ARMIJO_GAMMA * step) * currentMerit) {
        return step;
      }
    }

    step *= LINE_SEARCH_BACKTRACK_FACTOR;
  }

  return 0;
}

function findProjectedLineSearchStep(
  A: DenseSystem,
  b: Float64Array,
  c: Float64Array,
  x: Float64Array,
  v: Float64Array,
  beta: number,
  dx: Float64Array,
  dv: Float64Array,
  currentMerit: number,
  candidateX: Float64Array,
  candidateLambda: Float64Array,
  candidateS: Float64Array,
  candidateV: Float64Array,
  scratch: ResidualScratch,
) {
  // Some LPs drive one free λ_i almost to zero while the dual residual is still
  // large. The resulting Newton step is then positivity-limited to a uselessly
  // tiny step size (often ~1e-13), so the standard free-(λ,s) Armijo search
  // stalls even though the same (dx,dv) direction is still productive. In that
  // case we retry the line search on the softplus manifold itself by rebuilding
  // λ and s from the candidate v. This is a globalization safeguard for those
  // degenerate cases; it is not a different Newton system.
  let step = 1;

  while (step >= MIN_STEP_SIZE) {
    for (let j = 0; j < x.length; j++) {
      candidateX[j] = x[j]! + step * dx[j]!;
    }
    for (let i = 0; i < v.length; i++) {
      const nextV = v[i]! + step * dv[i]!;
      candidateV[i] = nextV;
      candidateLambda[i] = softplus(beta, nextV);
      candidateS[i] = softplus(beta, -nextV);
    }

    const candidateMetrics = evaluateResiduals(A, b, c, candidateX, candidateLambda, candidateS, candidateV, beta, scratch);
    if (candidateMetrics.merit <= (1 - LINE_SEARCH_ARMIJO_GAMMA * step) * currentMerit) {
      return step;
    }

    step *= LINE_SEARCH_BACKTRACK_FACTOR;
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
  const { eps_p, eps_d, eps_opt, maxit, verbose, colorByPhase } = opts;
  const m = A.rows;
  const n = A.cols;
  const systemSize = n + m;
  const centeringSigma = Math.max(0.001, Math.min(0.999, opts.implicitSigma ?? DEFAULT_CENTERING_SIGMA));
  const baseSystem = buildSoftplusBaseSystem(A);

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
  const lambda = new Float64Array(m).fill(INITIAL_DUAL_SLACK);
  const s = new Float64Array(m).fill(INITIAL_DUAL_SLACK);
  const v = new Float64Array(m);

  initializeImplicitState(A, b, c, x, lambda, s, v);

  let mu = dot(lambda, s) / m;

  const currentScratch: ResidualScratch = {
    ax: new Float64Array(m),
    atLambda: new Float64Array(n),
    rX: new Float64Array(n),
    rI: new Float64Array(m),
    rLambda: new Float64Array(m),
    rS: new Float64Array(m),
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
    bPlus: new Float64Array(m),
    bMinus: new Float64Array(m),
  };
  const system = new Float64Array(systemSize * systemSize);
  const rhs = new Float64Array(systemSize);
  const deltaCompact = new Float64Array(systemSize);
  const deltaFull = new Float64Array(n + 3 * m);
  const aDeltaX = new Float64Array(m);
  const luScratch = new Float64Array(systemSize * systemSize);
  const candidateX = new Float64Array(n);
  const candidateLambda = new Float64Array(m);
  const candidateS = new Float64Array(m);
  const candidateV = new Float64Array(m);
  const projectedCandidateX = new Float64Array(n);
  const projectedCandidateLambda = new Float64Array(m);
  const projectedCandidateS = new Float64Array(m);
  const projectedCandidateV = new Float64Array(m);

  let converged = false;
  let failureMessage: string | null = null;
  const startTime = performance.now();

  if (verbose) console.log(solution.header);

  for (let iteration = 0; iteration < maxit; iteration++) {
    mu = Math.max(MIN_MU, dot(lambda, s) / m);
    const beta = centeringSigma * mu;
    const metrics = evaluateResiduals(A, b, c, x, lambda, s, v, beta, currentScratch);
    const currentResidual = Math.max(metrics.pRes, metrics.dRes, metrics.cRes);

    logIter(solution, verbose, x, mu, metrics.pObj, currentResidual);
    pushIter(solution, x, s, lambda, mu);
    if (colorByPhase) {
      solution.phases!.push(computeComplementarityPhase(s, lambda));
    }

    if (metrics.dRes <= eps_d && metrics.pRes <= eps_p && metrics.gap <= eps_opt && metrics.cRes <= eps_opt) {
      converged = true;
      break;
    }

    buildImplicitSystem(
      system,
      rhs,
      baseSystem,
      A,
      currentScratch.bMinus,
      currentScratch.rX,
      currentScratch.rI,
      currentScratch.rLambda,
      currentScratch.rS,
    );

    try {
      solveDenseSystem(system, systemSize, rhs, deltaCompact, luScratch);
    } catch (error) {
      failureMessage = `Implicit IPM linear solve failed: ${error instanceof Error ? error.message : String(error)}`;
      if (verbose) console.log(failureMessage);
      break;
    }

    const dx = deltaCompact.subarray(0, n);
    const dv = deltaCompact.subarray(n, systemSize);
    const dlambda = deltaFull.subarray(n, n + m);
    const ds = deltaFull.subarray(n + m, n + 2 * m);

    matVec(A, dx, aDeltaX);
    for (let i = 0; i < m; i++) {
      ds[i] = aDeltaX[i]! + currentScratch.rI[i]!;
    }
    for (let i = 0; i < m; i++) {
      dlambda[i] = currentScratch.bPlus[i]! * dv[i]! - currentScratch.rLambda[i]!;
    }

    const step = findLineSearchStep(
      A,
      b,
      c,
      x,
      lambda,
      s,
      v,
      beta,
      dx,
      dlambda,
      ds,
      dv,
      metrics.merit,
      candidateX,
      candidateLambda,
      candidateS,
      candidateV,
      candidateScratch,
    );
    let acceptedStep = step;
    let acceptedX = candidateX;
    let acceptedLambda = candidateLambda;
    let acceptedS = candidateS;
    let acceptedV = candidateV;

    // If the free-(λ,s) search fails outright, or only accepts a microscopic
    // step, switch to the projected manifold search above. This specifically
    // protects against the "λ_i collapsed to ~0, α_pos ~ 1e-13" stall mode.
    if (step <= 0 || step < PROJECTED_FALLBACK_STEP_THRESHOLD) {
      const projectedStep = findProjectedLineSearchStep(
        A,
        b,
        c,
        x,
        v,
        beta,
        dx,
        dv,
        metrics.merit,
        projectedCandidateX,
        projectedCandidateLambda,
        projectedCandidateS,
        projectedCandidateV,
        candidateScratch,
      );
      if (projectedStep > acceptedStep) {
        acceptedStep = projectedStep;
        acceptedX = projectedCandidateX;
        acceptedLambda = projectedCandidateLambda;
        acceptedS = projectedCandidateS;
        acceptedV = projectedCandidateV;
      }
    }

    if (acceptedStep <= 0) {
      failureMessage = "Implicit IPM line search failed to reduce the residual.";
      if (verbose) console.log(failureMessage);
      break;
    }

    x.set(acceptedX);
    lambda.set(acceptedLambda);
    s.set(acceptedS);
    v.set(acceptedV);
  }

  const solveTime = performance.now() - startTime;
  logFinal(solution, verbose, converged, solveTime, failureMessage, "IPM");
  return result;
}
