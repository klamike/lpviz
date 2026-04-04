import { getDisplayedIterateZ } from "../state/store";
import type { PointXY } from "../solvers/utils/blas";
import { VRep } from "../solvers/utils/polygon";

type TraceEntry = {
  path: number[][];
  objectiveVector: PointXY | null;
};

type ZoomFitInputs = {
  vertices: PointXY[];
  iteratePath: number[][];
  originalIteratePath: number[][];
  traceBuffer: TraceEntry[];
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveHidden: boolean;
};

export function collectZoomFitBounds({
  vertices,
  iteratePath,
  originalIteratePath,
  traceBuffer,
  objectiveVector,
  currentObjective,
  objectiveHidden,
}: ZoomFitInputs) {
  const points: PointXY[] = [];
  const zValues: number[] = [];

  const appendPath = (path: number[][], objectiveOverride?: PointXY | null) => {
    path.forEach((entry) => {
      points.push({ x: entry[0], y: entry[1] });
      zValues.push(getDisplayedIterateZ(entry, objectiveOverride));
    });
  };

  points.push(...vertices);
  appendPath(iteratePath);
  appendPath(originalIteratePath);
  traceBuffer.forEach((traceEntry) => appendPath(traceEntry.path, traceEntry.objectiveVector));

  if (!objectiveHidden) {
    if (objectiveVector) {
      points.push({ x: objectiveVector.x, y: objectiveVector.y });
    }
    if (currentObjective) {
      points.push({ x: currentObjective.x, y: currentObjective.y });
    }
  }

  const bounds = VRep.fromPoints(points).boundingBox();
  if (!bounds) {
    return null;
  }

  return {
    bounds,
    zBounds: zValues.length
      ? {
          minZ: Math.min(...zValues),
          maxZ: Math.max(...zValues),
        }
      : undefined,
  };
}
