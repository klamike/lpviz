import { useEffect, useMemo } from "react";
import { CanvasTexture } from "three";

import { useLpvizSelector } from "@/hooks/useLpvizSelector";
import { MAX_TRACE_POINT_SPRITES, type State } from "@/state";
import { useViewportRenderSnapshot } from "@/viewport/r3f/viewportRenderStore";
import type { PointXY } from "@lpviz/math";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";

const TRACE_COLOR = "#ffa500";
const TRACE_Z_OFFSET = 0.02;
const TRACE_POINT_PIXEL_SIZE = 6;
const TRACE_POINTS_RENDER_ORDER = RENDER_ORDER.tracePoints;

type TracePointsLayerState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  traceCount: number;
  traceFirstEntry: State["traceBuffer"][number] | undefined;
  traceLastEntry: State["traceBuffer"][number] | undefined;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const selectTracePointsLayerState = (state: State): TracePointsLayerState => ({
  traceEnabled: state.traceEnabled,
  traceBuffer: state.traceBuffer,
  traceCount: state.traceBuffer.length,
  traceFirstEntry: state.traceBuffer[0],
  traceLastEntry: state.traceBuffer[state.traceBuffer.length - 1],
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areTracePointsLayerStatesEqual = (
  current: TracePointsLayerState,
  next: TracePointsLayerState,
) =>
  current.traceEnabled === next.traceEnabled &&
  current.traceCount === next.traceCount &&
  current.traceFirstEntry === next.traceFirstEntry &&
  current.traceLastEntry === next.traceLastEntry &&
  current.zScale === next.zScale &&
  current.zAxisOffsetOnly === next.zAxisOffsetOnly &&
  current.is3DMode === next.is3DMode &&
  current.isTransitioning3D === next.isTransitioning3D;

function createCircleTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create trace point texture context");
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

function buildTracePathPositions(
  path: number[][],
  objectiveVector: PointXY | null,
  zScale: number,
  zAxisOffsetOnly: boolean,
  is3D: boolean,
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
    positions[baseIndex + 2] =
      (getDisplayedTraceZ(entry, objectiveVector, zAxisOffsetOnly) * zScale) /
        100 +
      (is3D ? 0 : TRACE_Z_OFFSET);
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
  state: Pick<TracePointsLayerState, "zScale" | "zAxisOffsetOnly">,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  const cacheKey = `${mode}:${state.zScale}:${state.zAxisOffsetOnly ? 1 : 0}`;
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
    state.zScale,
    state.zAxisOffsetOnly,
    mode === "3d",
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
    .map((entry) => getCachedTracePointPositions(entry, state, mode))
    .filter((chunk) => chunk.length > 0);

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const positions = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    positions.set(chunk, offset);
    offset += chunk.length;
  });

  return positions;
}

export function TracePointsLayer() {
  const snapshot = useViewportRenderSnapshot();
  const traceState = useLpvizSelector(
    selectTracePointsLayerState,
    areTracePointsLayerStatesEqual,
  );
  const circleTexture = useMemo(() => createCircleTexture(), []);
  const positions = useMemo(
    () => buildTracePointPositions(traceState, snapshot.mode),
    [traceState, snapshot.mode],
  );

  useEffect(() => {
    return () => {
      circleTexture.dispose();
    };
  }, [circleTexture]);

  if (positions.length === 0) {
    return null;
  }

  return (
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
        alphaMap={circleTexture}
        alphaTest={0.2}
      />
    </points>
  );
}
