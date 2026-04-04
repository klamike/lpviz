import { sprintf } from "sprintf-js";
import { type DenseMatrix, dot, linesToDenseAb, solveDenseSystem, transposedMatVec } from "./utils/dense";
import type { Lines, Vec2N, VecN, Vec2Ns } from "./utils/blas";

const MAX_ITERATIONS = 2 ** 16;

type SimplexStatus = "optimal" | "unbounded" | "unavailable";

interface SimplexOptions {
  tol: number;
  verbose: boolean;
  dual: boolean;
}

function createDenseMatrix(rows: number, cols: number, fill = 0): DenseMatrix {
  const data = new Float64Array(rows * cols);
  if (fill !== 0) data.fill(fill);
  return { rows, cols, data };
}

function identityMatrix(size: number): DenseMatrix {
  const matrix = createDenseMatrix(size, size);
  for (let i = 0; i < size; i++) {
    matrix.data[i * size + i] = 1;
  }
  return matrix;
}

function transposeMatrix(matrix: DenseMatrix): DenseMatrix {
  const out = createDenseMatrix(matrix.cols, matrix.rows);
  for (let row = 0; row < matrix.rows; row++) {
    const rowOffset = row * matrix.cols;
    for (let col = 0; col < matrix.cols; col++) {
      out.data[col * matrix.rows + row] = matrix.data[rowOffset + col]!;
    }
  }
  return out;
}

function scaleMatrix(matrix: DenseMatrix, scale: number): DenseMatrix {
  const out = createDenseMatrix(matrix.rows, matrix.cols);
  for (let i = 0; i < matrix.data.length; i++) {
    out.data[i] = matrix.data[i]! * scale;
  }
  return out;
}

function scaleRows(matrix: DenseMatrix, rowScales: ArrayLike<number>): DenseMatrix {
  const out = createDenseMatrix(matrix.rows, matrix.cols);
  for (let row = 0; row < matrix.rows; row++) {
    const scale = rowScales[row]!;
    const rowOffset = row * matrix.cols;
    for (let col = 0; col < matrix.cols; col++) {
      out.data[rowOffset + col] = matrix.data[rowOffset + col]! * scale;
    }
  }
  return out;
}

function hstackMatrices(...matrices: DenseMatrix[]): DenseMatrix {
  if (matrices.length === 0) return createDenseMatrix(0, 0);
  const rows = matrices[0]!.rows;
  const cols = matrices.reduce((sum, matrix) => sum + matrix.cols, 0);
  const out = createDenseMatrix(rows, cols);
  let colOffset = 0;
  for (const matrix of matrices) {
    if (matrix.rows !== rows) {
      throw new Error("hstackMatrices: all matrices must have the same number of rows");
    }
    for (let row = 0; row < rows; row++) {
      const srcOffset = row * matrix.cols;
      const dstOffset = row * cols + colOffset;
      for (let col = 0; col < matrix.cols; col++) {
        out.data[dstOffset + col] = matrix.data[srcOffset + col]!;
      }
    }
    colOffset += matrix.cols;
  }
  return out;
}

function concatenateVectors(...vectors: ArrayLike<number>[]): Float64Array {
  const totalLength = vectors.reduce((sum, vector) => sum + vector.length, 0);
  const out = new Float64Array(totalLength);
  let offset = 0;
  for (const vector of vectors) {
    for (let i = 0; i < vector.length; i++) {
      out[offset + i] = vector[i]!;
    }
    offset += vector.length;
  }
  return out;
}

function extractColumn(matrix: DenseMatrix, column: number, out = new Float64Array(matrix.rows)) {
  for (let row = 0; row < matrix.rows; row++) {
    out[row] = matrix.data[row * matrix.cols + column]!;
  }
  return out;
}

function countBasicVariables(basis: boolean[]) {
  let count = 0;
  for (const isBasic of basis) {
    if (isBasic) count++;
  }
  return count;
}

function basisString(basis: boolean[]) {
  return basis.map((isBasic) => (isBasic ? 1 : 0)).join("");
}

