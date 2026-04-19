import { useEffect, useMemo } from "react";
import { CanvasTexture } from "three";

import type { PointXY } from "@lpviz/math";
import type { State } from "@/state";
import { useLpvizSelector } from "@/state/react";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const ITERATE_STAR_COLOR = "#008000";
const ITERATE_STAR_Z = 0.03;
const ITERATE_STAR_PIXEL_SIZE = 18;
const ITERATE_STAR_RENDER_ORDER = RENDER_ORDER.iterateStar;

type IterateStarLayerState = {
  cacheKey: string;
  iteratePath: State["iteratePath"];
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

const selectIterateStarLayerState = (state: State): IterateStarLayerState => ({
  cacheKey: [
    serializeNumberPath(state.iteratePath),
    serializePoint(state.iterateObjectiveVector),
    state.zScale,
    state.zAxisOffsetOnly ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  iteratePath: state.iteratePath,
  iterateObjectiveVector: state.iterateObjectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areIterateStarLayerStatesEqual = (
  current: IterateStarLayerState,
  next: IterateStarLayerState,
) => current.cacheKey === next.cacheKey;

function createStarTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 48 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create iterate star texture context");
  }

  const outerRadius = size * 0.38;
  const innerRadius = outerRadius * 0.47;
  const center = size / 2;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
  context.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

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
  const iterateState = useLpvizSelector(
    selectIterateStarLayerState,
    areIterateStarLayerStatesEqual,
  );
  const starTexture = useMemo(() => createStarTexture(), []);
  const positions = useMemo(
    () => buildStarPositions(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  useEffect(() => {
    return () => {
      starTexture.dispose();
    };
  }, [starTexture]);

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
        alphaMap={starTexture}
        alphaTest={0.2}
      />
    </points>
  );
}
