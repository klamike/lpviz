import { useEffect, useMemo } from "react";
import { CanvasTexture, Color } from "three";

import type { PointXY } from "@lpviz/math";
import type { State } from "@/state";
import { useLpvizSelector } from "@/state/react";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { useViewportRenderSnapshot } from "@/viewport/r3f/viewportRenderStore";

const ITERATE_POINT_COLOR = "#800080";
const PHASE_COLORS = [
  "#e41a1c",
  "#377eb8",
  "#4daf4a",
  "#984ea3",
  "#ff7f00",
  "#ffff33",
  "#a65628",
  "#f781bf",
  "#999999",
  "#17becf",
];
const ITERATE_Z = 0.03;
const ITERATE_POINT_PIXEL_SIZE = 8;
const ITERATE_POINTS_RENDER_ORDER = RENDER_ORDER.iteratePoints;

type IteratePointsLayerState = {
  cacheKey: string;
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const serializePoint = (point: PointXY | null) =>
  point ? `${point.x},${point.y}` : "";

const serializeNumberPath = (path: ReadonlyArray<ReadonlyArray<number>>) =>
  path.map((entry) => entry.join(",")).join(";");

const selectIteratePointsLayerState = (
  state: State,
): IteratePointsLayerState => ({
  cacheKey: [
    serializeNumberPath(state.iteratePath),
    state.iteratePhases.join(","),
    serializePoint(state.iterateObjectiveVector),
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  iteratePath: state.iteratePath,
  iteratePhases: state.iteratePhases,
  iterateObjectiveVector: state.iterateObjectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areIteratePointsLayerStatesEqual = (
  current: IteratePointsLayerState,
  next: IteratePointsLayerState,
) => current.cacheKey === next.cacheKey;

function createCircleTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create iterate point texture context");
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

function getDisplayedIterateZ(
  entry: ReadonlyArray<number>,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2]! : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

function buildIteratePointGeometry(
  state: IteratePointsLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  if (
    state.iteratePath.length === 0 ||
    !shouldRenderSnapshotMode(mode, state)
  ) {
    return {
      positions: new Float32Array(),
      colors: null as Float32Array | null,
    };
  }

  const is3D = mode === "3d";
  const positions = new Float32Array(state.iteratePath.length * 3);
  const hasPhases =
    state.iteratePhases.length === state.iteratePath.length &&
    state.iteratePhases.length > 0;
  const colors = hasPhases
    ? new Float32Array(state.iteratePath.length * 3)
    : null;

  for (let index = 0; index < state.iteratePath.length; index += 1) {
    const entry = state.iteratePath[index]!;
    const baseIndex = index * 3;
    positions[baseIndex] = entry[0]!;
    positions[baseIndex + 1] = entry[1]!;
    positions[baseIndex + 2] = is3D
      ? (getDisplayedIterateZ(
          entry,
          state.iterateObjectiveVector,
          state.zAxisOffsetOnly,
        ) *
          state.zScale) /
          100 +
        ITERATE_Z
      : ITERATE_Z;

    if (colors) {
      const color = new Color(
        PHASE_COLORS[state.iteratePhases[index]! % PHASE_COLORS.length]!,
      );
      colors[baseIndex] = color.r;
      colors[baseIndex + 1] = color.g;
      colors[baseIndex + 2] = color.b;
    }
  }

  return { positions, colors };
}

export function IteratePointsLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizSelector(
    selectIteratePointsLayerState,
    areIteratePointsLayerStatesEqual,
  );
  const circleTexture = useMemo(() => createCircleTexture(), []);
  const geometry = useMemo(
    () => buildIteratePointGeometry(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  useEffect(() => {
    return () => {
      circleTexture.dispose();
    };
  }, [circleTexture]);

  if (geometry.positions.length === 0) {
    return null;
  }

  return (
    <points renderOrder={ITERATE_POINTS_RENDER_ORDER} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[geometry.positions, 3]}
        />
        {geometry.colors ? (
          <bufferAttribute
            attach="attributes-color"
            args={[geometry.colors, 3]}
          />
        ) : null}
      </bufferGeometry>
      <pointsMaterial
        color={geometry.colors ? "#ffffff" : ITERATE_POINT_COLOR}
        size={ITERATE_POINT_PIXEL_SIZE}
        sizeAttenuation={false}
        transparent
        depthTest={false}
        depthWrite={false}
        alphaMap={circleTexture}
        alphaTest={0.2}
        vertexColors={Boolean(geometry.colors)}
      />
    </points>
  );
}
