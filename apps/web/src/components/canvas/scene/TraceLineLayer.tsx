import { useMemo } from "react";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import { useLpvizStore } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shallowEqual } from "./shallowEqual";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { ThickLineShared } from "./ThickLineSegments";

const TRACE_COLOR = "#ffa500";
const TRACE_Z_OFFSET = 0.02;
const TRACE_OPACITY = 0.4;
const TRACE_RENDER_ORDER = RENDER_ORDER.traceLine;
const TRACE_LINE_THICKNESS = 2;

function buildTraceLineMaterial(is3D: boolean): LineMaterial {
  const material = new LineMaterial({
    color: TRACE_COLOR,
    linewidth: TRACE_LINE_THICKNESS,
    depthTest: is3D,
    depthWrite: is3D,
    transparent: true,
    opacity: TRACE_OPACITY,
  });
  return material;
}

const SHARED_TRACE_MATERIAL_2D = buildTraceLineMaterial(false);
const SHARED_TRACE_MATERIAL_3D = buildTraceLineMaterial(true);

// zScale is intentionally excluded — it is applied as a group transform, not baked
// into positions, so that slider changes are O(1) rather than O(N) rebuilds.
type TraceLineLayerState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const selectTraceLineLayerState = (state: State): TraceLineLayerState => ({
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
function buildTraceLinePositions(
  path: number[][],
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
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
    positions[baseIndex + 2] = getDisplayedTraceZ(
      entry,
      objectiveVector,
      zAxisOffsetOnly,
    );
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
  zAxisOffsetOnly: boolean,
) {
  const cacheKey = zAxisOffsetOnly ? "1" : "0";
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
    zAxisOffsetOnly,
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
    const positions = getCachedTraceLinePositions(entry, state.zAxisOffsetOnly);
    if (positions.length > 0) {
      lines.push({ key: getTraceEntryId(entry), positions });
    }
  });
  return lines;
}

export function TraceLineLayer() {
  const snapshot = useViewportRenderSnapshot();
  const traceState = useLpvizStore(selectTraceLineLayerState, shallowEqual);
  const zScale = useLpvizStore(selectTraceZScale);
  const lines = useMemo(
    () => buildTraceLines(traceState, snapshot.mode),
    [traceState, snapshot.mode],
  );

  if (lines.length === 0) {
    return null;
  }

  const is3D = snapshot.mode === "3d";
  const material = is3D ? SHARED_TRACE_MATERIAL_3D : SHARED_TRACE_MATERIAL_2D;

  return (
    <group scale-z={zScale / 100} position-z={is3D ? 0 : TRACE_Z_OFFSET}>
      {lines.map((line) => (
        <ThickLineShared
          key={line.key}
          positions={line.positions}
          material={material}
          renderOrder={TRACE_RENDER_ORDER}
        />
      ))}
    </group>
  );
}
