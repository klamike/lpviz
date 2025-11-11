import type { PointXY } from "../../types/arrays";
import type { ObjectiveDirection } from "../types";

export interface ObjectiveSlice {
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveDirection: ObjectiveDirection;
}

export const createObjectiveSlice = (): ObjectiveSlice => ({
  objectiveVector: null,
  currentObjective: null,
  objectiveDirection: "max",
});
