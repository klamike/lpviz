import type { Lines, Vertices } from "@lpviz/math/types";
import { centralPath } from "@lpviz/solver-engine/centralPath";
import { ipm } from "@lpviz/solver-engine/ipm";
import { pdhg } from "@lpviz/solver-engine/pdhg";
import { simplex } from "@lpviz/solver-engine/simplex";
import {
  centralPathNumber,
  ipmNumber,
  pdhgNumber,
  simplexNumber,
} from "./numberArraySolvers";
import { problem20 } from "./problem20";

const TOLERANCE = 1e-5;
const BENCH_RUNS = 7;
const WARMUP_RUNS = 2;
const CENTRAL_PATH_POINTS = 300;
const IPM_ALPHA_MAX = 0.4;
const IPM_MAXIT = 5000;
const PDHG_STEP_SIZE = 0.05;
const PDHG_MAXIT = 5000;

type BenchResult = {
  solver: string;
  typedBest: number;
  typedMean: number;
  numberBest: number;
  numberMean: number;
  ratio: number;
};

function toNumberVector(vector: ArrayLike<number>) {
  return Array.from(vector);
}

function finalPoint(iterations: ArrayLike<ArrayLike<number>>) {
  if (iterations.length === 0) throw new Error("solver produced no iterations");
  return toNumberVector(iterations[iterations.length - 1]!);
}

function assertCloseVector(
  label: string,
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  tol = TOLERANCE,
) {
  if (actual.length !== expected.length) {
    throw new Error(
      `${label}: vector length mismatch ${actual.length} !== ${expected.length}`,
    );
  }
  for (let i = 0; i < actual.length; i++) {
    const delta = Math.abs(actual[i]! - expected[i]!);
    if (delta > tol) {
      throw new Error(
        `${label}: index ${i} differs by ${delta}; actual=${actual[i]}, expected=${expected[i]}`,
      );
    }
  }
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected)
    throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function timeRun(fn: () => unknown) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function measure(fn: () => unknown) {
  for (let i = 0; i < WARMUP_RUNS; i++) fn();
  const runs: number[] = [];
  for (let i = 0; i < BENCH_RUNS; i++) runs.push(timeRun(fn));
  return { best: Math.min(...runs), mean: mean(runs) };
}

function formatMs(value: number) {
  return `${value.toFixed(2)}ms`;
}

function validateFixture() {
  assertEqual("fixture constraint count", problem20.lines.length, 20);
  if (problem20.vertices.length < 3)
    throw new Error("fixture must have vertices");
}

function runBench<TTyped, TNumber>({
  name,
  typed,
  number,
  assertEquivalent,
}: {
  name: string;
  typed: () => TTyped;
  number: () => TNumber;
  assertEquivalent: (typedResult: TTyped, numberResult: TNumber) => void;
}): BenchResult {
  const typedResult = typed();
  const numberResult = number();
  assertEquivalent(typedResult, numberResult);

  const typedTiming = measure(typed);
  const numberTiming = measure(number);
  return {
    solver: name,
    typedBest: typedTiming.best,
    typedMean: typedTiming.mean,
    numberBest: numberTiming.best,
    numberMean: numberTiming.mean,
    ratio: numberTiming.best / typedTiming.best,
  };
}

function runTypedCentral(
  vertices: Vertices,
  lines: Lines,
  objective: Float64Array,
) {
  return centralPath(vertices, lines, objective, {
    niter: CENTRAL_PATH_POINTS,
    verbose: false,
  });
}

function runNumberCentral(
  vertices: Vertices,
  lines: Lines,
  objective: Float64Array,
) {
  return centralPathNumber(vertices, lines, objective, {
    niter: CENTRAL_PATH_POINTS,
    verbose: false,
  });
}

function runTypedIpm(lines: Lines, objective: Float64Array) {
  return ipm(lines, objective, {
    verbose: false,
    eps_p: TOLERANCE,
    eps_d: TOLERANCE,
    eps_opt: TOLERANCE,
    alphaMax: IPM_ALPHA_MAX,
    correctorThreshold: 0.9,
    maxit: IPM_MAXIT,
  });
}

function runNumberIpm(lines: Lines, objective: Float64Array) {
  return ipmNumber(lines, objective, {
    tol: TOLERANCE,
    verbose: false,
    eps_p: TOLERANCE,
    eps_d: TOLERANCE,
    eps_opt: TOLERANCE,
    alphaMax: IPM_ALPHA_MAX,
    correctorThreshold: 0.9,
    maxit: IPM_MAXIT,
  });
}

function runTypedSimplex(lines: Lines, objective: Float64Array, dual: boolean) {
  return simplex(lines, objective, { tol: TOLERANCE, verbose: false, dual });
}

