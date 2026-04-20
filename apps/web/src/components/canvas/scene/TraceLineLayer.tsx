import { useMemo } from "react";

import type { PointXY } from "@lpviz/math";
import type { State } from "@/state";
import { useLpvizSelector } from "@/state/react";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { RENDER_ORDER } from "./renderOrder";
import { ThickLine } from "./ThickLineSegments";
import { useViewportRenderSnapshot } from "@/viewport/r3f/viewportRenderStore";

const TRACE_COLOR = "#ffa500";
const TRACE_Z_OFFSET = 0.02;
const TRACE_OPACITY = 0.4;
const TRACE_RENDER_ORDER = RENDER_ORDER.traceLine;
const TRACE_LINE_THICKNESS = 2;

type TraceLineLayerState = {
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

const selectTraceLineLayerState = (state: State): TraceLineLayerState => ({
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

const areTraceLineLayerStatesEqual = (
  current: TraceLineLayerState,
  next: TraceLineLayerState,
) =>
  current.traceEnabled === next.traceEnabled &&
  current.traceCount === next.traceCount &&
  current.traceFirstEntry === next.traceFirstEntry &&
  current.traceLastEntry === next.traceLastEntry &&
  current.zScale === next.zScale &&
  current.zAxisOffsetOnly === next.zAxisOffsetOnly &&
  current.is3DMode === next.is3DMode &&
  current.isTransitioning3D === next.isTransitioning3D;

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

function buildTraceLinePositions(
  path: number[][],
  objectiveVector: PointXY | null,
  zScale: number,
  zAxisOffsetOnly: boolean,
  is3D: boolean,
) {
  if (path.length < 2) {
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

const traceEntryIds = new WeakMap<object, number>();
let nextTraceEntryId = 1;
const traceLinePositionCache = new WeakMap<object, Map<string, Float32Array>>();

function getTraceEntryId(entry: State["traceBuffer"][number]) {
  let id = traceEntryIds.get(entry);
  if (id === undefined) {
    id = nextTraceEntryId++;
    traceEntryIds.set(entry, id);
  }
  return id;
}

function getCachedTraceLinePositions(
  entry: State["traceBuffer"][number],
  state: Pick<TraceLineLayerState, "zScale" | "zAxisOffsetOnly">,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  const cacheKey = `${mode}:${state.zScale}:${state.zAxisOffsetOnly ? 1 : 0}`;
  let cache = traceLinePositionCache.get(entry);
  if (!cache) {
    cache = new Map();
    traceLinePositionCache.set(entry, cache);
  }
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const positions = buildTraceLinePositions(
    entry.path,
    entry.objectiveVector,
    state.zScale,
    state.zAxisOffsetOnly,
    mode === "3d",
  );
  cache.set(cacheKey, positions);
  return positions;
}

function buildTraceLines(
  state: TraceLineLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  if (
    !state.traceEnabled ||
    state.traceBuffer.length === 0 ||
    !shouldRenderSnapshotMode(mode, state)
  ) {
    return [] as Array<{ key: number; positions: Float32Array }>;
  }

  const lines: Array<{ key: number; positions: Float32Array }> = [];
  state.traceBuffer.forEach((entry) => {
    const positions = getCachedTraceLinePositions(entry, state, mode);
    if (positions.length > 0) {
      lines.push({ key: getTraceEntryId(entry), positions });
    }
  });
  return lines;
}

export function TraceLineLayer() {
  const snapshot = useViewportRenderSnapshot();
  const traceState = useLpvizSelector(
    selectTraceLineLayerState,
    areTraceLineLayerStatesEqual,
  );
  const lines = useMemo(
    () => buildTraceLines(traceState, snapshot.mode),
    [traceState, snapshot.mode],
  );

  if (lines.length === 0) {
    return null;
  }

  const is3D = snapshot.mode === "3d";

  return (
    <group>
      {lines.map((line) => (
        <ThickLine
          key={line.key}
          positions={line.positions}
          color={TRACE_COLOR}
          width={TRACE_LINE_THICKNESS}
          renderOrder={TRACE_RENDER_ORDER}
          depthTest={is3D}
          depthWrite={is3D}
          transparent
          opacity={TRACE_OPACITY}
        />
      ))}
    </group>
  );
}
