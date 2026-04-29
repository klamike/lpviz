import { Matrix, solve } from "ml-matrix";
import type { Lines, Vertices } from "@lpviz/math/types";

type DenseMatrixN = {
  rows: number;
  cols: number;
  data: number[];
};

type SimplexStatus = "optimal" | "unbounded" | "unavailable";

export interface BaseOptionsN {
  tol: number;
  verbose: boolean;
}

export interface IPMOptionsN extends BaseOptionsN {
  eps_p: number;
  eps_d: number;
  eps_opt: number;
  maxit: number;
  alphaMax: number;
  correctorThreshold: number;
}

export interface SimplexOptionsN extends BaseOptionsN {
  dual: boolean;
}

export interface PDHGOptionsN extends BaseOptionsN {
  ineq: boolean;
  halpern: boolean;
  maxit: number;
  eta: number;
  tau: number;
  colorByBasis: boolean;
}

export interface CentralPathOptionsN {
  niter: number;
  verbose: boolean;
}

const MAX_ITERATIONS_LIMIT = 100_000;
const MAX_SIMPLEX_ITERATIONS = 100_000;
const SIGMA_MIN = 1e-8;
const SIGMA_MAX = 1 - 1e-8;
const SIGMA_POWER = 3;
const BASIS_THRESHOLD = 1e-10;
const MIN_STEP_SIZE = 1e-10;
const LINE_SEARCH_SHRINK_FACTOR = 0.5;
const LINE_SEARCH_SUFFICIENT_DECREASE = 0.01;
const MAX_LINE_SEARCH_ITERATIONS = 100;
const DEFAULT_CONVERGENCE_TOLERANCE = 1e-4;
const DEFAULT_MAX_NEWTON_ITERATIONS = 2000;
const BARRIER_PARAM_START = 3.0;
const BARRIER_PARAM_END = -5.0;
const HALPERN_SUFFICIENT_REDUCTION = 0.2;
const HALPERN_NECESSARY_REDUCTION = 0.5;
const HALPERN_ARTIFICIAL_RESTART_THRESHOLD = 0.36;

function zeros(length: number) {
  return Array.from({ length }, () => 0);
}

function filled(length: number, value: number) {
  return Array.from({ length }, () => value);
}

function clone(vector: ArrayLike<number>) {
  return Array.from(vector);
}

function createDenseMatrix(rows: number, cols: number, fill = 0): DenseMatrixN {
  return { rows, cols, data: filled(rows * cols, fill) };
}

function identityMatrix(size: number): DenseMatrixN {
  const matrix = createDenseMatrix(size, size);
  for (let i = 0; i < size; i++) matrix.data[i * size + i] = 1;
  return matrix;
}

function linesToDenseAb(lines: Lines) {
  const rows = lines.length;
  const cols = rows === 0 ? 0 : lines[0]!.length - 1;
  const data = zeros(rows * cols);
  const b = zeros(rows);
  for (let i = 0; i < rows; i++) {
    const line = lines[i]!;
    const rowOffset = i * cols;
    for (let j = 0; j < cols; j++) data[rowOffset + j] = line[j]!;
    b[i] = line[cols]!;
  }
  return { A: { rows, cols, data }, b };
}

function denseToMatrix(matrix: DenseMatrixN) {
  const rows: number[][] = [];
  for (let row = 0; row < matrix.rows; row++) {
    const rowOffset = row * matrix.cols;
    rows.push(matrix.data.slice(rowOffset, rowOffset + matrix.cols));
  }
  return new Matrix(rows);
}

