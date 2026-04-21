import { useMemo } from "react";

import { useLpvizStore } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shallowEqual } from "./shallowEqual";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { ThickLine } from "./ThickLineSegments";

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
const ITERATE_LINE_RENDER_ORDER = RENDER_ORDER.iterateLine;
const ITERATE_LINE_THICKNESS = 3;

type IterateLineLayerState = {
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

const selectIterateLineLayerState = (state: State): IterateLineLayerState => ({
  iteratePath: state.iteratePath,
  iteratePhases: state.iteratePhases,
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

function buildLinePositions(
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

  const positions = new Float32Array(path.length * 3);
  for (let index = 0; index < path.length; index += 1) {
    const entry = path[index]!;
    const baseIndex = index * 3;
    positions[baseIndex] = entry[0]!;
    positions[baseIndex + 1] = entry[1]!;
    positions[baseIndex + 2] = getIterateRenderZ(entry, state, is3D);
  }

  return positions;
}

function buildIterateLineEntries(
  state: IterateLineLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
): IterateLineEntry[] {
  if (state.iteratePath.length < 2 || !shouldRenderSnapshotMode(mode, state)) {
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
        positions: buildLinePositions(state.iteratePath, state, is3D),
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
      const positions = buildLinePositions(segmentPath, state, is3D);
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
  const positions = buildLinePositions(segmentPath, state, is3D);
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
  const iterateState = useLpvizStore(
    selectIterateLineLayerState,
    shallowEqual,
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
        <ThickLine
          key={line.key}
          positions={line.positions}
          color={line.color}
          width={ITERATE_LINE_THICKNESS}
          renderOrder={ITERATE_LINE_RENDER_ORDER}
          depthTest={false}
          depthWrite={false}
        />
      ))}
    </group>
  );
}