function buildBasisState(cVec: Float64Array, A: DenseMatrix, bVec: Float64Array, basis: boolean[]) {
  const mRows = A.rows;
  const nCols = A.cols;
  const basisIndices: number[] = [];

  for (let i = 0; i < nCols; i++) {
    if (basis[i]) basisIndices.push(i);
  }
  if (basisIndices.length !== mRows) {
    throw new Error(`Basis size ${basisIndices.length} does not match number of constraints ${mRows}. Basis: ${basisString(basis)}`);
  }

  const B = createDenseMatrix(mRows, mRows);
  for (let basisCol = 0; basisCol < mRows; basisCol++) {
    const sourceCol = basisIndices[basisCol]!;
    for (let row = 0; row < mRows; row++) {
      B.data[row * mRows + basisCol] = A.data[row * nCols + sourceCol]!;
    }
  }

  const xB = new Float64Array(mRows);
  solveDenseSystem(B.data, mRows, bVec, xB);

  const xTableau = new Float64Array(nCols);
  for (let basisIndex = 0; basisIndex < mRows; basisIndex++) {
    xTableau[basisIndices[basisIndex]!] = xB[basisIndex]!;
  }

  const cB = new Float64Array(mRows);
  for (let i = 0; i < mRows; i++) {
    cB[i] = cVec[basisIndices[i]!]!;
  }

  const BT = transposeMatrix(B);
  const y = new Float64Array(mRows);
  solveDenseSystem(BT.data, mRows, cB, y);

  const aty = new Float64Array(nCols);
  transposedMatVec(A, y, aty);
  const reducedCosts = new Float64Array(nCols);
  for (let j = 0; j < nCols; j++) {
    reducedCosts[j] = cVec[j]! - aty[j]!;
  }

  return {
    B,
    xB,
    xTableau,
    basisIndices,
    reducedCosts,
    objective: dot(cVec, xTableau),
  };
}

function formatIterationLog(iteration: number, xTableau: Float64Array, objective: number, basis: boolean[], nOrig: number) {
  const x0 = nOrig >= 1 ? (xTableau[0] ?? 0) - (xTableau[nOrig] ?? 0) : 0;
  const y0 = nOrig >= 2 ? (xTableau[1] ?? 0) - (xTableau[nOrig + 1] ?? 0) : 0;
  return sprintf("%5d %+8.2f %+8.2f %+10.1e %s\n", iteration, x0, y0, objective, basisString(basis));
}

function recoverPrimalPointFromDualBasis(lines: Lines, basisIndices: number[], tol: number): [number, number] {
  const support = basisIndices.filter((index) => index < lines.length).slice(0, 2);
  if (support.length < 2) return [0, 0];

  const [i, j] = support;
  const first = lines[i]!;
  const second = lines[j]!;
  const determinant = first[0]! * second[1]! - first[1]! * second[0]!;
  if (Math.abs(determinant) <= tol) return [0, 0];

  const x = (first[2]! * second[1]! - first[1]! * second[2]!) / determinant;
  const y = (first[0]! * second[2]! - first[2]! * second[0]!) / determinant;
  return [x, y];
}