function infinityNorm(vector: ArrayLike<number>) {
  let maxValue = 0;
  for (let i = 0; i < vector.length; i++) {
    const absoluteValue = Math.abs(vector[i]!);
    if (absoluteValue > maxValue) maxValue = absoluteValue;
  }
  return maxValue;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

function matVec(matrix: DenseMatrixN, vector: ArrayLike<number>) {
  return denseToMatrix(matrix).mmul(Matrix.columnVector(Array.from(vector))).to1DArray();
}

function transposedMatVec(matrix: DenseMatrixN, vector: ArrayLike<number>) {
  return denseToMatrix(matrix).transpose().mmul(Matrix.columnVector(Array.from(vector))).to1DArray();
}

function solveDenseSystem(matrix: ArrayLike<number>, size: number, rhs: ArrayLike<number>) {
  const rows: number[][] = [];
  for (let row = 0; row < size; row++) {
    const rowOffset = row * size;
    rows.push(Array.from(matrix).slice(rowOffset, rowOffset + size));
  }
  return solve(new Matrix(rows), Matrix.columnVector(Array.from(rhs))).to1DArray();
}

function transposeMatrix(matrix: DenseMatrixN): DenseMatrixN {
  const out = createDenseMatrix(matrix.cols, matrix.rows);
  for (let row = 0; row < matrix.rows; row++) {
    const rowOffset = row * matrix.cols;
    for (let col = 0; col < matrix.cols; col++) {
      out.data[col * matrix.rows + row] = matrix.data[rowOffset + col]!;
    }
  }
  return out;
}

function scaleMatrix(matrix: DenseMatrixN, scale: number): DenseMatrixN {
  const out = createDenseMatrix(matrix.rows, matrix.cols);
  for (let i = 0; i < matrix.data.length; i++) out.data[i] = matrix.data[i]! * scale;
  return out;
}

function scaleRows(matrix: DenseMatrixN, rowScales: ArrayLike<number>): DenseMatrixN {
  const out = createDenseMatrix(matrix.rows, matrix.cols);
  for (let row = 0; row < matrix.rows; row++) {
    const scale = rowScales[row]!;
    const rowOffset = row * matrix.cols;
    for (let col = 0; col < matrix.cols; col++) out.data[rowOffset + col] = matrix.data[rowOffset + col]! * scale;
  }
  return out;
}

function hstackMatrices(...matrices: DenseMatrixN[]): DenseMatrixN {
  if (matrices.length === 0) return createDenseMatrix(0, 0);
  const rows = matrices[0]!.rows;
  const cols = matrices.reduce((sum, matrix) => sum + matrix.cols, 0);
  const out = createDenseMatrix(rows, cols);
  let colOffset = 0;
  for (const matrix of matrices) {
    if (matrix.rows !== rows) throw new Error("hstackMatrices: all matrices must have the same number of rows");
    for (let row = 0; row < rows; row++) {
      const srcOffset = row * matrix.cols;
      const dstOffset = row * cols + colOffset;
      for (let col = 0; col < matrix.cols; col++) out.data[dstOffset + col] = matrix.data[srcOffset + col]!;
    }
    colOffset += matrix.cols;
  }
  return out;
}

function concatenateVectors(...vectors: ArrayLike<number>[]): number[] {
  const totalLength = vectors.reduce((sum, vector) => sum + vector.length, 0);
  const out = zeros(totalLength);
  let offset = 0;
  for (const vector of vectors) {
    for (let i = 0; i < vector.length; i++) out[offset + i] = vector[i]!;
    offset += vector.length;
  }
  return out;
}

function extractColumn(matrix: DenseMatrixN, column: number) {
  const out = zeros(matrix.rows);
  for (let row = 0; row < matrix.rows; row++) out[row] = matrix.data[row * matrix.cols + column]!;
  return out;
}

function basisString(basis: boolean[]) {
  return basis.map((isBasic) => (isBasic ? 1 : 0)).join("");
}

function countBasicVariables(basis: boolean[]) {
  let count = 0;
  for (const isBasic of basis) if (isBasic) count++;
  return count;
}

export function ipmNumber(lines: Lines, objective: ArrayLike<number>, opts: IPMOptionsN) {
  if (opts.maxit > MAX_ITERATIONS_LIMIT) throw new Error(`maxit > ${MAX_ITERATIONS_LIMIT} not allowed`);
  const { A, b } = linesToDenseAb(lines);
  const c = clone(objective).map((value) => -value);
  const bneg = b.map((value) => -value);
  const Aneg = A.data.map((value) => -value);
  return ipmCore({ rows: A.rows, cols: A.cols, data: Aneg }, bneg, c, opts);
}

function ipmCore(A: DenseMatrixN, b: number[], c: number[], opts: IPMOptionsN) {
  const { eps_p, eps_d, eps_opt, maxit, alphaMax, correctorThreshold } = opts;
  const m = A.rows;
  const n = A.cols;
  const systemSize = n + 2 * m;
  const solution = {
    x: [] as number[][],
    s: [] as number[][],
    y: [] as number[][],
    mu: [] as number[],
    rows: [] as Array<{ kind: "ipm"; iteration: number; x: number; y: number; objective: number; infeasibility: number; mu: number }>,
  };
  const res = { iterates: { solution } };
  const x = zeros(n);
  const s = filled(m, 1);
  const y = filled(m, 1);
  let iteration = 0;

  while (++iteration <= maxit) {
    const ax = matVec(A, x);
    const aty = transposedMatVec(A, y);
    const rP = zeros(m);
    const rD = zeros(n);
    for (let i = 0; i < m; i++) rP[i] = b[i]! - ax[i]! + s[i]!;
    for (let j = 0; j < n; j++) rD[j] = c[j]! - aty[j]!;
    const mu = dot(s, y) / m;
    const pObj = dot(c, x);
    const gap = Math.abs(pObj - dot(b, y)) / (1 + Math.abs(pObj));
    const pRes = infinityNorm(rP);
    solution.rows.push({ kind: "ipm", iteration: solution.x.length + 1, x: x[0] ?? 0, y: x[1] ?? 0, objective: -pObj, infeasibility: pRes, mu });
    solution.x.push(x.slice());
    solution.s.push(s.slice());
    solution.y.push(y.slice());
    solution.mu.push(mu);
    if (pRes <= eps_p && infinityNorm(rD) <= eps_d && gap <= eps_opt) break;
    const K = buildKktSystem(A, s, y);
    const rhsAff = zeros(systemSize);
    for (let i = 0; i < m; i++) rhsAff[i] = rP[i]!;
    for (let j = 0; j < n; j++) rhsAff[m + j] = rD[j]!;
    for (let i = 0; i < m; i++) rhsAff[m + n + i] = -s[i]! * y[i]!;
    const deltaAff = solveDenseSystem(K, systemSize, rhsAff);
    const alphaP = alphaStep(s, deltaAff, n, m);
    const alphaD = alphaStep(y, deltaAff, n + m, m);
    let muAff = 0;
    for (let i = 0; i < m; i++) muAff += (s[i]! + alphaP * deltaAff[n + i]!) * (y[i]! + alphaD * deltaAff[n + m + i]!);
    muAff /= m;
    let dx: number[];
    let ds: number[];
    let dy: number[];
    if (!(alphaP >= correctorThreshold && alphaD >= correctorThreshold)) {
      const rhsCor = zeros(systemSize);
      const sigma = Math.max(SIGMA_MIN, Math.min(SIGMA_MAX, (muAff / mu) ** SIGMA_POWER));
      for (let i = 0; i < m; i++) rhsCor[m + n + i] = -(deltaAff[n + i]! * deltaAff[n + m + i]! - sigma * mu);
      const deltaCor = solveDenseSystem(K, systemSize, rhsCor);
      dx = zeros(n);
      ds = zeros(m);
      dy = zeros(m);
      for (let j = 0; j < n; j++) dx[j] = deltaAff[j]! + deltaCor[j]!;
      for (let i = 0; i < m; i++) {
        ds[i] = deltaAff[n + i]! + deltaCor[n + i]!;
        dy[i] = deltaAff[n + m + i]! + deltaCor[n + m + i]!;
      }
    } else {
      dx = zeros(n);
      ds = zeros(m);
      dy = zeros(m);
      for (let j = 0; j < n; j++) dx[j] = deltaAff[j]!;
      for (let i = 0; i < m; i++) {
        ds[i] = deltaAff[n + i]!;
        dy[i] = deltaAff[n + m + i]!;
      }
    }
    const stepP = alphaMax * alphaStep(s, ds, 0, m);
    const stepD = alphaMax * alphaStep(y, dy, 0, m);
    for (let j = 0; j < n; j++) x[j] += dx[j]! * stepP;
    for (let i = 0; i < m; i++) {
      s[i] += ds[i]! * stepP;
      y[i] += dy[i]! * stepD;
    }
  }
  return res;
}

function buildKktSystem(A: DenseMatrixN, s: number[], y: number[]) {
  const m = A.rows;
  const n = A.cols;
  const size = n + 2 * m;
  const K = zeros(size * size);
  for (let i = 0; i < m; i++) {
    const rowOffset = i * size;
    const aOffset = i * n;
    for (let j = 0; j < n; j++) K[rowOffset + j] = A.data[aOffset + j]!;
    K[rowOffset + n + i] = -1;
  }
  for (let j = 0; j < n; j++) {
    const rowOffset = (m + j) * size;
    for (let i = 0; i < m; i++) K[rowOffset + n + m + i] = A.data[i * n + j]!;
  }
  for (let i = 0; i < m; i++) {
    const rowOffset = (m + n + i) * size;
    K[rowOffset + n + i] = y[i]!;
    K[rowOffset + n + m + i] = s[i]!;
  }
  return K;
}

function alphaStep(values: number[], delta: ArrayLike<number>, offset: number, length: number) {
  let alpha = 1;
  for (let i = 0; i < length; i++) {
    const direction = delta[offset + i]!;
    if (direction < 0) alpha = Math.min(alpha, -values[i]! / direction);
  }
  return alpha;
}

function buildBasisState(cVec: number[], A: DenseMatrixN, bVec: number[], basis: boolean[]) {
  const mRows = A.rows;
  const nCols = A.cols;
  const basisIndices: number[] = [];
  for (let i = 0; i < nCols; i++) if (basis[i]) basisIndices.push(i);
  if (basisIndices.length !== mRows) throw new Error(`Basis size ${basisIndices.length} does not match number of constraints ${mRows}. Basis: ${basisString(basis)}`);
  const B = createDenseMatrix(mRows, mRows);
  for (let basisCol = 0; basisCol < mRows; basisCol++) {
    const sourceCol = basisIndices[basisCol]!;
    for (let row = 0; row < mRows; row++) B.data[row * mRows + basisCol] = A.data[row * nCols + sourceCol]!;
  }
  const xB = solveDenseSystem(B.data, mRows, bVec);
  const xTableau = zeros(nCols);
  for (let basisIndex = 0; basisIndex < mRows; basisIndex++) xTableau[basisIndices[basisIndex]!] = xB[basisIndex]!;
  const cB = zeros(mRows);
  for (let i = 0; i < mRows; i++) cB[i] = cVec[basisIndices[i]!]!;
  const BT = transposeMatrix(B);
  const y = solveDenseSystem(BT.data, mRows, cB);
  const aty = transposedMatVec(A, y);
  const reducedCosts = zeros(nCols);
  for (let j = 0; j < nCols; j++) reducedCosts[j] = cVec[j]! - aty[j]!;
  return { B, xB, xTableau, basisIndices, reducedCosts, objective: dot(cVec, xTableau) };
}

function simplexCoreStandard(cVec: number[], A: DenseMatrixN, bVec: number[], basisInit: boolean[], cfg: { tol: number; pointFromBasis: (basisIndices: number[]) => [number, number] }) {
  const { tol, pointFromBasis } = cfg;
  const mRows = A.rows;
  const nCols = A.cols;
  let basis = basisInit.slice();
  const basisHistory: number[][] = [];
  let iteration = 0;
  let status: SimplexStatus = "optimal";
  let objective = 0;
  while (true) {
    if (++iteration > MAX_SIMPLEX_ITERATIONS) throw new Error(`Simplex stalled after ${MAX_SIMPLEX_ITERATIONS} iterations`);
    const state = buildBasisState(cVec, A, bVec, basis);
    basisHistory.push(state.basisIndices.slice());
    objective = state.objective;
    pointFromBasis(state.basisIndices);
    let enterIndex = -1;
    for (let j = 0; j < nCols; j++) {
      if (!basis[j] && state.reducedCosts[j]! > tol) {
        enterIndex = j;
        break;
      }
    }
    if (enterIndex === -1) break;
    const enterColumn = extractColumn(A, enterIndex);
    const direction = solveDenseSystem(state.B.data, state.B.rows, enterColumn);
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
      status = "unbounded";
      break;
    }
    basis[enterIndex] = true;
    basis[state.basisIndices[leaveBasisIndex]!] = false;
  }
  return { basisHistory, finalBasis: basis.slice(), objective, status };
}

