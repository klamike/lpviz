import { getDisplayedIterateZ } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";

type TraceEntry = {
  path: Float64Array[];
  objectiveVector: PointXY | null;
};

type ZoomFitInputs = {
  vertices: PointXY[];
  iteratePath: Float64Array[];
  originalIteratePath: Float64Array[];
  iterateObjectiveVector: PointXY | null;
  originalIterateObjectiveVector: PointXY | null;
  traceBuffer: TraceEntry[];
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveHidden: boolean;
};

// Accumulates min/max in a single pass with no intermediate arrays: the old
// per-point {x, y} objects plus Math.min(...spread) over every iterate both
// allocated heavily and, above ~125k z values (V8's argument limit), threw a
// RangeError that broke zoom-to-fit outright at high solver iteration counts.
export function collectZoomFitBounds({
  vertices,
  iteratePath,
  originalIteratePath,
  iterateObjectiveVector,
  originalIterateObjectiveVector,
  traceBuffer,
  objectiveVector,
  currentObjective,
  objectiveHidden,
}: ZoomFitInputs) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let hasZ = false;
  let valid = true;
  let count = 0;

  const addPoint = (x: number, y: number) => {
    count++;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      valid = false;
      return;
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const addPath = (
    path: Float64Array[],
    objectiveOverride: PointXY | null,
  ) => {
    for (const entry of path) {
      addPoint(entry[0]!, entry[1]!);
      const z = getDisplayedIterateZ(entry, objectiveOverride);
      hasZ = true;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  };

  for (const vertex of vertices) {
    if (!vertex) {
      valid = false;
      break;
    }
    addPoint(vertex.x, vertex.y);
  }
  // use the objective each path was solved under, as the render layers do —
  // the current objectiveVector can differ mid-drag or after a solver error
  addPath(iteratePath, iterateObjectiveVector);
  addPath(originalIteratePath, originalIterateObjectiveVector);
  for (const traceEntry of traceBuffer) {
    addPath(traceEntry.path, traceEntry.objectiveVector);
  }

  if (!objectiveHidden) {
    if (objectiveVector) addPoint(objectiveVector.x, objectiveVector.y);
    if (currentObjective) addPoint(currentObjective.x, currentObjective.y);
  }

  if (!valid || count === 0) {
    return null;
  }

  return {
    bounds: { minX, maxX, minY, maxY },
    zBounds: hasZ ? { minZ, maxZ } : undefined,
  };
}
