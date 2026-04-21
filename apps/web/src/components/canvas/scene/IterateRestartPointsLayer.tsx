import { useMemo } from "react";
import { Color } from "three";

import { useLpvizStore } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shallowEqual } from "./shallowEqual";
import { SHARED_SQUARE_TEXTURE } from "./sharedTextures";
import { shouldRenderSnapshotMode } from "./sceneVisibility";

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
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateRestartIndices: State["iterateRestartIndices"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const selectIterateRestartPointsLayerState = (
  state: State,
): IterateRestartPointsLayerState => ({
  iteratePath: state.iteratePath,
  iteratePhases: state.iteratePhases,
  iterateRestartIndices: state.iterateRestartIndices,
  iterateObjectiveVector: state.iterateObjectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

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

  const reusableColor = new Color();
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
      reusableColor.set(
        PHASE_COLORS[state.iteratePhases[restartIndex]! % PHASE_COLORS.length]!,
      );
      colors[baseIndex] = reusableColor.r;
      colors[baseIndex + 1] = reusableColor.g;
      colors[baseIndex + 2] = reusableColor.b;
    }
  }

  return { positions, colors };
}

export function IterateRestartPointsLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizStore(
    selectIterateRestartPointsLayerState,
    shallowEqual,
  );
  const geometry = useMemo(
    () => buildIterateRestartPointGeometry(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

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
        alphaMap={SHARED_SQUARE_TEXTURE}
        alphaTest={0.2}
        vertexColors={Boolean(geometry.colors)}
      />
    </points>
  );
}