function simplexCore(cVec: number[], A: DenseMatrixN, bVec: number[], basisInit: boolean[], cfg: { tol: number; phase1: boolean; nOrig: number; m: number }) {
  const { tol, phase1, nOrig, m } = cfg;
  let basis = basisInit.slice();
  const iterations: number[][] = [];
  let iteration = 0;
  let xTableau = zeros(A.cols);
  let objective = 0;
  let status: SimplexStatus = "optimal";
  let basisIndices: number[] = [];
  while (true) {
    if (++iteration > MAX_SIMPLEX_ITERATIONS) throw new Error(`Simplex stalled after ${MAX_SIMPLEX_ITERATIONS} iterations`);
    const state = buildBasisState(cVec, A, bVec, basis);
    basisIndices = state.basisIndices;
    xTableau = state.xTableau;
    objective = state.objective;
    iterations.push(xTableau.slice());
    let enterIndex = -1;
    for (let j = 0; j < A.cols; j++) {
      if (!basis[j] && state.reducedCosts[j]! > tol) {
        enterIndex = j;
        break;
      }
    }
    if (enterIndex === -1) break;
    const enterColumn = extractColumn(A, enterIndex);
    const direction = solveDenseSystem(state.B.data, state.B.rows, enterColumn);
    let leaveIndexInBasis = -1;
    let minRatio = Infinity;
    let smallestLeavingOriginalIndex = Infinity;
    for (let i = 0; i < A.rows; i++) {
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
      status = "unbounded";
      break;
    }
    basis[enterIndex] = true;
    basis[basisIndices[leaveIndexInBasis]!] = false;
  }
  let finalBasis = basis.slice();
  if (phase1) {
    const artificialVarsStartIndex = 2 * nOrig + m;
    for (let i = 0; i < m; i++) {
      const artificialVariableIndex = artificialVarsStartIndex + i;
      if (finalBasis[artificialVariableIndex] && xTableau[artificialVariableIndex]! > tol && Math.abs(objective) > tol) throw new Error("Problem infeasible");
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
  }
  return { iterations, finalBasis, status };
}

function recoverPrimalPointFromDualBasis(lines: Lines, basisIndices: number[], tol: number): [number, number] {
  const support = basisIndices.filter((index) => index < lines.length).slice(0, 2);
  if (support.length < 2) return [0, 0];
  const [i, j] = support;
  const first = lines[i]!;
  const second = lines[j]!;
  const determinant = first[0]! * second[1]! - first[1]! * second[0]!;
  if (Math.abs(determinant) <= tol) return [0, 0];
  return [(first[2]! * second[1]! - first[1]! * second[2]!) / determinant, (first[0]! * second[2]! - first[2]! * second[0]!) / determinant];
}

function pivotOutArtificialVariables(phase1Matrix: DenseMatrixN, bVec: number[], basisInit: boolean[], originalColumnCount: number, tol: number) {
  const basis = basisInit.slice();
  const zeroCosts = zeros(phase1Matrix.cols);
  while (true) {
    const basisIndices = basis.flatMap((isBasic, index) => (isBasic ? [index] : []));
    const artificialIndex = basisIndices.find((index) => index >= originalColumnCount);
    if (artificialIndex === undefined) break;
    const rowIndex = basisIndices.indexOf(artificialIndex);
    const state = buildBasisState(zeroCosts, phase1Matrix, bVec, basis);
    let replacement = -1;
    for (let j = 0; j < originalColumnCount; j++) {
      if (basis[j]) continue;
      const column = extractColumn(phase1Matrix, j);
      const direction = solveDenseSystem(state.B.data, state.B.rows, column);
      if (Math.abs(direction[rowIndex]!) > tol) {
        replacement = j;
        break;
      }
    }
    if (replacement === -1) throw new Error("Could not pivot artificial variables out of the dual Phase 1 basis.");
    basis[artificialIndex] = false;
    basis[replacement] = true;
  }
  const phase2Basis = basis.slice(0, originalColumnCount);
  if (countBasicVariables(phase2Basis) !== bVec.length) throw new Error("Dual Phase 1 did not produce a valid Phase 2 basis.");
  return phase2Basis;
}

function solveDualMode(lines: Lines, primalA: DenseMatrixN, primalB: number[], objective: number[], opts: Pick<SimplexOptionsN, "tol">) {
  const { tol } = opts;
  const dualA = transposeMatrix(primalA);
  const bDual = objective.slice();
  const cDual = primalB.map((value) => -value);
  const gamma = bDual.map((value) => (value < 0 ? -1 : 1));
  const bPhase1 = bDual.map((value, index) => value * gamma[index]!);
  const aPhase2 = scaleRows(dualA, gamma);
  const aPhase1 = hstackMatrices(aPhase2, identityMatrix(aPhase2.rows));
  const cPhase1 = concatenateVectors(zeros(aPhase2.cols), filled(aPhase2.rows, -1));
  const phase1Basis = Array(aPhase2.cols + aPhase2.rows).fill(false);
  for (let i = 0; i < aPhase2.rows; i++) phase1Basis[aPhase2.cols + i] = true;
  const dualPointFromBasis = (basisIndices: number[]) => recoverPrimalPointFromDualBasis(lines, basisIndices, tol);
  const phase1 = simplexCoreStandard(cPhase1, aPhase1, bPhase1, phase1Basis, { tol, pointFromBasis: dualPointFromBasis });
  if (Math.abs(phase1.objective) > tol) {
    return { iterations: [] as number[][], phase1Iterations: phase1.basisHistory.map((basisIndices) => Array.from(dualPointFromBasis(basisIndices))), status: "unavailable" as const };
  }
  const phase2Basis = pivotOutArtificialVariables(aPhase1, bPhase1, phase1.finalBasis, aPhase2.cols, tol);
  const phase2 = simplexCoreStandard(cDual, aPhase2, bPhase1, phase2Basis, { tol, pointFromBasis: dualPointFromBasis });
  return { iterations: phase2.basisHistory.map((basisIndices) => Array.from(dualPointFromBasis(basisIndices))), phase1Iterations: phase1.basisHistory.map((basisIndices) => Array.from(dualPointFromBasis(basisIndices))), status: phase2.status };
}

function primalPointFromSplitTableau(tableauX: number[], n: number) {
  const point = zeros(n);
  for (let i = 0; i < n; i++) point[i] = (tableauX[i] ?? 0) - (tableauX[n + i] ?? 0);
  return point;
}

export function simplexNumber(lines: Lines, objective: ArrayLike<number>, opts: SimplexOptionsN) {
  const { tol, dual } = opts;
  const { A: aOriginal, b } = linesToDenseAb(lines);
  const m = aOriginal.rows;
  const n = aOriginal.cols;
  const cObjective = clone(objective);
  if (dual) return { ...solveDualMode(lines, aOriginal, b, cObjective, { tol }), mode: "dual" as const };
  const gamma = b.map((value) => (value < 0 ? -1 : 1));
  const bPhase1 = b.map((value, index) => value * gamma[index]!);
  const aPositive = scaleRows(aOriginal, gamma);
  const aNegative = scaleMatrix(aPositive, -1);
  const gammaIdentity = createDenseMatrix(m, m);
  for (let i = 0; i < m; i++) gammaIdentity.data[i * m + i] = gamma[i]!;
  const identity = identityMatrix(m);
  const aPhase1 = hstackMatrices(aPositive, aNegative, gammaIdentity, identity);
  const cPhase1 = concatenateVectors(zeros(2 * n + m), filled(m, -1));
  const phase1Basis = Array(2 * n + 2 * m).fill(false);
  for (let i = 0; i < m; i++) phase1Basis[2 * n + m + i] = true;
  const cPhase2 = concatenateVectors(cObjective, cObjective.map((value) => -value), zeros(m));
  const aPhase2 = hstackMatrices(aOriginal, scaleMatrix(aOriginal, -1), identity);
  const phase1 = simplexCore(cPhase1, aPhase1, bPhase1, phase1Basis, { tol, phase1: true, nOrig: n, m });
  const phase2 = simplexCore(cPhase2, aPhase2, b, phase1.finalBasis, { tol, phase1: false, nOrig: n, m });
  return { iterations: phase2.iterations.map((tableauX) => primalPointFromSplitTableau(tableauX, n)), phase1Iterations: phase1.iterations.map((tableauX) => primalPointFromSplitTableau(tableauX, n)), mode: "primal" as const, status: phase2.status };
}

function computeFixedPointError(currentX: number[], nextX: number[], currentY: number[], nextY: number[]) {
  let error = 0;
  for (let i = 0; i < currentX.length; i++) error = Math.max(error, Math.abs(nextX[i]! - currentX[i]!));
  for (let i = 0; i < currentY.length; i++) error = Math.max(error, Math.abs(nextY[i]! - currentY[i]!));
  return error;
}

function shouldRestartHalpern(innerIteration: number, totalIteration: number, fixedPointError: number, initialFixedPointError: number, lastTrialFixedPointError: number) {
  if (!Number.isFinite(initialFixedPointError) || innerIteration < 2) return false;
  if (fixedPointError <= HALPERN_SUFFICIENT_REDUCTION * initialFixedPointError) return true;
  if (fixedPointError <= HALPERN_NECESSARY_REDUCTION * initialFixedPointError && fixedPointError > lastTrialFixedPointError) return true;
  return innerIteration >= Math.ceil(HALPERN_ARTIFICIAL_RESTART_THRESHOLD * totalIteration);
}

function computeSlackBasisPhase(xk: number[], m: number, slackOffset: number) {
  let phase = 0;
  for (let i = 0; i < m; i++) phase = (phase * 33 + (Math.abs(xk[slackOffset + i]!) <= BASIS_THRESHOLD ? 1 : 0)) >>> 0;
  return phase;
}

function computeIneqBasisPhase(yk: number[]) {
  let phase = 0;
  for (let i = 0; i < yk.length; i++) phase = (phase * 33 + (yk[i]! > BASIS_THRESHOLD ? 1 : 0)) >>> 0;
  return phase;
}

function pdhgEqEpsilon(A: DenseMatrixN, b: number[], c: number[], xk: number[], yk: number[], bNorm: number, cNorm: number) {
  const axScratch = matVec(A, xk);
  let primalResidual = 0;
  for (let i = 0; i < axScratch.length; i++) primalResidual = Math.max(primalResidual, Math.abs(axScratch[i]! - b[i]!));
  const atYScratch = transposedMatVec(A, yk);
  let dualResidual = 0;
  for (let i = 0; i < atYScratch.length; i++) dualResidual = Math.max(dualResidual, Math.max(0, -atYScratch[i]! - c[i]!));
  const cTx = dot(c, xk);
  const bTy = dot(b, yk);
  const dualityGap = Math.abs(cTx + bTy) / (1 + Math.abs(cTx) + Math.abs(bTy));
  return Math.max(primalResidual / (1 + bNorm), dualResidual / (1 + cNorm), dualityGap);
}

function pdhgStandardForm(A: DenseMatrixN, b: number[], c: number[], options: Omit<PDHGOptionsN, "ineq">) {
  const { maxit, eta, tau, tol, colorByBasis, halpern } = options;
  const { rows: m, cols: n } = A;
  const slackOffset = n - m;
  const bNorm = infinityNorm(b);
  const cNorm = infinityNorm(c);
  let xk = zeros(n);
  let yk = zeros(m);
  const anchorX = zeros(n);
  const anchorY = zeros(m);
  let k = 1;
  let innerIteration = 1;
  let initialFixedPointError = Number.POSITIVE_INFINITY;
  let lastTrialFixedPointError = Number.POSITIVE_INFINITY;
  let epsilonK = pdhgEqEpsilon(A, b, c, xk, yk, bNorm, cNorm);
  const iterates: number[][] = [];
  const eps: number[] = [];
  const phases: number[] = [];
  const restartIndices: number[] = [];
  while (k <= maxit) {
    iterates.push(xk.slice());
    if (colorByBasis) phases.push(computeSlackBasisPhase(xk, m, slackOffset));
    eps.push(epsilonK);
    if (epsilonK <= tol || k === maxit) break;
    const atYScratch = transposedMatVec(A, yk);
    let nextX = zeros(n);
    const extrapolatedXScratch = zeros(n);
    for (let i = 0; i < n; i++) {
      const candidate = xk[i]! - eta * (c[i]! + atYScratch[i]!);
      nextX[i] = candidate > 0 ? candidate : 0;
      extrapolatedXScratch[i] = 2 * nextX[i]! - xk[i]!;
    }
    const axScratch = matVec(A, extrapolatedXScratch);
    let nextY = zeros(m);
    for (let i = 0; i < m; i++) nextY[i] = yk[i]! + tau * (axScratch[i]! - b[i]!);
    if (halpern) {
      const fixedPointError = computeFixedPointError(xk, nextX, yk, nextY);
      if (!Number.isFinite(initialFixedPointError)) initialFixedPointError = fixedPointError;
      if (shouldRestartHalpern(innerIteration, k, fixedPointError, initialFixedPointError, lastTrialFixedPointError)) {
        xk = nextX.slice();
        yk = nextY.slice();
        for (let i = 0; i < n; i++) anchorX[i] = nextX[i]!;
        for (let i = 0; i < m; i++) anchorY[i] = nextY[i]!;
        initialFixedPointError = fixedPointError;
        innerIteration = 1;
        restartIndices.push(iterates.length - 1);
      } else {
        let halpernX = zeros(n);
        let halpernY = zeros(m);
        const weight = innerIteration / (innerIteration + 1);
        const anchorWeight = 1 - weight;
        for (let i = 0; i < n; i++) halpernX[i] = weight * nextX[i]! + anchorWeight * anchorX[i]!;
        for (let i = 0; i < m; i++) halpernY[i] = weight * nextY[i]! + anchorWeight * anchorY[i]!;
        [xk, halpernX] = [halpernX, xk];
        [yk, halpernY] = [halpernY, yk];
        innerIteration++;
      }
      lastTrialFixedPointError = fixedPointError;
    } else {
      [xk, nextX] = [nextX, xk];
      [yk, nextY] = [nextY, yk];
    }
    k++;
    epsilonK = pdhgEqEpsilon(A, b, c, xk, yk, bNorm, cNorm);
  }
  return { iterations: iterates, eps, phases: colorByBasis ? phases : undefined, restartIndices: halpern ? restartIndices : undefined };
}

function pdhgEqNumber(lines: Lines, objective: ArrayLike<number>, options: Omit<PDHGOptionsN, "ineq">) {
  if (options.maxit > MAX_ITERATIONS_LIMIT) throw new Error(`maxit > ${MAX_ITERATIONS_LIMIT} not allowed`);
  const { A: AOriginal, b } = linesToDenseAb(lines);
  const nOrig = AOriginal.cols;
  const m = AOriginal.rows;
  const AHat = createDenseMatrix(m, 2 * nOrig + m);
  for (let i = 0; i < m; i++) {
    const originalRowOffset = i * nOrig;
    const targetRowOffset = i * AHat.cols;
    for (let j = 0; j < nOrig; j++) {
      const value = AOriginal.data[originalRowOffset + j]!;
      AHat.data[targetRowOffset + j] = value;
      AHat.data[targetRowOffset + nOrig + j] = -value;
    }
    AHat.data[targetRowOffset + 2 * nOrig + i] = 1;
  }
  const cHat = zeros(2 * nOrig + m);
  for (let i = 0; i < nOrig; i++) {
    cHat[i] = -objective[i]!;
    cHat[nOrig + i] = objective[i]!;
  }
  const result = pdhgStandardForm(AHat, b, cHat, options);
  return { ...result, iterations: result.iterations.map((chi) => {
    const point = zeros(nOrig);
    for (let i = 0; i < nOrig; i++) point[i] = chi[i]! - chi[nOrig + i]!;
    return point;
  }) };
}

function pdhgIneqEpsilon(A: DenseMatrixN, b: number[], c: number[], xk: number[], yk: number[], bNorm: number, cNorm: number) {
  const axScratch = matVec(A, xk);
  let primalResidual = 0;
  for (let i = 0; i < axScratch.length; i++) primalResidual = Math.max(primalResidual, Math.max(0, axScratch[i]! - b[i]!));
  const atYScratch = transposedMatVec(A, yk);
  let dualResidual = 0;
  for (let i = 0; i < atYScratch.length; i++) dualResidual = Math.max(dualResidual, Math.abs(c[i]! + atYScratch[i]!));
  const cTx = dot(c, xk);
  const bTy = dot(b, yk);
  const dualityGap = Math.abs(bTy + cTx) / (1 + Math.abs(cTx) + Math.abs(bTy));
  return Math.max(primalResidual / (1 + bNorm), dualResidual / (1 + cNorm), dualityGap);
}

function pdhgIneqNumber(lines: Lines, objective: ArrayLike<number>, options: Omit<PDHGOptionsN, "ineq">) {
  if (options.maxit > MAX_ITERATIONS_LIMIT) throw new Error(`maxit > ${MAX_ITERATIONS_LIMIT} not allowed`);
  const { maxit, eta, tau, tol, colorByBasis, halpern } = options;
  const { A, b } = linesToDenseAb(lines);
  const c = clone(objective).map((value) => -value);
  const { rows: m, cols: n } = A;
  const bNorm = infinityNorm(b);
  const cNorm = infinityNorm(c);
  let xk = zeros(n);
  let yk = filled(m, 1);
  const anchorX = zeros(n);
  const anchorY = filled(m, 1);
  let k = 1;
  let innerIteration = 1;
  let initialFixedPointError = Number.POSITIVE_INFINITY;
  let lastTrialFixedPointError = Number.POSITIVE_INFINITY;
  let epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk, bNorm, cNorm);
  const iterations: number[][] = [];
  const eps: number[] = [];
  const phases: number[] = [];
  const restartIndices: number[] = [];
  while (k <= maxit && epsilonK > tol) {
    iterations.push(xk.slice());
    if (colorByBasis) phases.push(computeIneqBasisPhase(yk));
    const axScratch = matVec(A, xk);
    let nextY = zeros(m);
    const extrapolatedYScratch = zeros(m);
    for (let i = 0; i < m; i++) {
      const candidate = yk[i]! + tau * (axScratch[i]! - b[i]!);
      nextY[i] = candidate > 0 ? candidate : 0;
      extrapolatedYScratch[i] = 2 * nextY[i]! - yk[i]!;
    }
    const atYScratch = transposedMatVec(A, extrapolatedYScratch);
    let nextX = zeros(n);
    for (let i = 0; i < n; i++) nextX[i] = xk[i]! - eta * (c[i]! + atYScratch[i]!);
    eps.push(epsilonK);
    if (halpern) {
      const fixedPointError = computeFixedPointError(xk, nextX, yk, nextY);
      if (!Number.isFinite(initialFixedPointError)) initialFixedPointError = fixedPointError;
      if (shouldRestartHalpern(innerIteration, k, fixedPointError, initialFixedPointError, lastTrialFixedPointError)) {
        xk = nextX.slice();
        yk = nextY.slice();
        for (let i = 0; i < n; i++) anchorX[i] = nextX[i]!;
        for (let i = 0; i < m; i++) anchorY[i] = nextY[i]!;
        initialFixedPointError = fixedPointError;
        innerIteration = 1;
        restartIndices.push(iterations.length - 1);
      } else {
        let halpernX = zeros(n);
        let halpernY = zeros(m);
        const weight = innerIteration / (innerIteration + 1);
        const anchorWeight = 1 - weight;
        for (let i = 0; i < n; i++) halpernX[i] = weight * nextX[i]! + anchorWeight * anchorX[i]!;
        for (let i = 0; i < m; i++) halpernY[i] = weight * nextY[i]! + anchorWeight * anchorY[i]!;
        [xk, halpernX] = [halpernX, xk];
        [yk, halpernY] = [halpernY, yk];
        innerIteration++;
      }
      lastTrialFixedPointError = fixedPointError;
    } else {
      [xk, nextX] = [nextX, xk];
      [yk, nextY] = [nextY, yk];
    }
    k++;
    epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk, bNorm, cNorm);
  }
  return { iterations, eps, phases: colorByBasis ? phases : undefined, restartIndices: halpern ? restartIndices : undefined };
}

