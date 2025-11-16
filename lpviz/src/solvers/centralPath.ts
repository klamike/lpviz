import { Matrix, solve } from "ml-matrix";
import { sprintf } from "sprintf-js";
import { linesToAb, diag } from "./utils/blas";
import { Lines, Vertices, VectorM, VectorN, VecN, VecNs } from "../types/arrays";
import { centroid } from "./utils/polytope";

const MIN_STEP_SIZE = 1e-10;
const LINE_SEARCH_SHRINK_FACTOR = 0.5;
const LINE_SEARCH_SUFFICIENT_DECREASE = 0.01;
const MAX_LINE_SEARCH_ITERATIONS = 100;
const DEFAULT_CONVERGENCE_TOLERANCE = 1e-4;
const DEFAULT_MAX_NEWTON_ITERATIONS = 2000;
const BARRIER_PARAM_START = 3.0; // 10^3 = 1000
const BARRIER_PARAM_END = -5.0; // 10^-5 = 0.00001

export interface CentralPathOptions {
  niter: number;
  verbose: boolean;
}

export interface CentralPathXkOptions {
  maxit: number;
  epsilon: number;
  verbose: boolean;
}

function computeNewtonStep(Amatrix: Matrix, cVec: VectorN, mu: number, slackVariables: VectorM): VectorN | null {
  try {
    const invSlack = Matrix.pow(slackVariables, -1);
    const gradient = Matrix.sub(cVec, Amatrix.transpose().mmul(invSlack).mul(mu));
    const hessian = Amatrix.transpose().mmul(diag(Matrix.pow(invSlack, 2))).mmul(Amatrix).mul(mu);
    return solve(hessian, gradient);
  } catch (error) {
    console.error("Error in Newton step computation:", error);
    return null;
  }
}

function performLineSearch(currentPoint: VectorN, newtonStep: VectorN, calculateObjective: (point: VectorN) => number, gradient: VectorN): number {
  let stepSize = 1.0;
  const currentObjective = calculateObjective(currentPoint);
  const gradientDotStep = gradient.dot(newtonStep);

  for (let i = 0; i < MAX_LINE_SEARCH_ITERATIONS; i++) {
    const candidateObjective = calculateObjective(Matrix.add(currentPoint, Matrix.mul(newtonStep, stepSize)));

    if (candidateObjective !== -Infinity && 
        candidateObjective >= currentObjective + LINE_SEARCH_SUFFICIENT_DECREASE * stepSize * gradientDotStep) {
      return stepSize;
    }

    stepSize *= LINE_SEARCH_SHRINK_FACTOR;
    if (stepSize < MIN_STEP_SIZE) {
      console.warn("Line search: step size too small");
      return stepSize;
    }
  }

  console.error("Line search: maximum iterations reached");
  return stepSize;
}

// minimize c^T x + μ * Σ log(b_i - a_i^T x)
function centralPathXk(Amatrix: Matrix, bVec: VectorM, cVec: VectorN, mu: number, x0Vec: VectorN, opts: CentralPathXkOptions) {
  const { maxit, epsilon, verbose } = opts;

  let currentPoint = x0Vec.clone();

  function calculateObjective(point: VectorN): number {
    const slackVariables = Matrix.sub(bVec, Amatrix.mmul(point));
    if (slackVariables.min() <= 0) return -Infinity;
    return cVec.dot(point) + mu * slackVariables.log().sum();
  }

  for (let iteration = 1; iteration <= maxit; iteration++) {
    const slackVariables = Matrix.sub(bVec, Amatrix.mmul(currentPoint));

    if (slackVariables.min() <= 0) {
      console.error(`Infeasible point encountered at iteration ${iteration}`);
      return null;
    }

    const newtonStep = computeNewtonStep(Amatrix, cVec, mu, slackVariables);
    if (newtonStep === null) {
      console.error(`Error computing Newton step at iteration ${iteration}`);
      return null;
    }

    const inverseSlack = Matrix.pow(slackVariables, -1);
    const gradient = Matrix.sub(cVec, Amatrix.transpose().mmul(inverseSlack).mul(mu));

    const stepSize = performLineSearch(currentPoint, newtonStep, calculateObjective, gradient);

    currentPoint = Matrix.add(currentPoint, Matrix.mul(newtonStep, stepSize));

    if (gradient.max() < epsilon) {
      if (verbose) console.log(`Converged in ${iteration} iterations with mu = ${mu}`);
      return currentPoint;
    }

    if (verbose) {
      console.log(sprintf("Iter %d: f(x) = %.6f, ||grad||_inf = %.2e, alpha = %.2f", iteration, calculateObjective(currentPoint), gradient.max(), stepSize));
    }
  }

  if (verbose) console.warn(`Did not converge after ${maxit} iterations for mu = ${mu}`);
  return null;
}

// Central path: smooth curve from analytic center (μ→∞) to optimal solution (μ→0)
export function centralPath(vertices: Vertices, lines: Lines, objective: VecN, opts: CentralPathOptions) {
  const { niter, verbose } = opts;

  if (niter > 2 ** 10) {
    throw new Error("niter > 2^10 not allowed");
  }
  const tStart = Date.now();

  const { A, b } = linesToAb(lines);
  const objectiveVector = Matrix.columnVector(objective);
  const barrierParameters = centralPathMu(niter);

  const centralPathPoints: VecNs = [];
  const progressLogs: string[] = [];

  let headerLog = sprintf("  %-4s %8s %8s %10s %10s  \n", "Iter", "x", "y", "Obj", "µ");
  if (verbose) console.log(headerLog);
  progressLogs.push(headerLog);

  let currentPoint = Matrix.columnVector(centroid(vertices));

  for (const currentMu of barrierParameters) {
    const optimalPoint = centralPathXk(A, b, objectiveVector, currentMu, currentPoint, {
      verbose,
      epsilon: DEFAULT_CONVERGENCE_TOLERANCE,
      maxit: DEFAULT_MAX_NEWTON_ITERATIONS,
    });

    if (optimalPoint !== null && optimalPoint.rows > 0) {
      const slackVariables = Matrix.sub(b, A.mmul(optimalPoint));
      const linearObjective = objectiveVector.dot(optimalPoint);
      const totalObjective = linearObjective + currentMu * slackVariables.log().sum();

      centralPathPoints.push([...optimalPoint.to1DArray(), totalObjective]);

      const xCoord = optimalPoint.get(0, 0) ?? 0;
      const yCoord = optimalPoint.get(1, 0) ?? 0;

      const progressLog = sprintf("  %-4d %+8.2f %+8.2f %+10.1e %10.1e  \n", centralPathPoints.length, xCoord, yCoord, linearObjective, currentMu);
      if (verbose) console.log(progressLog);
      progressLogs.push(progressLog);

      currentPoint = optimalPoint;
    } else {
      if (verbose) console.log(`Failed to find optimal point for μ = ${currentMu}. Skipping.`);
    }
  }
  const solveTime = (Date.now() - tStart) / 1000.0;
  return {
    iterations: centralPathPoints,
    logs: progressLogs,
    tsolve: solveTime,
  };
}

// μ → ∞: analytic center, μ → 0: optimal vertex
function centralPathMu(niter: number): number[] {
  if (niter <= 0) return [];
  if (niter === 1) return [1000.0];

  const stepSize = (BARRIER_PARAM_END - BARRIER_PARAM_START) / (niter - 1);
  return Array.from({ length: niter }, (_, i) => 10.0 ** (BARRIER_PARAM_START + i * stepSize));
}
