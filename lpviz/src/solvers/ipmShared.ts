import { formatMilliseconds } from "./utils/time";
import type { VecM, VecN } from "./utils/blas";

export const MAX_ITERATIONS_LIMIT = 2 ** 16;
const COMPLEMENTARITY_RATIO_THRESHOLD = 100;

export type IPMVariant = "explicit" | "implicit";

export interface IPMOptions {
  eps_p: number;
  eps_d: number;
  eps_opt: number;
  maxit: number;
  alphaMax: number;
  correctorThreshold: number;
  verbose: boolean;
  colorByPhase: boolean;
  variant?: IPMVariant;
}

export interface IPMSolutionData {
  x: VecN[];
  s: VecM[];
  y: VecM[];
  mu: number[];
  header: string;
  rows: Array<{
    kind: "ipm";
    iteration: number;
    x: number;
    y: number;
    objective: number;
    infeasibility: number;
    mu: number;
  }>;
  phases?: number[];
  footer?: string;
}

export function computeComplementarityPhase(s: Float64Array, y: Float64Array) {
  let phase = 0;
  for (let i = 0; i < s.length; i++) {
    const slack = Math.max(s[i]!, 1e-16);
    const dual = Math.max(y[i]!, 1e-16);
    const label =
      dual >= slack * COMPLEMENTARITY_RATIO_THRESHOLD
        ? 1
        : slack >= dual * COMPLEMENTARITY_RATIO_THRESHOLD
          ? 2
          : 0;
    phase = (phase * 33 + label) >>> 0;
  }
  return phase;
}

export function pushIter(d: IPMSolutionData, x: Float64Array, s: Float64Array, y: Float64Array, mu: number) {
  d.x.push(Array.from(x));
  d.s.push(Array.from(s));
  d.y.push(Array.from(y));
  d.mu.push(mu);
}

export function logIter(d: IPMSolutionData, verbose: boolean, x: Float64Array, mu: number, pObj: number, pRes: number) {
  const row = {
    kind: "ipm" as const,
    iteration: d.x.length + 1,
    x: x[0] ?? 0,
    y: x[1] ?? 0,
    objective: -pObj,
    infeasibility: pRes,
    mu,
  };
  if (verbose) console.log(row);
  d.rows.push(row);
}

export function logFinal(
  d: IPMSolutionData,
  verbose: boolean,
  converged: boolean,
  solveTime: number,
  failureMessage: string | null,
  solverLabel = "IPM",
) {
  d.footer = failureMessage
    ? `${failureMessage}\nStopped after ${d.x.length} iterations in ${formatMilliseconds(solveTime)}\n`
    : converged
      ? `${solverLabel} converged to optimal solution in ${formatMilliseconds(solveTime)} / ${d.x.length} iterations\n`
      : `${solverLabel} did not converge after ${d.x.length} iterations in ${formatMilliseconds(solveTime)}\n`;
  if (verbose) console.log(d.footer);
}
