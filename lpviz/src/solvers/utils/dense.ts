import type { Lines } from "./blas";

export type DenseMatrix = {
  rows: number;
  cols: number;
  data: Float64Array;
};

export function createDenseMatrix(rows: number, cols: number, data?: Float64Array): DenseMatrix {
  return { rows, cols, data: data ?? new Float64Array(rows * cols) };
}

export function linesToDenseAb(lines: Lines) {
  const rows = lines.length;
  const cols = rows === 0 ? 0 : lines[0]!.length - 1;
  const data = new Float64Array(rows * cols);
  const b = new Float64Array(rows);

  for (let i = 0; i < rows; i++) {
    const line = lines[i]!;
    const rowOffset = i * cols;
    for (let j = 0; j < cols; j++) {
      data[rowOffset + j] = line[j]!;
    }
    b[i] = line[cols]!;
  }

  return {
    A: createDenseMatrix(rows, cols, data),
    b,
  };
}

export function infinityNorm(vector: ArrayLike<number>) {
  let maxValue = 0;
  for (let i = 0; i < vector.length; i++) {
    const absoluteValue = Math.abs(vector[i]!);
    if (absoluteValue > maxValue) {
      maxValue = absoluteValue;
    }
  }
  return maxValue;
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

export function matVec(matrix: DenseMatrix, vector: ArrayLike<number>, out: Float64Array) {
  const { rows, cols, data } = matrix;
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    const rowOffset = i * cols;
    for (let j = 0; j < cols; j++) {
      sum += data[rowOffset + j]! * vector[j]!;
    }
    out[i] = sum;
  }
}

export function transposedMatVec(matrix: DenseMatrix, vector: ArrayLike<number>, out: Float64Array) {
  out.fill(0);
  const { rows, cols, data } = matrix;
  for (let i = 0; i < rows; i++) {
    const scale = vector[i]!;
    const rowOffset = i * cols;
    for (let j = 0; j < cols; j++) {
      out[j] += data[rowOffset + j]! * scale;
    }
  }
}

export function solveDenseSystem(matrix: ArrayLike<number>, size: number, rhs: ArrayLike<number>, out: Float64Array, luScratch?: Float64Array) {
  const lu = luScratch ?? new Float64Array(size * size);
  if (ArrayBuffer.isView(matrix)) {
    lu.set(matrix as Float64Array);
  } else {
    for (let i = 0; i < size * size; i++) {
      lu[i] = matrix[i]!;
    }
  }
  if (ArrayBuffer.isView(rhs)) {
    out.set(rhs as Float64Array);
  } else {
    for (let i = 0; i < size; i++) {
      out[i] = rhs[i]!;
    }
  }

  for (let pivot = 0; pivot < size; pivot++) {
    let pivotRow = pivot;
    let pivotValue = Math.abs(lu[pivot * size + pivot]!);
    for (let row = pivot + 1; row < size; row++) {
      const value = Math.abs(lu[row * size + pivot]!);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = row;
      }
    }

    if (pivotValue <= 1e-12) {
      throw new Error("Singular linear system");
    }

    if (pivotRow !== pivot) {
      for (let col = 0; col < size; col++) {
        const a = pivot * size + col;
        const b = pivotRow * size + col;
        [lu[a], lu[b]] = [lu[b]!, lu[a]!];
      }
      [out[pivot], out[pivotRow]] = [out[pivotRow]!, out[pivot]!];
    }

    const diagonal = lu[pivot * size + pivot]!;
    for (let row = pivot + 1; row < size; row++) {
      const factorIndex = row * size + pivot;
      lu[factorIndex] = lu[factorIndex]! / diagonal;
      const factor = lu[factorIndex]!;
      for (let col = pivot + 1; col < size; col++) {
        const index = row * size + col;
        lu[index] -= factor * lu[pivot * size + col]!;
      }
    }
  }

  for (let row = 0; row < size; row++) {
    let sum = out[row]!;
    for (let col = 0; col < row; col++) {
      sum -= lu[row * size + col]! * out[col]!;
    }
    out[row] = sum;
  }

  for (let row = size - 1; row >= 0; row--) {
    let sum = out[row]!;
    for (let col = row + 1; col < size; col++) {
      sum -= lu[row * size + col]! * out[col]!;
    }
    out[row] = sum / lu[row * size + row]!;
  }

  return out;
}
