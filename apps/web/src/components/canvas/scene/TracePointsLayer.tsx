import { useMemo } from "react";

import { useLpvizStore } from "@/features/core/store";
import { MAX_TRACE_POINT_SPRITES, type State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shallowEqual } from "./shallowEqual";
import { SHARED_CIRCLE_TEXTURE } from "./sharedTextures";
import { shouldRenderSnapshotMode } from "./sceneVisibility";

const TRACE_COLOR = "#ffa500";
const TRACE_Z_OFFSET = 0.02;
const TRACE_POINT_PIXEL_SIZE = 6;
const TRACE_POINTS_RENDER_ORDER = RENDER_ORDER.tracePoints;

// zScale is intentionally excluded — it is applied as a group transform, not baked
// into positions, so that slider changes are O(1) rather than O(N) rebuilds.
type TracePointsLayerState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const selectTracePointsLayerState = (state: State): TracePointsLayerState => ({
  traceEnabled: state.traceEnabled,
  traceBuffer: state.traceBuffer,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const selectTraceZScale = (state: State) => state.zScale;

function getDisplayedTraceZ(
  entry: number[],
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2] : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

// Positions are stored with raw z (no zScale, no mode offset). zScale is applied
// as group.scale.z and the 2D offset as group.position.z at render time.
function buildTracePathPositions(
  path: number[][],
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  if (path.length === 0) {
    return new Float32Array();
  }

  const positions = new Float32Array(path.length * 3);
  for (let index = 0; index < path.length; index += 1) {
    const entry = path[index]!;
    const baseIndex = index * 3;
    positions[baseIndex] = entry[0]!;
    positions[baseIndex + 1] = entry[1]!;
    positions[baseIndex + 2] = getDisplayedTraceZ(
      entry,
      objectiveVector,
      zAxisOffsetOnly,
    );
  }

  return positions;
}

function buildTraceSamplePositions(pathPositions: Float32Array) {
  const pointCount = Math.floor(pathPositions.length / 3);
  if (pointCount === 0) {
    return [] as number[];
  }

  const step = Math.max(1, Math.ceil(pointCount / MAX_TRACE_POINT_SPRITES));
  const samples: number[] = [];
  for (let index = 0; index < pointCount; index += step) {
    const baseIndex = index * 3;
    samples.push(
      pathPositions[baseIndex]!,
      pathPositions[baseIndex + 1]!,
      pathPositions[baseIndex + 2]!,
    );
  }
  const lastBaseIndex = (pointCount - 1) * 3;
  if (
    samples.length === 0 ||
    samples[samples.length - 3] !== pathPositions[lastBaseIndex] ||
    samples[samples.length - 2] !== pathPositions[lastBaseIndex + 1] ||
    samples[samples.length - 1] !== pathPositions[lastBaseIndex + 2]
  ) {
    samples.push(
      pathPositions[lastBaseIndex]!,
      pathPositions[lastBaseIndex + 1]!,
      pathPositions[lastBaseIndex + 2]!,
    );
  }
  return samples;
}

const tracePointPositionCache = new WeakMap<
  object,
  Map<string, Float32Array>
>();

function getCachedTracePointPositions(
  entry: State["traceBuffer"][number],
  zAxisOffsetOnly: boolean,
) {
  const cacheKey = zAxisOffsetOnly ? "1" : "0";
  let cache = tracePointPositionCache.get(entry);
  if (!cache) {
    cache = new Map();
    tracePointPositionCache.set(entry, cache);
  }
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const pathPositions = buildTracePathPositions(
    entry.path,
    entry.objectiveVector,
    zAxisOffsetOnly,
  );
  const sampled =
    pathPositions.length === 0
      ? new Float32Array()
      : new Float32Array(buildTraceSamplePositions(pathPositions));
  cache.set(cacheKey, sampled);
  return sampled;
}

function buildTracePointPositions(
  state: TracePointsLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  if (
    !state.traceEnabled ||
    state.traceBuffer.length === 0 ||
    !shouldRenderSnapshotMode(mode, state)
  ) {
    return new Float32Array();
  }

  const chunks = state.traceBuffer
    .map((entry) => getCachedTracePointPositions(entry, state.zAxisOffsetOnly))
    .filter((chunk) => chunk.length > 0);

  if (chunks.length === 0) {
    return new Float32Array();
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const positions = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    positions.set(chunk, offset);
    offset += chunk.length;
  }

  return positions;
}

export function TracePointsLayer() {
  const snapshot = useViewportRenderSnapshot();
  const traceState = useLpvizStore(selectTracePointsLayerState, shallowEqual);
  const zScale = useLpvizStore(selectTraceZScale);
  const positions = useMemo(
    () => buildTracePointPositions(traceState, snapshot.mode),
    [traceState, snapshot.mode],
  );

  if (positions.length === 0) {
    return null;
  }

  const is3D = snapshot.mode === "3d";

  return (
    <group scale-z={zScale / 100} position-z={is3D ? 0 : TRACE_Z_OFFSET}>
      <points renderOrder={TRACE_POINTS_RENDER_ORDER} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={TRACE_COLOR}
          size={TRACE_POINT_PIXEL_SIZE}
          sizeAttenuation={false}
          transparent
          depthTest={false}
          depthWrite={false}
          alphaMap={SHARED_CIRCLE_TEXTURE}
          alphaTest={0.2}
        />
      </points>
    </group>
  );
}