export function pdhgNumber(lines: Lines, objective: ArrayLike<number>, options: PDHGOptionsN) {
  const { ineq, ...rest } = options;
  return ineq ? pdhgIneqNumber(lines, objective, rest) : pdhgEqNumber(lines, objective, rest);
}

function centroid(vertices: Vertices) {
  const point = zeros(vertices[0]?.length ?? 0);
  for (const vertex of vertices) for (let i = 0; i < point.length; i++) point[i] += vertex[i]!;
  for (let i = 0; i < point.length; i++) point[i] /= vertices.length;
  return point;
}

function centralPathMu(niter: number) {
  if (niter <= 0) return [];
  if (niter === 1) return [1000];
  const stepSize = (BARRIER_PARAM_END - BARRIER_PARAM_START) / (niter - 1);
  return Array.from({ length: niter }, (_, index) => 10 ** (BARRIER_PARAM_START + index * stepSize));
}

function computeCentralObjective(A: DenseMatrixN, b: number[], c: number[], mu: number, point: number[]) {
  const axScratch = matVec(A, point);
  let logBarrier = 0;
  for (let i = 0; i < b.length; i++) {
    const slack = b[i]! - axScratch[i]!;
    if (slack <= 0) return -Infinity;
    logBarrier += Math.log(slack);
  }
  return dot(c, point) + mu * logBarrier;
}

