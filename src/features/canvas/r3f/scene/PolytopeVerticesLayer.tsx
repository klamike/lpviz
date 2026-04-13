import { useMemo } from "react";

import type { PointXY } from "../../../../math/blas";
import type { State } from "../../../../store/lpvizStore";
import { useLpvizSelector } from "../../../../store/useLpvizStore";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const VERTEX_COLOR = "#ff0000";
const OPEN_ANCHOR_COLOR = "#ff0000";
const VERTEX_Z = 0.004;
const VERTEX_PIXEL_SIZE = 10;
const VERTEX_RENDER_ORDER = 12;
const CIRCLE_SEGMENTS = 24;

type PolytopeVerticesLayerState = {
  cacheKey: string;
  vertices: PointXY[];
  completionMode: State["completionMode"];
  polytope: State["polytope"];
};

type VertexEntry = {
  key: string;
  x: number;
  y: number;
  shape: "circle" | "square";
  color: string;
};

const serializePoints = (points: ReadonlyArray<PointXY>) =>
  points.map((point) => `${point.x},${point.y}`).join(";");

const serializeTuplePoints = (points: ReadonlyArray<ReadonlyArray<number>>) =>
  points.map((point) => point.join(",")).join(";");

const serializePolytope = (polytope: State["polytope"]) =>
  polytope
    ? [polytope.kind, serializeTuplePoints(polytope.vertices)].join("|")
    : "";

const selectPolytopeVerticesLayerState = (
  state: State,
): PolytopeVerticesLayerState => ({
  cacheKey: [
    serializePoints(state.vertices),
    state.completionMode,
    serializePolytope(state.polytope),
  ].join("|"),
  vertices: state.vertices,
  completionMode: state.completionMode,
  polytope: state.polytope,
});

const arePolytopeVerticesLayerStatesEqual = (
  current: PolytopeVerticesLayerState,
  next: PolytopeVerticesLayerState,
) => current.cacheKey === next.cacheKey;

function buildVertexEntries(state: PolytopeVerticesLayerState): VertexEntry[] {
  if (state.vertices.length === 0) {
    return [];
  }

  const derivedVertices =
    state.completionMode === "open" &&
    state.polytope?.kind === "bounded" &&
    (state.polytope?.vertices.length ?? 0) >= 3
      ? state.polytope.vertices
      : null;
  const hasDerivedClosedRegion = derivedVertices !== null;
  const displayVertices: PointXY[] = derivedVertices
    ? derivedVertices.map(([x, y]) => ({ x, y }))
    : state.vertices;

  return displayVertices.map((vertex, index) => {
    const isOpenRayAnchor =
      state.completionMode === "open" &&
      !hasDerivedClosedRegion &&
      (index === 0 || index === displayVertices.length - 1);

    return {
      key: `${index}:${vertex.x},${vertex.y}:${isOpenRayAnchor ? "square" : "circle"}`,
      x: vertex.x,
      y: vertex.y,
      shape: isOpenRayAnchor ? "square" : "circle",
      color: isOpenRayAnchor ? OPEN_ANCHOR_COLOR : VERTEX_COLOR,
    };
  });
}

export function PolytopeVerticesLayer() {
  const snapshot = useViewportRenderSnapshot();
  const polytopeState = useLpvizSelector(
    selectPolytopeVerticesLayerState,
    arePolytopeVerticesLayerStatesEqual,
  );
  const vertices = useMemo(
    () => buildVertexEntries(polytopeState),
    [polytopeState],
  );

  if (snapshot.mode !== "2d" || vertices.length === 0) {
    return null;
  }

  const vertexSize = VERTEX_PIXEL_SIZE * snapshot.unitsPerPixel;

  return (
    <group>
      {vertices.map((vertex) => (
        <mesh
          key={vertex.key}
          position={[vertex.x, vertex.y, VERTEX_Z]}
          renderOrder={VERTEX_RENDER_ORDER}
          frustumCulled={false}
        >
          {vertex.shape === "square" ? (
            <planeGeometry args={[vertexSize, vertexSize]} />
          ) : (
            <circleGeometry args={[vertexSize / 2, CIRCLE_SEGMENTS]} />
          )}
          <meshBasicMaterial
            color={vertex.color}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
