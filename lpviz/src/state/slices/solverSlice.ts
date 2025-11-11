import type { VecNs } from "../../types/arrays";
import type { SolverMode } from "../types";

export interface SolverSlice {
  solverMode: SolverMode;
  iteratePath: VecNs;
  iteratePathComputed: boolean;
  highlightIteratePathIndex: number | null;
  isIteratePathComputing: boolean;
  rotateObjectiveMode: boolean;
  animationIntervalId: number | null;
  originalIteratePath: VecNs;
}

export const createSolverSlice = (): SolverSlice => ({
  solverMode: "central",
  iteratePath: [],
  iteratePathComputed: false,
  highlightIteratePathIndex: null,
  isIteratePathComputing: false,
  rotateObjectiveMode: false,
  animationIntervalId: null,
  originalIteratePath: [],
});