function runNumberSimplex(
  lines: Lines,
  objective: Float64Array,
  dual: boolean,
) {
  return simplexNumber(lines, objective, {
    tol: TOLERANCE,
    verbose: false,
    dual,
  });
}

function runTypedPdhg(lines: Lines, objective: Float64Array, ineq: boolean) {
  return pdhg(lines, objective, {
    tol: TOLERANCE,
    verbose: false,
    ineq,
    halpern: false,
    maxit: PDHG_MAXIT,
    eta: PDHG_STEP_SIZE,
    tau: PDHG_STEP_SIZE,
    colorByBasis: false,
  });
}

function runNumberPdhg(lines: Lines, objective: Float64Array, ineq: boolean) {
  return pdhgNumber(lines, objective, {
    tol: TOLERANCE,
    verbose: false,
    ineq,
    halpern: false,
    maxit: PDHG_MAXIT,
    eta: PDHG_STEP_SIZE,
    tau: PDHG_STEP_SIZE,
    colorByBasis: false,
  });
}

function printResults(results: BenchResult[]) {
  const rows = results.map((result) => ({
    solver: result.solver,
    "TypedArray best": formatMs(result.typedBest),
    "TypedArray mean": formatMs(result.typedMean),
    "ml-matrix best": formatMs(result.numberBest),
    "ml-matrix mean": formatMs(result.numberMean),
    "ml-matrix/TypedArray": `${result.ratio.toFixed(2)}x`,
    check: "ok",
  }));
  console.table(rows);
}

function main() {
  validateFixture();
  const { lines, vertices, objective } = problem20;
  const results: BenchResult[] = [];

  results.push(
    runBench({
      name: "central",
      typed: () => runTypedCentral(vertices, lines, objective),
      number: () => runNumberCentral(vertices, lines, objective),
      assertEquivalent: (typedResult, numberResult) => {
        assertEqual(
          "central iteration count",
          typedResult.iterations.length,
          numberResult.iterations.length,
        );
        assertCloseVector(
          "central final point",
          finalPoint(typedResult.iterations),
          finalPoint(numberResult.iterations),
          5e-5,
        );
      },
    }),
  );

  results.push(
    runBench({
      name: "ipm",
      typed: () => runTypedIpm(lines, objective),
      number: () => runNumberIpm(lines, objective),
      assertEquivalent: (typedResult, numberResult) => {
        const typedIterations = typedResult.iterates.solution.x;
        const numberIterations = numberResult.iterates.solution.x;
        assertEqual(
          "ipm iteration count",
          typedIterations.length,
          numberIterations.length,
        );
        assertCloseVector(
          "ipm final point",
          finalPoint(typedIterations),
          finalPoint(numberIterations),
          5e-5,
        );
      },
    }),
  );

  for (const dual of [false, true]) {
    results.push(
      runBench({
        name: dual ? "simplex-dual" : "simplex-primal",
        typed: () => runTypedSimplex(lines, objective, dual),
        number: () => runNumberSimplex(lines, objective, dual),
        assertEquivalent: (typedResult, numberResult) => {
          assertEqual(
            `${dual ? "dual" : "primal"} simplex mode`,
            typedResult.mode,
            numberResult.mode,
          );
          assertEqual(
            `${dual ? "dual" : "primal"} simplex status`,
            typedResult.status,
            numberResult.status,
          );
          assertEqual(
            `${dual ? "dual" : "primal"} simplex iteration count`,
            typedResult.iterations.length,
            numberResult.iterations.length,
          );
          if (
            typedResult.iterations.length > 0 ||
            numberResult.iterations.length > 0
          ) {
            assertCloseVector(
              `${dual ? "dual" : "primal"} simplex final point`,
              finalPoint(typedResult.iterations),
              finalPoint(numberResult.iterations),
              5e-5,
            );
          }
        },
      }),
    );
  }

  for (const ineq of [false, true]) {
    results.push(
      runBench({
        name: ineq ? "pdhg-ineq" : "pdhg-eq",
        typed: () => runTypedPdhg(lines, objective, ineq),
        number: () => runNumberPdhg(lines, objective, ineq),
        assertEquivalent: (typedResult, numberResult) => {
          assertEqual(
            `${ineq ? "ineq" : "eq"} pdhg iteration count`,
            typedResult.iterations.length,
            numberResult.iterations.length,
          );
          assertCloseVector(
            `${ineq ? "ineq" : "eq"} pdhg final point`,
            finalPoint(typedResult.iterations),
            finalPoint(numberResult.iterations),
            5e-5,
          );
        },
      }),
    );
  }

  printResults(results);
}

main();