function simplexCoreStandard(
  cVec: Float64Array,
  A: DenseMatrix,
  bVec: Float64Array,
  basisInit: boolean[],
  cfg: {
    tol: number;
    verbose: boolean;
    pointFromBasis: (basisIndices: number[]) => [number, number];
    completionLabel: string;
  },
) {
  const { tol, verbose, pointFromBasis, completionLabel } = cfg;
  const mRows = A.rows;
  const nCols = A.cols;
  let basis = basisInit.slice();
  const iterations: Vec2Ns = [];
  const basisHistory: number[][] = [];
  const logs: string[] = [];
  const header = sprintf("%5s %8s %8s %10s %s\n", "Iter", "x", "y", "Obj", "basis".padEnd(nCols, " "));

  if (verbose) console.log(header);
  logs.push(header);

  let iteration = 0;
  let status: SimplexStatus = "optimal";
  let objective = 0;
  const enterColumn = new Float64Array(mRows);
  const direction = new Float64Array(mRows);

  while (true) {
    if (++iteration > MAX_ITERATIONS) throw new Error(`Simplex stalled after ${MAX_ITERATIONS} iterations`);

    const state = buildBasisState(cVec, A, bVec, basis);
    iterations.push(Array.from(state.xTableau));
    basisHistory.push(state.basisIndices.slice());
    objective = state.objective;

    const [x, y] = pointFromBasis(state.basisIndices);
    const line = sprintf("%5d %+8.2f %+8.2f %+10.1e %s\n", iteration, x, y, objective, basisString(basis));
    if (verbose) console.log(line);
    logs.push(line);

    let enterIndex = -1;
    for (let j = 0; j < nCols; j++) {
      if (!basis[j] && state.reducedCosts[j]! > tol) {
        enterIndex = j;
        break;
      }
    }
    if (enterIndex === -1) break;

    extractColumn(A, enterIndex, enterColumn);
    solveDenseSystem(state.B.data, state.B.rows, enterColumn, direction);

    let leaveBasisIndex = -1;
    let minRatio = Infinity;
    let smallestLeavingIndex = Infinity;
    for (let i = 0; i < mRows; i++) {
      if (direction[i]! <= tol) continue;
      const ratio = state.xB[i]! / direction[i]!;
      const originalIndex = state.basisIndices[i]!;
      if (ratio < minRatio - tol || (Math.abs(ratio - minRatio) < tol && originalIndex < smallestLeavingIndex)) {
        minRatio = ratio;
        leaveBasisIndex = i;
        smallestLeavingIndex = originalIndex;
      }
    }

    if (leaveBasisIndex === -1) {
      const message = "LP is unbounded. No leaving variable found.";
      if (verbose) console.log(message);
      logs.push(message);
      status = "unbounded";
      break;
    }

    basis[enterIndex] = true;
    basis[state.basisIndices[leaveBasisIndex]!] = false;
  }

  const finalBasis = basis.slice();
  const tail = `${completionLabel} finished – basis ${basisString(finalBasis)}\n`;
  if (verbose) console.log(tail);
  logs.push(tail);

  return {
    iterations,
    basisHistory,
    logs,
    finalBasis,
    objective,
    status,
  };
}

function simplexCore(
  cVec: Float64Array,
  A: DenseMatrix,
  bVec: Float64Array,
  basisInit: boolean[],
  cfg: {
    tol: number;
    verbose: boolean;
    phase1: boolean;
    nOrig: number;
    m: number;
  },
) {
  const { tol, verbose, phase1, nOrig, m } = cfg;
  const mRows = A.rows;
  const nCols = A.cols;

  if (mRows !== m || bVec.length !== m) {
    throw new Error(`Dimension mismatch: A.rows=${mRows} vs m=${m}, bVec.length=${bVec.length} vs m=${m}`);
  }

  let basis = basisInit.slice();
  const iterations: Vec2Ns = [];
  const logs: string[] = [];
  const header = sprintf("%5s %8s %8s %10s %s\n", "Iter", "x", "y", "Obj", "basis".padEnd(nCols, " "));
  if (verbose) console.log(header);
  logs.push(header);

  let iteration = 0;
  let xTableau = new Float64Array(nCols);
  let objective = 0;
  let status: SimplexStatus = "optimal";
  let basisIndices: number[] = [];
  const enterColumn = new Float64Array(mRows);
  const direction = new Float64Array(mRows);

  while (true) {
    if (++iteration > MAX_ITERATIONS) throw new Error(`Simplex stalled after ${MAX_ITERATIONS} iterations`);

    const state = buildBasisState(cVec, A, bVec, basis);
    basisIndices = state.basisIndices;
    xTableau = state.xTableau;
    objective = state.objective;
    iterations.push(Array.from(xTableau));

    const line = formatIterationLog(iteration, xTableau, objective, basis, nOrig);
    if (verbose) console.log(line);
    logs.push(line);

    let enterIndex = -1;
    for (let j = 0; j < nCols; j++) {
      if (!basis[j] && state.reducedCosts[j]! > tol) {
        enterIndex = j;
        break;
      }
    }
    if (enterIndex === -1) break;

    extractColumn(A, enterIndex, enterColumn);
    solveDenseSystem(state.B.data, state.B.rows, enterColumn, direction);

    let leaveIndexInBasis = -1;
    let minRatio = Infinity;
    let smallestLeavingOriginalIndex = Infinity;
    for (let i = 0; i < mRows; i++) {
      if (direction[i]! <= tol) continue;
      const ratio = state.xB[i]! / direction[i]!;
      const originalIndex = basisIndices[i]!;
      if (ratio < minRatio - tol || (Math.abs(ratio - minRatio) < tol && originalIndex < smallestLeavingOriginalIndex)) {
        minRatio = ratio;
        leaveIndexInBasis = i;
        smallestLeavingOriginalIndex = originalIndex;
      }
    }

    if (leaveIndexInBasis === -1) {
      const message = "LP is unbounded. No leaving variable found.";
      if (verbose) console.log(message);
      logs.push(message);
      status = "unbounded";
      break;
    }

    basis[enterIndex] = true;
    basis[basisIndices[leaveIndexInBasis]!] = false;
  }

  let finalBasis = basis.slice();
  if (phase1) {
    const artificialVarsStartIndex = 2 * nOrig + m;
    let problemInfeasible = false;

    for (let i = 0; i < m; i++) {
      const artificialVariableIndex = artificialVarsStartIndex + i;
      if (!finalBasis[artificialVariableIndex]) continue;
      if (xTableau[artificialVariableIndex]! > tol) {
        problemInfeasible = true;
        break;
      }
    }

    if (problemInfeasible) {
      const message = "Problem infeasible (Phase-1 optimum > 0, an artificial variable is basic with positive value)";
      if (verbose) console.log(message);
      logs.push(message);
      if (Math.abs(objective) > tol) throw new Error(message);
    }

    finalBasis = finalBasis.slice(0, 2 * nOrig + m);
    let currentBasicCount = countBasicVariables(finalBasis);
    if (currentBasicCount < m) {
      for (let j = 2 * nOrig; j < 2 * nOrig + m && currentBasicCount < m; j++) {
        if (!finalBasis[j]) {
          finalBasis[j] = true;
          currentBasicCount++;
        }
      }
    }

    if (countBasicVariables(finalBasis) !== m) {
      const message = `Phase 1 resulted in a basis for Phase 2 of size ${countBasicVariables(finalBasis)}, expected ${m}.`;
      if (verbose) console.warn(message);
      logs.push(message);
    }
  }

  const tail = `Phase ${phase1 ? 1 : 2} finished – basis ${basisString(finalBasis)}\n`;
  if (verbose) console.log(tail);
  logs.push(tail);

  return {
    iterations,
    finalBasis,
    logs,
    status,
  };
}

