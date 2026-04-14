import { useMemo } from "react";

import type { PointXY } from "../../../../math/blas";
import type { State } from "../../../../store/lpvizStore";
import { useLpvizSelector } from "../../../../store/useLpvizStore";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const ITERATE_LINE_COLOR = "#800080";
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
const ITERATE_LINE_RENDER_ORDER = 20;

type IterateLineLayerState = {
  cacheKey: string;
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

type IterateLineEntry = {
  key: string;
  color: string;
  positions: Float32Array;
};

const serializePoint = (point: PointXY | null) =>
  point ? `${point.x},${point.y}` : "";

const serializeNumberPath = (path: ReadonlyArray<ReadonlyArray<number>>) =>
  path.map((entry) => entry.join(",")).join(";");

const selectIterateLineLayerState = (state: State): IterateLineLayerState => ({
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

const areIterateLineLayerStatesEqual = (
  current: IterateLineLayerState,
  next: IterateLineLayerState,
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

function getIterateRenderZ(
  entry: ReadonlyArray<number>,
  state: Pick<
    IterateLineLayerState,
    "iterateObjectiveVector" | "zScale" | "zAxisOffsetOnly"
  >,
  is3D: boolean,
) {
  if (!is3D) {
    return ITERATE_Z;
  }

  return (
    (getDisplayedIterateZ(
      entry,
      state.iterateObjectiveVector,
      state.zAxisOffsetOnly,
    ) *
      state.zScale) /
      100 +
    ITERATE_Z
  );
}

function buildSegmentPositions(
  path: ReadonlyArray<ReadonlyArray<number>>,
  state: Pick<
    IterateLineLayerState,
    "iterateObjectiveVector" | "zScale" | "zAxisOffsetOnly"
  >,
  is3D: boolean,
) {
  if (path.length < 2) {
    return new Float32Array();
  }

  const positions = new Float32Array((path.length - 1) * 6);
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index]!;
    const end = path[index + 1]!;
    const baseIndex = index * 6;
    positions[baseIndex] = start[0]!;
    positions[baseIndex + 1] = start[1]!;
    positions[baseIndex + 2] = getIterateRenderZ(start, state, is3D);
    positions[baseIndex + 3] = end[0]!;
    positions[baseIndex + 4] = end[1]!;
    positions[baseIndex + 5] = getIterateRenderZ(end, state, is3D);
  }

  return positions;
}

function buildIterateLineEntries(
  state: IterateLineLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
): IterateLineEntry[] {
  if (
    state.iteratePath.length < 2 ||
    state.isTransitioning3D ||
    (mode === "3d" && !state.is3DMode)
  ) {
    return [];
  }

  const is3D = mode === "3d";
  const hasPhases =
    state.iteratePhases.length === state.iteratePath.length &&
    state.iteratePhases.length > 0;

  if (!hasPhases) {
    return [
      {
        key: "iterate-line",
        color: ITERATE_LINE_COLOR,
        positions: buildSegmentPositions(state.iteratePath, state, is3D),
      },
    ];
  }

  const entries: IterateLineEntry[] = [];
  let segmentStart = 0;
  let segmentPhase = state.iteratePhases[0]!;
  let segmentCount = 0;

  for (let index = 1; index < state.iteratePath.length; index += 1) {
    const currentPhase = state.iteratePhases[index]!;
    const previousPhase = state.iteratePhases[index - 1]!;
    if (currentPhase !== previousPhase) {
      const segmentPath = state.iteratePath.slice(segmentStart, index + 1);
      const positions = buildSegmentPositions(segmentPath, state, is3D);
      if (positions.length > 0) {
        entries.push({
          key: `phase-${segmentCount}`,
          color: PHASE_COLORS[segmentPhase % PHASE_COLORS.length]!,
          positions,
        });
        segmentCount += 1;
      }
      segmentStart = index - 1;
      segmentPhase = currentPhase;
    }
  }

  const segmentPath = state.iteratePath.slice(segmentStart);
  const positions = buildSegmentPositions(segmentPath, state, is3D);
  if (positions.length > 0) {
    entries.push({
      key: `phase-${segmentCount}`,
      color: PHASE_COLORS[segmentPhase % PHASE_COLORS.length]!,
      positions,
    });
  }

  return entries;
}

export function IterateLineLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizSelector(
    selectIterateLineLayerState,
    areIterateLineLayerStatesEqual,
  );
  const lines = useMemo(
    () => buildIterateLineEntries(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  if (lines.length === 0) {
    return null;
  }

  return (
    <group>
      {lines.map((line) => (
        <lineSegments
          key={line.key}
          renderOrder={ITERATE_LINE_RENDER_ORDER}
          frustumCulled={false}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[line.positions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={line.color}
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}
