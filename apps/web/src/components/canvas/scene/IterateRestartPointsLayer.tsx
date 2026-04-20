import { useEffect, useMemo } from "react";
import { CanvasTexture, Color } from "three";

import type { PointXY } from "@lpviz/math";
import type { State } from "@/state";
import { useLpvizSelector } from "@/state/react";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { useViewportRenderSnapshot } from "@/viewport/r3f/viewportRenderStore";

const ITERATE_RESTART_POINT_COLOR = "#800080";
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
const ITERATE_RESTART_POINT_SIZE = 8 * 1.4;
const ITERATE_RESTART_POINTS_RENDER_ORDER = RENDER_ORDER.iterateRestartPoints;

type IterateRestartPointsLayerState = {
  cacheKey: string;
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateRestartIndices: State["iterateRestartIndices"];
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

const selectIterateRestartPointsLayerState = (
  state: State,
): IterateRestartPointsLayerState => ({
  cacheKey: [
    serializeNumberPath(state.iteratePath),
    state.iteratePhases.join(","),
    state.iterateRestartIndices.join(","),
    serializePoint(state.iterateObjectiveVector),
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  iteratePath: state.iteratePath,
  iteratePhases: state.iteratePhases,
  iterateRestartIndices: state.iterateRestartIndices,
  iterateObjectiveVector: state.iterateObjectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areIterateRestartPointsLayerStatesEqual = (
  current: IterateRestartPointsLayerState,
  next: IterateRestartPointsLayerState,
) => current.cacheKey === next.cacheKey;

function createSquareTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create iterate restart texture context");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  const inset = size * 0.06;
  context.fillRect(inset, inset, size - inset * 2, size - inset * 2);

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

function buildIterateRestartPointGeometry(
  state: IterateRestartPointsLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  if (!shouldRenderSnapshotMode(mode, state)) {
    return {
      positions: new Float32Array(),
      colors: null as Float32Array | null,
    };
  }

  const visibleRestartIndices = state.iterateRestartIndices.filter(
    (index) => index >= 0 && index < state.iteratePath.length,
  );
  if (visibleRestartIndices.length === 0) {
    return {
      positions: new Float32Array(),
      colors: null as Float32Array | null,
    };
  }

  const is3D = mode === "3d";
  const hasPhases =
    state.iteratePhases.length === state.iteratePath.length &&
    state.iteratePhases.length > 0;
  const positions = new Float32Array(visibleRestartIndices.length * 3);
  const colors = hasPhases
    ? new Float32Array(visibleRestartIndices.length * 3)
    : null;

  for (let index = 0; index < visibleRestartIndices.length; index += 1) {
    const restartIndex = visibleRestartIndices[index]!;
    const entry = state.iteratePath[restartIndex]!;
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
        PHASE_COLORS[state.iteratePhases[restartIndex]! % PHASE_COLORS.length]!,
      );
      colors[baseIndex] = color.r;
      colors[baseIndex + 1] = color.g;
      colors[baseIndex + 2] = color.b;
    }
  }

  return { positions, colors };
}

export function IterateRestartPointsLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizSelector(
    selectIterateRestartPointsLayerState,
    areIterateRestartPointsLayerStatesEqual,
  );
  const squareTexture = useMemo(() => createSquareTexture(), []);
  const geometry = useMemo(
    () => buildIterateRestartPointGeometry(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  useEffect(() => {
    return () => {
      squareTexture.dispose();
    };
  }, [squareTexture]);

  if (geometry.positions.length === 0) {
    return null;
  }

  return (
    <points
      renderOrder={ITERATE_RESTART_POINTS_RENDER_ORDER}
      frustumCulled={false}
    >
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
        color={geometry.colors ? "#ffffff" : ITERATE_RESTART_POINT_COLOR}
        size={ITERATE_RESTART_POINT_SIZE}
        sizeAttenuation={false}
        transparent
        depthTest={false}
        depthWrite={false}
        alphaMap={squareTexture}
        alphaTest={0.2}
        vertexColors={Boolean(geometry.colors)}
      />
    </points>
  );
}
