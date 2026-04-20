import { useEffect, useMemo } from "react";
import { CanvasTexture } from "three";

import type { PointXY } from "@lpviz/math";
import type { State } from "@/state";
import { useLpvizSelector } from "@/state/react";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { useViewportRenderSnapshot } from "@/viewport/r3f/viewportRenderStore";

const VERTEX_COLOR = "#ff0000";
const OPEN_ANCHOR_COLOR = "#ff0000";
const VERTEX_Z = 0.004;
const VERTEX_PIXEL_SIZE = 10;
const VERTEX_RENDER_ORDER = RENDER_ORDER.polytopeVertices;
const CIRCLE_SEGMENTS = 24;

type PolytopeVerticesLayerState = {
  cacheKey: string;
  vertices: PointXY[];
  completionMode: State["completionMode"];
  polytope: State["polytope"];
  objectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

type VertexEntry = {
  key: string;
  x: number;
  y: number;
  z: number;
  shape: "circle" | "square";
  color: string;
};

const serializePoint = (point: PointXY | null) =>
  point ? `${point.x},${point.y}` : "";

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
    serializePoint(state.objectiveVector),
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  vertices: state.vertices,
  completionMode: state.completionMode,
  polytope: state.polytope,
  objectiveVector: state.objectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const arePolytopeVerticesLayerStatesEqual = (
  current: PolytopeVerticesLayerState,
  next: PolytopeVerticesLayerState,
) => current.cacheKey === next.cacheKey;

function createCircleTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create vertex circle texture context");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  context.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSquareTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create vertex square texture context");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  const inset = size * 0.06;
  context.fillRect(inset, inset, size - inset * 2, size - inset * 2);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getDisplayedVertexZ(
  point: PointXY,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * point.x + objectiveVector.y * point.y
    : 0;
  return zAxisOffsetOnly ? 0 : objectiveValue;
}

function buildVertexEntries(
  state: PolytopeVerticesLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
): VertexEntry[] {
  if (state.vertices.length === 0 || !shouldRenderSnapshotMode(mode, state)) {
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
  const is3D = mode === "3d";

  return displayVertices.map((vertex, index) => {
    const isOpenRayAnchor =
      state.completionMode === "open" &&
      !hasDerivedClosedRegion &&
      (index === 0 || index === displayVertices.length - 1);

    return {
      key: `${index}:${vertex.x},${vertex.y}:${isOpenRayAnchor ? "square" : "circle"}`,
      x: vertex.x,
      y: vertex.y,
      z: is3D
        ? (getDisplayedVertexZ(
            vertex,
            state.objectiveVector,
            state.zAxisOffsetOnly,
          ) *
            state.zScale) /
            100 +
          VERTEX_Z
        : VERTEX_Z,
      shape: isOpenRayAnchor ? "square" : "circle",
      color: isOpenRayAnchor ? OPEN_ANCHOR_COLOR : VERTEX_COLOR,
    };
  });
}

function buildPointPositions(
  entries: ReadonlyArray<VertexEntry>,
  shape: VertexEntry["shape"],
) {
  const filtered = entries.filter((entry) => entry.shape === shape);
  const positions = new Float32Array(filtered.length * 3);
  filtered.forEach((entry, index) => {
    const baseIndex = index * 3;
    positions[baseIndex] = entry.x;
    positions[baseIndex + 1] = entry.y;
    positions[baseIndex + 2] = entry.z;
  });
  return positions;
}

export function PolytopeVerticesLayer() {
  const snapshot = useViewportRenderSnapshot();
  const polytopeState = useLpvizSelector(
    selectPolytopeVerticesLayerState,
    arePolytopeVerticesLayerStatesEqual,
  );
  const circleTexture = useMemo(() => createCircleTexture(), []);
  const squareTexture = useMemo(() => createSquareTexture(), []);
  const vertices = useMemo(
    () => buildVertexEntries(polytopeState, snapshot.mode),
    [polytopeState, snapshot.mode],
  );
  const circlePositions = useMemo(
    () => buildPointPositions(vertices, "circle"),
    [vertices],
  );
  const squarePositions = useMemo(
    () => buildPointPositions(vertices, "square"),
    [vertices],
  );

  useEffect(() => {
    return () => {
      circleTexture.dispose();
      squareTexture.dispose();
    };
  }, [circleTexture, squareTexture]);

  if (vertices.length === 0) {
    return null;
  }

  if (snapshot.mode === "2d") {
    const vertexSize = VERTEX_PIXEL_SIZE * snapshot.unitsPerPixel;

    return (
      <group>
        {vertices.map((vertex) => (
          <mesh
            key={vertex.key}
            position={[vertex.x, vertex.y, vertex.z]}
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
              transparent
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      {circlePositions.length > 0 ? (
        <points renderOrder={VERTEX_RENDER_ORDER} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[circlePositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color={VERTEX_COLOR}
            size={VERTEX_PIXEL_SIZE}
            sizeAttenuation={false}
            transparent
            depthTest={false}
            depthWrite={false}
            alphaMap={circleTexture}
            alphaTest={0.2}
          />
        </points>
      ) : null}
      {squarePositions.length > 0 ? (
        <points renderOrder={VERTEX_RENDER_ORDER} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[squarePositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color={OPEN_ANCHOR_COLOR}
            size={VERTEX_PIXEL_SIZE}
            sizeAttenuation={false}
            transparent
            depthTest={false}
            depthWrite={false}
            alphaMap={squareTexture}
            alphaTest={0.2}
          />
        </points>
      ) : null}
    </group>
  );
}
