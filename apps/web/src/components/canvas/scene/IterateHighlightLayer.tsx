import { useMemo } from "react";

import { useLpvizStore } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { SHARED_CIRCLE_TEXTURE } from "./sharedTextures";
import { shouldRenderSnapshotMode } from "./sceneVisibility";

const ITERATE_HIGHLIGHT_COLOR = "#008000";
const ITERATE_HIGHLIGHT_Z = 0.03;
const ITERATE_HIGHLIGHT_PIXEL_SIZE = 8 * 1.3;
const ITERATE_HIGHLIGHT_RENDER_ORDER = RENDER_ORDER.iterateHighlight;

type IterateHighlightLayerState = {
  cacheKey: string;
  iteratePath: State["iteratePath"];
  highlightIteratePathIndex: State["highlightIteratePathIndex"];
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

const selectIterateHighlightLayerState = (
  state: State,
): IterateHighlightLayerState => ({
  cacheKey: [
    serializeNumberPath(state.iteratePath),
    state.highlightIteratePathIndex ?? "",
    serializePoint(state.iterateObjectiveVector),
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  iteratePath: state.iteratePath,
  highlightIteratePathIndex: state.highlightIteratePathIndex,
  iterateObjectiveVector: state.iterateObjectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areIterateHighlightLayerStatesEqual = (
  current: IterateHighlightLayerState,
  next: IterateHighlightLayerState,
) => current.cacheKey === next.cacheKey;

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

function buildHighlightPositions(
  state: IterateHighlightLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  const index = state.highlightIteratePathIndex;
  if (
    index === null ||
    index < 0 ||
    index >= state.iteratePath.length ||
    !shouldRenderSnapshotMode(mode, state)
  ) {
    return new Float32Array();
  }

  const entry = state.iteratePath[index];
  if (!entry) {
    return new Float32Array();
  }

  const is3D = mode === "3d";
  const z = is3D
    ? (getDisplayedIterateZ(
        entry,
        state.iterateObjectiveVector,
        state.zAxisOffsetOnly,
      ) *
        state.zScale) /
        100 +
      ITERATE_HIGHLIGHT_Z
    : ITERATE_HIGHLIGHT_Z;

  return new Float32Array([entry[0]!, entry[1]!, z]);
}

export function IterateHighlightLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizStore(
    selectIterateHighlightLayerState,
    areIterateHighlightLayerStatesEqual,
  );
  const positions = useMemo(
    () => buildHighlightPositions(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  if (positions.length === 0) {
    return null;
  }

  return (
    <points renderOrder={ITERATE_HIGHLIGHT_RENDER_ORDER} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={ITERATE_HIGHLIGHT_COLOR}
        size={ITERATE_HIGHLIGHT_PIXEL_SIZE}
        sizeAttenuation={false}
        transparent
        depthTest={false}
        depthWrite={false}
        alphaMap={SHARED_CIRCLE_TEXTURE}
        alphaTest={0.2}
      />
    </points>
  );
}
