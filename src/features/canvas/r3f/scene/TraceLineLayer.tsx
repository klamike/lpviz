import { useMemo } from "react";

import type { PointXY } from "../../../../math/blas";
import type { State } from "../../../../store/lpvizStore";
import { useLpvizSelector } from "../../../../store/useLpvizStore";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const TRACE_COLOR = "#ffa500";
const TRACE_Z_OFFSET = 0.02;
const TRACE_OPACITY = 0.4;
const TRACE_RENDER_ORDER = 6;

type TraceLineLayerState = {
  cacheKey: string;
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  zScale: number;
  zAxisOffsetOnly: boolean;
};

const serializePoint = (point: PointXY | null) =>
  point ? `${point.x},${point.y}` : "";

const serializeNumberPath = (path: ReadonlyArray<ReadonlyArray<number>>) =>
  path.map((entry) => entry.join(",")).join(";");

const serializeTraceBuffer = (traceBuffer: State["traceBuffer"]) =>
  traceBuffer
    .map(
      (entry) =>
        `${serializePoint(entry.objectiveVector)}:${serializeNumberPath(entry.path)}`,
    )
    .join("|");

const selectTraceLineLayerState = (state: State): TraceLineLayerState => ({
  cacheKey: [
    state.traceEnabled ? "1" : "0",
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    serializeTraceBuffer(state.traceBuffer),
  ].join("|"),
  traceEnabled: state.traceEnabled,
  traceBuffer: state.traceBuffer,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
});

const areTraceLineLayerStatesEqual = (
  current: TraceLineLayerState,
  next: TraceLineLayerState,
) => current.cacheKey === next.cacheKey;

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

function buildTraceSegmentPositions(
  path: number[][],
  objectiveVector: PointXY | null,
  zScale: number,
  zAxisOffsetOnly: boolean,
) {
  if (path.length < 2) {
    return new Float32Array();
  }

  const points = path.map((entry) => ({
    x: entry[0]!,
    y: entry[1]!,
    z:
      (getDisplayedTraceZ(entry, objectiveVector, zAxisOffsetOnly) * zScale) /
        100 +
      TRACE_Z_OFFSET,
  }));
  const positions = new Float32Array((points.length - 1) * 6);

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const baseIndex = index * 6;
    positions[baseIndex] = start.x;
    positions[baseIndex + 1] = start.y;
    positions[baseIndex + 2] = start.z;
    positions[baseIndex + 3] = end.x;
    positions[baseIndex + 4] = end.y;
    positions[baseIndex + 5] = end.z;
  }

  return positions;
}

function buildTraceLines(state: TraceLineLayerState) {
  if (!state.traceEnabled || state.traceBuffer.length === 0) {
    return [] as Array<{ key: number; positions: Float32Array }>;
  }

  const lines: Array<{ key: number; positions: Float32Array }> = [];
  state.traceBuffer.forEach((entry, index) => {
    const positions = buildTraceSegmentPositions(
      entry.path,
      entry.objectiveVector,
      state.zScale,
      state.zAxisOffsetOnly,
    );
    if (positions.length > 0) {
      lines.push({ key: index, positions });
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
    () => (snapshot.mode === "2d" ? buildTraceLines(traceState) : []),
    [traceState, snapshot.mode],
  );

  if (snapshot.mode !== "2d" || lines.length === 0) {
    return null;
  }

  return (
    <group>
      {lines.map((line) => (
        <lineSegments
          key={line.key}
          renderOrder={TRACE_RENDER_ORDER}
          frustumCulled={false}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[line.positions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={TRACE_COLOR}
            transparent
            opacity={TRACE_OPACITY}
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}
