import type { Lines } from "../../types/arrays";
import type { InputMode } from "../types";

export interface InputSlice {
  inputMode: InputMode;
  manualConstraints: string[];
  manualObjective: string | null;
  parsedConstraints: Lines;
}

export const createInputSlice = (): InputSlice => ({
  inputMode: "visual",
  manualConstraints: [],
  manualObjective: null,
  parsedConstraints: [],
});
