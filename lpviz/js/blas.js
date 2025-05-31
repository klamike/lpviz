import { Matrix } from 'ml-matrix';

export const zeros = (k) => Array(k).fill(0);
export const ones = (k) => Array(k).fill(1);
export const copy = (arr) => arr.slice();
export const dot = (u, v) => u.reduce((s, ui, i) => s + ui * v[i], 0);
export const normInf = (v) => v.reduce((m, vi) => Math.max(m, Math.abs(vi)), 0);
export const norm = (v) => Math.sqrt(v.reduce((sum, vi) => sum + vi * vi, 0));
export const projNonNegative = (v) => v.map((vi) => Math.max(0, vi));
export const vectorAdd = (a, b) => a.map((ai, i) => ai + b[i]);
export const vectorSub = (a, b) => a.map((ai, i) => ai - b[i]);
export const scale = (v, k) => v.map((vi) => vi * k);
export const mvmul = (A, x) => A.mmul(Matrix.columnVector(x)).to1DArray();
export const mtmul = (A, y) => mvmul(A.transpose(), y);

export function linesToAb(lines) {
  if (!lines || lines.length === 0) {
    return { A: new Matrix([]), b: [] };
  }
  const A_rows = lines.map((line) => line.slice(0, -1));
  const b_vector = lines.map((line) => line[line.length - 1]);
  return { A: new Matrix(A_rows), b: b_vector };
}
