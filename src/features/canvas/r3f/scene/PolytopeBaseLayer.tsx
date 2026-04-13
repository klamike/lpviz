import { useMemo } from "react";
import { DoubleSide, Shape } from "three";

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
  ].join("|"),
  vertices: state.vertices,
  completionMode: state.completionMode,
  highlightIndex: state.highlightIndex,
  currentMouse: state.currentMouse,
  polytope: state.polytope,
  tourActive: state.tourActive,
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

function buildPolytopeRenderData(
  state: PolytopeLayerState,
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
) {
  if (snapshot.mode !== "2d" || state.vertices.length === 0) {
    return {
      fillShape: null as Shape | null,
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
  const appendSegment = (points: number[], highlighted = false) =>
    (highlighted ? highlightSegments : normalSegments).push(...points);

  const edgeCount = regionFinished
    ? Math.max(0, displayVertices.length - (isClosedRegion ? 0 : 1))
    : Math.max(0, displayVertices.length - 1);
  for (let index = 0; index < edgeCount; index += 1) {
    const nextIndex = (index + 1) % displayVertices.length;
    if (!isClosedRegion && nextIndex >= displayVertices.length) {
      break;
    }
    const start = displayVertices[index];
    const end = displayVertices[nextIndex];
    appendSegment(
      [start.x, start.y, EDGE_Z, end.x, end.y, EDGE_Z],
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
      appendSegment([start.x, start.y, EDGE_Z, end.x, end.y, EDGE_Z]);
    });
  }

  if (
    !regionFinished &&
    displayVertices.length >= 1 &&
    currentMouse &&
    !tourActive
  ) {
    const last = displayVertices[displayVertices.length - 1];
    appendSegment([
      last.x,
      last.y,
      EDGE_Z,
      currentMouse.x,
      currentMouse.y,
      EDGE_Z,
    ]);
  }

  return {
    fillShape:
      fillVertices.length >= 3 ? buildShapeFromVertices(fillVertices) : null,
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

  if (snapshot.mode !== "2d" || polytopeState.vertices.length === 0) {
    return null;
  }

  return (
    <group>
      {geometry.fillShape ? (
        <mesh renderOrder={2} position={[0, 0, FILL_Z]} frustumCulled={false}>
          <shapeGeometry args={[geometry.fillShape]} />
          <meshBasicMaterial
            color={geometry.fillColor}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
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
            depthTest={false}
            depthWrite={false}
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
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      ) : null}
    </group>
  );
}
