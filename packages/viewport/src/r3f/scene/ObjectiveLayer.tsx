import { useMemo } from "react";

import type { PointXY } from "@lpviz/math";
import { isObjectiveDirectionUnbounded } from "@lpviz/polytope";
import { hasPolytopeLines } from "@lpviz/polytope";
import type { State } from "@lpviz/state";
import { useLpvizSelector } from "@lpviz/state/react";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const OBJECTIVE_COLOR = "#008000";
const OBJECTIVE_UNBOUNDED_COLOR = "#ff0000";
const OBJECTIVE_Z = 0.015;
const OBJECTIVE_RENDER_ORDER = 5;
const OBJECTIVE_HEAD_LENGTH_PX = 16;
const ARROW_HALF_ANGLE = Math.PI / 6;
const OBJECTIVE_EPSILON = 1e-3;

type ObjectiveLayerState = {
  cacheKey: string;
  objectiveHidden: boolean;
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  completionMode: State["completionMode"];
  polytope: State["polytope"];
  tourActive: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const serializePoint = (point: PointXY | null) =>
  point ? `${point.x},${point.y}` : "";

const serializeObjectivePolytope = (polytope: State["polytope"]) =>
  polytope
    ? [
        polytope.kind,
        polytope.lines.map((line) => line.join(",")).join(";"),
      ].join("|")
    : "";

const selectObjectiveLayerState = (state: State): ObjectiveLayerState => ({
  cacheKey: [
    state.objectiveHidden ? "1" : "0",
    serializePoint(state.objectiveVector),
    serializePoint(state.currentObjective),
    state.completionMode,
    serializeObjectivePolytope(state.polytope),
    state.tourActive ? "1" : "0",
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  objectiveHidden: state.objectiveHidden,
  objectiveVector: state.objectiveVector,
  currentObjective: state.currentObjective,
  completionMode: state.completionMode,
  polytope: state.polytope,
  tourActive: state.tourActive,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areObjectiveLayerStatesEqual = (
  current: ObjectiveLayerState,
  next: ObjectiveLayerState,
) => current.cacheKey === next.cacheKey;

function buildArrowHeadSegments(
  tip: PointXY,
  angle: number,
  length: number,
): Array<[number, number, number, number]> {
  return [ARROW_HALF_ANGLE, -ARROW_HALF_ANGLE].map((offset) => {
    const targetAngle = angle + offset;
    const x2 = tip.x - length * Math.cos(targetAngle);
    const y2 = tip.y - length * Math.sin(targetAngle);
    return [tip.x, tip.y, x2, y2];
  });
}

function getWorldSizeFromPixels(
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
  pixels: number,
) {
  if (snapshot.mode === "2d") {
    return pixels * snapshot.unitsPerPixel;
  }

  const distance = Math.hypot(
    snapshot.perspective.position.x,
    snapshot.perspective.position.y,
    snapshot.perspective.position.z,
  );
  const fovRadians = (snapshot.perspective.fov * Math.PI) / 180;
  const viewportHeight = 2 * Math.tan(fovRadians / 2) * distance;
  return (pixels / Math.max(1, snapshot.height)) * viewportHeight;
}

function buildObjectiveGeometry(
  state: ObjectiveLayerState,
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
) {
  if (
    state.objectiveHidden ||
    !shouldRenderSnapshotMode(snapshot.mode, state)
  ) {
    return {
      positions: new Float32Array(),
      color: OBJECTIVE_COLOR,
    };
  }

  const target =
    state.objectiveVector ||
    (state.completionMode !== "draft" &&
    state.currentObjective &&
    !state.tourActive
      ? state.currentObjective
      : null);
  if (!target || Math.hypot(target.x, target.y) < OBJECTIVE_EPSILON) {
    return {
      positions: new Float32Array(),
      color: OBJECTIVE_COLOR,
    };
  }

  const objectiveZ = snapshot.mode === "2d" ? OBJECTIVE_Z : 0;
  const positions = [0, 0, objectiveZ, target.x, target.y, objectiveZ];
  const angle = Math.atan2(target.y, target.x);
  const headLength = getWorldSizeFromPixels(snapshot, OBJECTIVE_HEAD_LENGTH_PX);
  buildArrowHeadSegments(target, angle, headLength).forEach(
    ([x1, y1, x2, y2]) => {
      positions.push(x1, y1, objectiveZ, x2, y2, objectiveZ);
    },
  );

  const color =
    state.polytope?.kind === "unbounded" &&
    hasPolytopeLines(state.polytope) &&
    isObjectiveDirectionUnbounded(state.polytope.lines, [target.x, target.y])
      ? OBJECTIVE_UNBOUNDED_COLOR
      : OBJECTIVE_COLOR;

  return {
    positions: new Float32Array(positions),
    color,
  };
}

export function ObjectiveLayer() {
  const snapshot = useViewportRenderSnapshot();
  const objectiveState = useLpvizSelector(
    selectObjectiveLayerState,
    areObjectiveLayerStatesEqual,
  );
  const geometry = useMemo(
    () => buildObjectiveGeometry(objectiveState, snapshot),
    [objectiveState, snapshot],
  );

  if (geometry.positions.length === 0) {
    return null;
  }

  const is3D = snapshot.mode === "3d";

  return (
    <lineSegments renderOrder={OBJECTIVE_RENDER_ORDER} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[geometry.positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={geometry.color}
        depthTest={is3D}
        depthWrite={is3D}
      />
    </lineSegments>
  );
}
