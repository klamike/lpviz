export type SolverMode = "central" | "ipm" | "simplex" | "pdhg";
export type InputMode = "visual" | "manual";
export type ObjectiveDirection = "max" | "min";

export interface TraceEntry {
  path: number[][];
  angle: number;
}