function computeNewtonStep(A: DenseMatrixN, b: number[], c: number[], mu: number, point: number[]) {
  const axScratch = matVec(A, point);
  const gradient = clone(c);
  const hessian = zeros(c.length * c.length);
  for (let i = 0; i < b.length; i++) {
    const slack = b[i]! - axScratch[i]!;
    if (slack <= 0) return null;
    const invSlack = 1 / slack;
    const hessianScale = mu * invSlack * invSlack;
    const gradientScale = mu * invSlack;
    const rowOffset = i * A.cols;
    for (let j = 0; j < A.cols; j++) {
      const aij = A.data[rowOffset + j]!;
      gradient[j] -= gradientScale * aij;
      for (let k = 0; k < A.cols; k++) hessian[j * A.cols + k] += hessianScale * aij * A.data[rowOffset + k]!;
    }
  }
  return { gradient, step: solveDenseSystem(hessian, A.cols, gradient) };
}

function performLineSearch(A: DenseMatrixN, b: number[], c: number[], mu: number, currentPoint: number[], newtonStep: number[], gradient: number[]) {
  let stepSize = 1;
  const currentObjective = computeCentralObjective(A, b, c, mu, currentPoint);
  const gradientDotStep = dot(gradient, newtonStep);
  for (let i = 0; i < MAX_LINE_SEARCH_ITERATIONS; i++) {
    const candidatePoint = zeros(currentPoint.length);
    for (let j = 0; j < currentPoint.length; j++) candidatePoint[j] = currentPoint[j]! + newtonStep[j]! * stepSize;
    const candidateObjective = computeCentralObjective(A, b, c, mu, candidatePoint);
    if (candidateObjective !== -Infinity && candidateObjective >= currentObjective + LINE_SEARCH_SUFFICIENT_DECREASE * stepSize * gradientDotStep) return stepSize;
    stepSize *= LINE_SEARCH_SHRINK_FACTOR;
    if (stepSize < MIN_STEP_SIZE) return stepSize;
  }
  return stepSize;
}