function pivotOutArtificialVariables(
  phase1Matrix: DenseMatrix,
  bVec: Float64Array,
  basisInit: boolean[],
  originalColumnCount: number,
  tol: number,
) {
  const basis = basisInit.slice();
  const zeroCosts = new Float64Array(phase1Matrix.cols);
  const column = new Float64Array(phase1Matrix.rows);
  const direction = new Float64Array(phase1Matrix.rows);

  while (true) {
    const basisIndices = basis.flatMap((isBasic, index) => (isBasic ? [index] : []));
    const artificialIndex = basisIndices.find((index) => index >= originalColumnCount);
    if (artificialIndex === undefined) break;

    const rowIndex = basisIndices.indexOf(artificialIndex);
    const state = buildBasisState(zeroCosts, phase1Matrix, bVec, basis);
    let replacement = -1;

    for (let j = 0; j < originalColumnCount; j++) {
      if (basis[j]) continue;
      extractColumn(phase1Matrix, j, column);
      solveDenseSystem(state.B.data, state.B.rows, column, direction);
      if (Math.abs(direction[rowIndex]!) > tol) {
        replacement = j;
        break;
      }
    }

    if (replacement === -1) {
      throw new Error("Could not pivot artificial variables out of the dual Phase 1 basis.");
    }

    basis[artificialIndex] = false;
    basis[replacement] = true;
  }

  const phase2Basis = basis.slice(0, originalColumnCount);
  if (countBasicVariables(phase2Basis) !== bVec.length) {
    throw new Error("Dual Phase 1 did not produce a valid Phase 2 basis.");
  }
  return phase2Basis;
}

