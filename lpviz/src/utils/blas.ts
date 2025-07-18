import { Matrix } from 'ml-matrix';
import { VecM, VecN, ArrayMatrix } from '../types/arrays';

export const zeros = (k: number) => Array(k).fill(0);
export const ones = (k: number) => Array(k).fill(1);
export const copy = <T extends any[]>(arr: T): T => arr.slice() as T;
export const dot = <T extends number[]>(u: T, v: T): number =>
  u.reduce((s: number, ui: number, i: number) => s + ui * (v as T)[i], 0);
export const normInf = <T extends number[]>(v: T): number =>
  v.reduce((m: number, vi: number) => Math.max(m, Math.abs(vi)), 0);
export const norm = <T extends number[]>(v: T): number =>
  Math.sqrt(v.reduce((sum: number, vi: number) => sum + vi * vi, 0));
export const projNonNegative = <T extends number[]>(v: T): T =>
  (v.map((vi: number) => Math.max(0, vi)) as T);
export const vectorAdd = <T extends number[]>(a: T, b: T): T =>
  (a.map((ai: number, i: number) => ai + (b as T)[i]) as T);
export const vectorSub = <T extends number[]>(a: T, b: T): T =>
  (a.map((ai: number, i: number) => ai - (b as T)[i]) as T);
export const scale = <T extends number[]>(v: T, k: number): T =>
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