function centralPathXk(A: DenseMatrixN, b: number[], c: number[], mu: number, x0: number[]) {
  const currentPoint = x0.slice();
  for (let iteration = 1; iteration <= DEFAULT_MAX_NEWTON_ITERATIONS; iteration++) {
    const newtonStep = computeNewtonStep(A, b, c, mu, currentPoint);
    if (newtonStep === null) return null;
    const stepSize = performLineSearch(A, b, c, mu, currentPoint, newtonStep.step, newtonStep.gradient);
    for (let j = 0; j < currentPoint.length; j++) currentPoint[j] += newtonStep.step[j]! * stepSize;
    if (infinityNorm(newtonStep.gradient) < DEFAULT_CONVERGENCE_TOLERANCE) return currentPoint.slice();
  }
  return null;
}

export function centralPathNumber(vertices: Vertices, lines: Lines, objective: ArrayLike<number>, opts: CentralPathOptionsN) {
  if (opts.niter > 2 ** 10) throw new Error("niter > 2^10 not allowed");
  const { A, b } = linesToDenseAb(lines);
  const c = clone(objective);
  const points: number[][] = [];
  let currentPoint = centroid(vertices);
  for (const mu of centralPathMu(opts.niter)) {
    const optimalPoint = centralPathXk(A, b, c, mu, currentPoint);
    if (!optimalPoint) continue;
    const totalObjective = computeCentralObjective(A, b, c, mu, optimalPoint);
    points.push([optimalPoint[0] ?? 0, optimalPoint[1] ?? 0, totalObjective]);
    currentPoint = optimalPoint;
  }
  return { iterations: points, logs: [] as string[], tsolve: 0 };
}
