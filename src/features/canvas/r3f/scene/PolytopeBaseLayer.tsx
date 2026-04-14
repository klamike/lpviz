import { useEffect, useMemo } from "react";
import {
  DoubleSide,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
} from "three";

import type { Line, PointXY } from "../../../../math/blas";
import { VRep } from "../../../../polytope/polygon";
import { hasPolytopeLines } from "../../../../polytope/polytopeTypes";
import type { State } from "../../../../store/lpvizStore";
import { useLpvizSelector } from "../../../../store/useLpvizStore";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const POLYTOPE_FILL_COLOR = "#e6e6e6";
const POLYTOPE_HIGHLIGHT_COLOR = "#ff0000";
const POLYTOPE_OUTLINE_COLOR = "#000000";
const FILL_Z = 0.001;
const EDGE_Z = 0.002;
const CLIP_MARGIN_PX = 50;
const CLIP_MARGIN_UNITS = 50;
const DEFAULT_UNBOUNDED_EXTENT = 5000;
const EPS = 1e-10;

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type PolytopeLayerState = {
  cacheKey: string;
  vertices: PointXY[];
  completionMode: "draft" | "closed" | "open";
  highlightIndex: number | null;
  currentMouse: PointXY | null;
  polytope: State["polytope"];
  tourActive: boolean;
  objectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

type PolytopeRenderData = {
  fillGeometry: ShapeGeometry | null;
  fillColor: string;
  normalSegments: Float32Array;
  highlightSegments: Float32Array;
};

const serializePoint = (point: PointXY | null) =>
  point ? `${point.x},${point.y}` : "";

const serializePoints = (points: ReadonlyArray<PointXY>) =>
  points.map((point) => `${point.x},${point.y}`).join(";");

const serializeTuplePoints = (points: ReadonlyArray<ReadonlyArray<number>>) =>
  points.map((point) => point.join(",")).join(";");

const serializeBoundaryRays = (
  rays: NonNullable<State["polytope"]>["boundaryRays"],
) =>
  rays
    .map((ray) => `${ray.start.join(",")}|${ray.direction.join(",")}`)
    .join(";");

const serializePolytope = (polytope: State["polytope"]) =>
  polytope
    ? [
        polytope.kind,
        polytope.inequalities.join("§"),
        serializeTuplePoints(polytope.lines),
        serializeTuplePoints(polytope.vertices),
        serializeBoundaryRays(polytope.boundaryRays),
      ].join("|")
    : "";

const selectPolytopeLayerState = (state: State): PolytopeLayerState => ({
  cacheKey: [
    serializePoints(state.vertices),
    state.completionMode,
    state.highlightIndex ?? "",
    serializePoint(state.currentMouse),
    serializePolytope(state.polytope),
    state.tourActive ? "1" : "0",
    serializePoint(state.objectiveVector),
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  vertices: state.vertices,
  completionMode: state.completionMode,
  highlightIndex: state.highlightIndex,
  currentMouse: state.currentMouse,
  polytope: state.polytope,
  tourActive: state.tourActive,
  objectiveVector: state.objectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const arePolytopeLayerStatesEqual = (
  current: PolytopeLayerState,
  next: PolytopeLayerState,
) => current.cacheKey === next.cacheKey;

function buildShapeFromVertices(vertices: ReadonlyArray<PointXY>) {
  const shape = new Shape();
  if (vertices.length === 0) {
    return shape;
  }
  shape.moveTo(vertices[0].x, vertices[0].y);
  for (let index = 1; index < vertices.length; index += 1) {
    shape.lineTo(vertices[index].x, vertices[index].y);
  }
  shape.closePath();
  return shape;
}

function clipPolygonToHalfPlane(polygon: PointXY[], line: Line): PointXY[] {
  if (polygon.length === 0) {
    return [];
  }

  const [A, B, C] = line;
  const inside = (point: PointXY) => A * point.x + B * point.y <= C + EPS;
  const intersect = (start: PointXY, end: PointXY): PointXY => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denom = A * dx + B * dy;
    if (Math.abs(denom) < EPS) {
      return end;
    }
    const t = (C - A * start.x - B * start.y) / denom;
    return {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };
  };

  const result: PointXY[] = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = inside(previous);

  for (const current of polygon) {
    const currentInside = inside(current);
    if (currentInside) {
      if (!previousInside) {
        result.push(intersect(previous, current));
      }
      result.push(current);
    } else if (previousInside) {
      result.push(intersect(previous, current));
    }
    previous = current;
    previousInside = currentInside;
  }

  return result;
}

function clipRegionToBounds(lines: Line[], bounds: Bounds): PointXY[] {
  let polygon: PointXY[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];

  for (const line of lines) {
    polygon = clipPolygonToHalfPlane(polygon, line);
    if (polygon.length === 0) {
      return [];
    }
  }

  return polygon;
}

function clipRayToBounds(
  start: PointXY,
  direction: PointXY,
  bounds: Bounds,
): [PointXY, PointXY] | null {
  const candidates: Array<{ t: number; point: PointXY }> = [];

  if (Math.abs(direction.x) > EPS) {
    for (const x of [bounds.minX, bounds.maxX]) {
      const t = (x - start.x) / direction.x;
      if (t <= EPS) {
        continue;
      }
      const y = start.y + t * direction.y;
      if (y >= bounds.minY - EPS && y <= bounds.maxY + EPS) {
        candidates.push({ t, point: { x, y } });
      }
    }
  }

  if (Math.abs(direction.y) > EPS) {
    for (const y of [bounds.minY, bounds.maxY]) {
      const t = (y - start.y) / direction.y;
      if (t <= EPS) {
        continue;
      }
      const x = start.x + t * direction.x;
      if (x >= bounds.minX - EPS && x <= bounds.maxX + EPS) {
        candidates.push({ t, point: { x, y } });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.t - a.t);
  return [start, candidates[0].point];
}

function getVisibleBounds(
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
): Bounds {
  if (snapshot.mode !== "2d") {
    return {
      minX: -DEFAULT_UNBOUNDED_EXTENT,
      maxX: DEFAULT_UNBOUNDED_EXTENT,
      minY: -DEFAULT_UNBOUNDED_EXTENT,
      maxY: DEFAULT_UNBOUNDED_EXTENT,
    };
  }

  const halfWidth =
    (snapshot.orthographic.right - snapshot.orthographic.left) / 2;
  const halfHeight =
    (snapshot.orthographic.top - snapshot.orthographic.bottom) / 2;
  const marginUnits =
    CLIP_MARGIN_PX * snapshot.unitsPerPixel + CLIP_MARGIN_UNITS;

  return {
    minX: snapshot.target.x - halfWidth - marginUnits,
    maxX: snapshot.target.x + halfWidth + marginUnits,
    minY: snapshot.target.y - halfHeight - marginUnits,
    maxY: snapshot.target.y + halfHeight + marginUnits,
  };
}

function getDisplayedObjectiveZ(
  x: number,
  y: number,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * x + objectiveVector.y * y
    : 0;
  return zAxisOffsetOnly ? 0 : objectiveValue;
}

function getRenderZ(
  x: number,
  y: number,
  state: Pick<
    PolytopeLayerState,
    "objectiveVector" | "zScale" | "zAxisOffsetOnly"
  >,
  is3D: boolean,
  offset: number,
) {
  if (!is3D) {
    return offset;
  }

  return (
    (getDisplayedObjectiveZ(
      x,
      y,
      state.objectiveVector,
      state.zAxisOffsetOnly,
    ) *
      state.zScale) /
      100 +
    offset
  );
}

function buildFillGeometry(
  fillVertices: ReadonlyArray<PointXY>,
  state: Pick<
    PolytopeLayerState,
    "objectiveVector" | "zScale" | "zAxisOffsetOnly"
  >,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  if (fillVertices.length < 3) {
    return null;
  }

  const geometry = new ShapeGeometry(buildShapeFromVertices(fillVertices));
  if (mode === "3d") {
    const positions = geometry.getAttribute(
      "position",
    ) as Float32BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      positions.setZ(index, getRenderZ(x, y, state, true, 0));
    }
    positions.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

function buildPolytopeRenderData(
  state: PolytopeLayerState,
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
): PolytopeRenderData {
  if (
    state.vertices.length === 0 ||
    state.isTransitioning3D ||
    (snapshot.mode === "3d" && !state.is3DMode)
  ) {
    return {
      fillGeometry: null,
      fillColor: POLYTOPE_FILL_COLOR,
      normalSegments: new Float32Array(),
      highlightSegments: new Float32Array(),
    };
  }

  const {
    vertices,
    completionMode,
    highlightIndex,
    currentMouse,
    polytope,
    tourActive,
  } = state;
  const regionFinished = completionMode !== "draft";
  const hasDerivedClosedRegion =
    completionMode === "open" &&
    polytope?.kind === "bounded" &&
    polytope.vertices.length >= 3;
  const displayVertices: PointXY[] = hasDerivedClosedRegion
    ? polytope.vertices.map(([x, y]) => ({ x, y }))
    : vertices;
  const isClosedRegion = completionMode === "closed" || hasDerivedClosedRegion;
  const isNonconvex = !VRep.fromPoints(displayVertices).isConvex();
  const bounds =
    completionMode === "open" &&
    !hasDerivedClosedRegion &&
    polytope?.kind === "unbounded"
      ? {
          minX: -DEFAULT_UNBOUNDED_EXTENT,
          maxX: DEFAULT_UNBOUNDED_EXTENT,
          minY: -DEFAULT_UNBOUNDED_EXTENT,
          maxY: DEFAULT_UNBOUNDED_EXTENT,
        }
      : getVisibleBounds(snapshot);
  const is3D = snapshot.mode === "3d";

  const fillVertices: PointXY[] =
    isClosedRegion && displayVertices.length >= 3
      ? displayVertices
      : completionMode === "open" &&
          polytope?.kind === "unbounded" &&
          hasPolytopeLines(polytope)
        ? clipRegionToBounds(polytope.lines, bounds)
        : [];

  const normalSegments: number[] = [];
  const highlightSegments: number[] = [];
  const appendSegment = (start: PointXY, end: PointXY, highlighted = false) =>
    (highlighted ? highlightSegments : normalSegments).push(
      start.x,
      start.y,
      getRenderZ(start.x, start.y, state, is3D, EDGE_Z),
      end.x,
      end.y,
      getRenderZ(end.x, end.y, state, is3D, EDGE_Z),
    );

  const edgeCount = regionFinished
    ? Math.max(0, displayVertices.length - (isClosedRegion ? 0 : 1))
    : Math.max(0, displayVertices.length - 1);
  for (let index = 0; index < edgeCount; index += 1) {
    const nextIndex = (index + 1) % displayVertices.length;
    if (!isClosedRegion && nextIndex >= displayVertices.length) {
      break;
    }
    const start = displayVertices[index]!;
    const end = displayVertices[nextIndex]!;
    appendSegment(
      start,
      end,
      !hasDerivedClosedRegion && highlightIndex === index,
    );
  }

  if (
    completionMode === "open" &&
    !hasDerivedClosedRegion &&
    polytope?.boundaryRays
  ) {
    polytope.boundaryRays.forEach((ray) => {
      const clipped = clipRayToBounds(
        { x: ray.start[0], y: ray.start[1] },
        { x: ray.direction[0], y: ray.direction[1] },
        bounds,
      );
      if (!clipped) {
        return;
      }
      const [start, end] = clipped;
      appendSegment(start, end);
    });
  }

  if (
    !regionFinished &&
    displayVertices.length >= 1 &&
    currentMouse &&
    !tourActive
  ) {
    const last = displayVertices[displayVertices.length - 1]!;
    appendSegment(last, currentMouse);
  }

  return {
    fillGeometry: buildFillGeometry(fillVertices, state, snapshot.mode),
    fillColor: isNonconvex ? POLYTOPE_HIGHLIGHT_COLOR : POLYTOPE_FILL_COLOR,
    normalSegments: new Float32Array(normalSegments),
    highlightSegments: new Float32Array(highlightSegments),
  };
}

export function PolytopeBaseLayer() {
  const snapshot = useViewportRenderSnapshot();
  const polytopeState = useLpvizSelector(
    selectPolytopeLayerState,
    arePolytopeLayerStatesEqual,
  );
  const geometry = useMemo(
    () => buildPolytopeRenderData(polytopeState, snapshot),
    [polytopeState, snapshot],
  );

  useEffect(() => {
    return () => {
      geometry.fillGeometry?.dispose();
    };
  }, [geometry.fillGeometry]);

  if (
    polytopeState.vertices.length === 0 ||
    (!geometry.fillGeometry &&
      geometry.normalSegments.length === 0 &&
      geometry.highlightSegments.length === 0)
  ) {
    return null;
  }

  const is3D = snapshot.mode === "3d";

  return (
    <group>
      {geometry.fillGeometry ? (
        <mesh
          renderOrder={2}
          position={[0, 0, is3D ? 0 : FILL_Z]}
          frustumCulled={false}
          geometry={geometry.fillGeometry}
        >
          <meshBasicMaterial
            color={geometry.fillColor}
            transparent
            opacity={0.6}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      ) : null}
      {geometry.normalSegments.length > 0 ? (
        <lineSegments renderOrder={3} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[geometry.normalSegments, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={POLYTOPE_OUTLINE_COLOR}
            depthTest={is3D}
            depthWrite={is3D}
          />
        </lineSegments>
      ) : null}
      {geometry.highlightSegments.length > 0 ? (
        <lineSegments renderOrder={4} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[geometry.highlightSegments, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={POLYTOPE_HIGHLIGHT_COLOR}
            depthTest={is3D}
            depthWrite={is3D}
          />
        </lineSegments>
      ) : null}
    </group>
  );
}