function solveDualMode(
  lines: Lines,
  primalA: DenseMatrix,
  primalB: Float64Array,
  objective: Float64Array,
  opts: Pick<SimplexOptions, "tol" | "verbose">,
) {
  const { tol, verbose } = opts;
  const dualA = transposeMatrix(primalA);
  const bDual = Float64Array.from(objective);
  const cDual = Float64Array.from(primalB, (value) => -value);
  const gamma = Float64Array.from(bDual, (value) => (value < 0 ? -1 : 1));
  const bPhase1 = Float64Array.from(bDual, (value, index) => value * gamma[index]!);
  const aPhase2 = scaleRows(dualA, gamma);
  const artificial = identityMatrix(aPhase2.rows);
  const aPhase1 = hstackMatrices(aPhase2, artificial);
  const cPhase1 = concatenateVectors(new Float64Array(aPhase2.cols), Float64Array.from({ length: aPhase2.rows }, () => -1));
  const phase1Basis = Array(aPhase2.cols + aPhase2.rows).fill(false);
  for (let i = 0; i < aPhase2.rows; i++) phase1Basis[aPhase2.cols + i] = true;

  const dualPointFromBasis = (basisIndices: number[]) => recoverPrimalPointFromDualBasis(lines, basisIndices, tol);

  if (verbose) console.log("Phase 1");
  const phase1 = simplexCoreStandard(cPhase1, aPhase1, bPhase1, phase1Basis, {
    tol,
    verbose,
    pointFromBasis: dualPointFromBasis,
    completionLabel: "Phase 1",
  });

  if (Math.abs(phase1.objective) > tol) {
    const unavailableMessage = "Dual simplex unavailable";
    const phase2Logs = ["Phase 2 did not start.\n", unavailableMessage];
    if (verbose) console.log(unavailableMessage);
    return {
      iterations: [],
      logs: [phase1.logs, phase2Logs],
      status: "unavailable" as const,
    };
  }

  const phase2Basis = pivotOutArtificialVariables(aPhase1, bPhase1, phase1.finalBasis, aPhase2.cols, tol);

  if (verbose) console.log("Phase 2");
  const phase2 = simplexCoreStandard(cDual, aPhase2, bPhase1, phase2Basis, {
    tol,
    verbose,
    pointFromBasis: dualPointFromBasis,
    completionLabel: "Phase 2",
  });

  return {
    iterations: phase2.basisHistory.map((basisIndices) => dualPointFromBasis(basisIndices)),
    logs: [phase1.logs, phase2.logs],
    status: phase2.status,
  };
}

export function simplex(lines: Lines, objective: VecN, opts: SimplexOptions) {
  const { tol, verbose, dual } = opts;
  const { A: aOriginal, b } = linesToDenseAb(lines);
  const m = aOriginal.rows;
  const n = aOriginal.cols;
  const cObjective = Float64Array.from(objective);

  if (dual) {
    return {
      ...solveDualMode(lines, aOriginal, b, cObjective, { tol, verbose }),
      mode: "dual" as const,
    };
  }

  const gamma = Float64Array.from(b, (value) => (value < 0 ? -1 : 1));
  const bPhase1 = Float64Array.from(b, (value, index) => value * gamma[index]!);
  const aPositive = scaleRows(aOriginal, gamma);
  const aNegative = scaleMatrix(aPositive, -1);
  const gammaIdentity = createDenseMatrix(m, m);
  for (let i = 0; i < m; i++) {
    gammaIdentity.data[i * m + i] = gamma[i]!;
  }
  const identity = identityMatrix(m);
  const aPhase1 = hstackMatrices(aPositive, aNegative, gammaIdentity, identity);
  const cPhase1 = concatenateVectors(new Float64Array(2 * n + m), Float64Array.from({ length: m }, () => -1));
  const phase1Basis = Array(2 * n + 2 * m).fill(false);
  for (let i = 0; i < m; i++) phase1Basis[2 * n + m + i] = true;

  const cPhase2 = concatenateVectors(cObjective, Float64Array.from(cObjective, (value) => -value), new Float64Array(m));
  const aPhase2 = hstackMatrices(aOriginal, scaleMatrix(aOriginal, -1), identity);

  if (verbose) console.log("Phase One");
  const { finalBasis: rawBasis1, logs: log1 } = simplexCore(cPhase1, aPhase1, bPhase1, phase1Basis, {
    tol,
    verbose,
    phase1: true,
    nOrig: n,
    m,
  });

  if (verbose) console.log("Primal Simplex");
  const { iterations, logs, status } = simplexCore(cPhase2, aPhase2, b, rawBasis1, {
    tol,
    verbose,
    phase1: false,
    nOrig: n,
    m,
  });

  const xIterations = iterations.map((tableauX: Vec2N) => {
    const point = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      point[i] = (tableauX[i] ?? 0) - (tableauX[n + i] ?? 0);
    }
    return Array.from(point);
  });

  return {
    iterations: xIterations,
    logs: [log1, logs],
    mode: "primal" as const,
    status,
  };
}
