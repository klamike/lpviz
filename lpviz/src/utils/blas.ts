import { Matrix } from 'ml-matrix';

export const zeros = (k: number) => Array(k).fill(0);
export const ones = (k: number) => Array(k).fill(1);
export const copy = (arr: number[] | number[][] | boolean[]) => arr.slice();
export const dot = (u: number[], v: number[]) => u.reduce((s: number, ui: number, i: number) => s + ui * v[i], 0);
export const normInf = (v: number[]) => v.reduce((m: number, vi: number) => Math.max(m, Math.abs(vi)), 0);
export const norm = (v: number[]) => Math.sqrt(v.reduce((sum: number, vi: number) => sum + vi * vi, 0));
export const projNonNegative = (v: number[]) => v.map((vi: number) => Math.max(0, vi));
export const vectorAdd = (a: number[], b: number[]) => a.map((ai: number, i: number) => ai + b[i]);
export const vectorSub = (a: number[], b: number[]) => a.map((ai: number, i: number) => ai - b[i]);
export const scale = (v: number[], k: number) => v.map((vi: number) => vi * k);
export const mvmul = (A: Matrix, x: number[] | ArrayLike<number>) => A.mmul(Matrix.columnVector(x)).to1DArray();
export const mtmul = (A: Matrix, y: number[]) => mvmul(A.transpose(), y);

export function linesToAb(lines: number[][] | Matrix) {
  if (!lines || (Array.isArray(lines) && lines.length === 0)) {
    return { A: new Matrix([]), b: [] };
  }
  
  if (lines instanceof Matrix) {
    const rows = lines.to2DArray();
    const A_rows = rows.map(row => row.slice(0, -1));
    const b_vector = rows.map(row => row[row.length - 1]);
    return { A: new Matrix(A_rows), b: b_vector };
  }

  const A_rows = lines.map((line: number[]) => line.slice(0, -1));
  const b_vector = lines.map((line: number[]) => line[line.length - 1]);
  return { A: new Matrix(A_rows), b: b_vector };
}
