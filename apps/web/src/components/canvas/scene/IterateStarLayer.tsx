import { useMemo } from "react";

import { useLpvizStore } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shallowEqual } from "./shallowEqual";
import { SHARED_STAR_TEXTURE } from "./sharedTextures";
import { shouldRenderSnapshotMode } from "./sceneVisibility";

const ITERATE_STAR_COLOR = "#008000";
const ITERATE_STAR_Z = 0.03;
const ITERATE_STAR_PIXEL_SIZE = 18;
const ITERATE_STAR_RENDER_ORDER = RENDER_ORDER.iterateStar;

type IterateStarLayerState = {
  iteratePath: State["iteratePath"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const selectIterateStarLayerState = (state: State): IterateStarLayerState => ({
  iteratePath: state.iteratePath,
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

function buildStarPositions(
  state: IterateStarLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  const entry = state.iteratePath[state.iteratePath.length - 1];
  if (!entry || !shouldRenderSnapshotMode(mode, state)) {
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
      ITERATE_STAR_Z
    : ITERATE_STAR_Z;

  return new Float32Array([entry[0]!, entry[1]!, z]);
}

export function IterateStarLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizStore(
    selectIterateStarLayerState,
    shallowEqual,
  );
  const positions = useMemo(
    () => buildStarPositions(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  if (positions.length === 0) {
    return null;
  }

  return (
    <points renderOrder={ITERATE_STAR_RENDER_ORDER} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={ITERATE_STAR_COLOR}
        size={ITERATE_STAR_PIXEL_SIZE}
        sizeAttenuation={false}
        transparent
        depthTest={false}
        depthWrite={false}
        alphaMap={SHARED_STAR_TEXTURE}
        alphaTest={0.2}
      />
    </points>
  );
}
