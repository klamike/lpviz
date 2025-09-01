import { Matrix, AbstractMatrix } from 'ml-matrix';
import { VecM, VecN, ArrayMatrix } from '../types/arrays';


export const diag = (v: Matrix) => Matrix.diag(v.to1DArray());

export const vzeros = (k: number) => Array(k).fill(0);
export const vones = (k: number) => Array(k).fill(1);
export const vcopy = <T extends any[]>(arr: T): T => arr.slice() as T;
export const vdot = <T extends number[]>(u: T, v: T): number =>
  u.reduce((s: number, ui: number, i: number) => s + ui * (v as T)[i], 0);
export const vnormInf = <T extends number[]>(v: T): number =>
  v.reduce((m: number, vi: number) => Math.max(m, Math.abs(vi)), 0);
export const vnorm = <T extends number[]>(v: T): number =>
  Math.sqrt(v.reduce((sum: number, vi: number) => sum + vi * vi, 0));
export const vprojNonNegative = <T extends number[]>(v: T): T =>
  (v.map((vi: number) => Math.max(0, vi)) as T);
export const vadd = <T extends number[]>(a: T, b: T): T =>
  (a.map((ai: number, i: number) => ai + (b as T)[i]) as T);
export const vsub = <T extends number[]>(a: T, b: T): T =>
  (a.map((ai: number, i: number) => ai - (b as T)[i]) as T);
export const vmult = <T extends number[]>(a: T, b: T): T =>
  (a.map((ai: number, i: number) => ai * (b as T)[i]) as T);
export const vscale = <T extends number[]>(v: T, k: number): T =>
  (v.map((vi: number) => vi * k) as T);
export const mvmul = (A: Matrix, x: VecN): VecM =>
  A.mmul(Matrix.columnVector(x)).to1DArray();
export const mtmul = (A: Matrix, y: VecM): VecN => mvmul(A.transpose(), y);

export function linesToAb(lines: ArrayMatrix | Matrix) {
  if (!lines || (Array.isArray(lines) && lines.length === 0)) {
    return { A: new Matrix([]), b: [] };
  }
  
  if (lines instanceof Matrix) {
    const rows = lines.to2DArray();
    const A_rows = rows.map(row => row.slice(0, -1));
    const b_vector = rows.map(row => row[row.length - 1]);
    return { A: new Matrix(A_rows), b: b_vector };
  }

  const A_rows: ArrayMatrix = lines.map((line) => line.slice(0, -1));
  const b_vector: VecM = lines.map((line) => line[line.length - 1]);
  return { A: new Matrix(A_rows), b: b_vector };
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