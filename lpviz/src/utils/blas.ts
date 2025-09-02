import { Matrix, AbstractMatrix } from 'ml-matrix';
import { VecM, Lines } from '../types/arrays';


export const diag = (v: Matrix) => Matrix.diag(v.to1DArray());

export function linesToAb(lines: Lines) {
  if (lines.length === 0) {
    return { A: new Matrix([]), b: Matrix.columnVector([]) };
  }

  const A_rows: Lines = lines.map((line) => line.slice(0, -1));
  const b_vector: VecM = lines.map((line) => line[line.length - 1]);
  return { A: new Matrix(A_rows), b: Matrix.columnVector(b_vector) };
}

export function vstack(matrices: (AbstractMatrix | number[])[]): Matrix {
  if (!matrices || matrices.length === 0) {
    return Matrix.columnVector([]);
  }

  const allValues: number[] = [];
  
  for (const matrix of matrices) {
    if (matrix instanceof Matrix) {
      allValues.push(...matrix.to1DArray());
    } else if (Array.isArray(matrix)) {
      allValues.push(...matrix);
    } else {
      throw new TypeError('Each element must be a Matrix or number array');
    }
  }
  
  return Matrix.columnVector(allValues);
}

export const vslice = (v: Matrix, start: number, end: number) => {
  return v.subMatrix(start, end-1, 0, 0);
}

export function projectNonNegative(matrix: Matrix): Matrix {
  const result = matrix.clone();
  for (let i = 0; i < result.rows; i++) {
    for (let j = 0; j < result.columns; j++) {
      result.set(i, j, Math.max(0, result.get(i, j)));
    }
  }
  return result;
}

export function hstack(...mats: Matrix[]) {
  if (mats.length === 0) return new Matrix([]);
  const rows = mats[0].rows;
  if (!mats.every(M => M.rows === rows)) {
    throw new Error('hstack: all blocks must have identical row-count');
  }
  const cols = mats.reduce((s, M) => s + M.columns, 0);
  const out = Matrix.zeros(rows, cols);

  let current_col_offset = 0;
  for (const M of mats) {
    if (M.columns > 0) {
      for (let r = 0; r < M.rows; ++r) {
        for (let c = 0; c < M.columns; ++c) {
          out.set(r, current_col_offset + c, M.get(r, c));
        }
      }
    }
    current_col_offset += M.columns;
  }
  return out;
}