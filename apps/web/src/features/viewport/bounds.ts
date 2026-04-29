import { getDisplayedIterateZ } from "@/features/core/store";
import { VRep } from "@lpviz/math/geometry";
import type { PointXY } from "@lpviz/math/types";

type TraceEntry = {
  path: Float64Array[];
  objectiveVector: PointXY | null;
};

type ZoomFitInputs = {
  vertices: PointXY[];
  iteratePath: Float64Array[];
  originalIteratePath: Float64Array[];
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

  const appendPath = (
    path: Float64Array[],
    objectiveOverride?: PointXY | null,
  ) => {
    path.forEach((entry) => {
      points.push({ x: entry[0], y: entry[1] });
      zValues.push(getDisplayedIterateZ(entry, objectiveOverride));
    });
  };

  points.push(...vertices);
  appendPath(iteratePath);
  appendPath(originalIteratePath);
  traceBuffer.forEach((traceEntry) =>
    appendPath(traceEntry.path, traceEntry.objectiveVector),
  );

  if (!objectiveHidden) {
    if (objectiveVector) {
      points.push({ x: objectiveVector.x, y: objectiveVector.y });
    }
    if (currentObjective) {
      points.push({ x: currentObjective.x, y: currentObjective.y });
    }
  }

  if (!VRep.isValid(points)) {
    return null;
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    bounds: { minX, maxX, minY, maxY },
    zBounds: zValues.length
      ? {
          minZ: Math.min(...zValues),
          maxZ: Math.max(...zValues),
        }
      : undefined,
  };
}
