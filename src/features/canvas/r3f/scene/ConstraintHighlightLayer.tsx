import { useMemo } from "react";

import type { Line, PointXY } from "../../../../math/blas";
import { hasPolytopeLines } from "../../../../polytope/polytopeTypes";
import type { State } from "../../../../store/lpvizStore";
import { useLpvizSelector } from "../../../../store/useLpvizStore";
import { projectCanvasPointToWorldPlane } from "../viewport3dTransition";
import { useViewportRenderSnapshot } from "../viewportRenderStore";

const CONSTRAINT_COLOR = "#ff0000";
const CONSTRAINT_RENDER_ORDER = 7;
const CLIP_MARGIN_PX = 50;
const CLIP_MARGIN_UNITS = 50;
const DEFAULT_3D_EXTENT = 5000;
const EPS = 1e-10;

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ConstraintHighlightLayerState = {
  cacheKey: string;
  completionMode: State["completionMode"];
  highlightIndex: number | null;
  polytope: State["polytope"];
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const serializeConstraintPolytope = (polytope: State["polytope"]) =>
  polytope && hasPolytopeLines(polytope)
    ? [
        polytope.kind,
        polytope.lines.map((line) => line.join(",")).join(";"),
      ].join("|")
    : "";

const selectConstraintHighlightLayerState = (
  state: State,
): ConstraintHighlightLayerState => ({
  cacheKey: [
    state.completionMode,
    state.highlightIndex ?? "",
    serializeConstraintPolytope(state.polytope),
    state.is3DMode ? "1" : "0",
    state.isTransitioning3D ? "1" : "0",
  ].join("|"),
  completionMode: state.completionMode,
  highlightIndex: state.highlightIndex,
  polytope: state.polytope,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

const areConstraintHighlightLayerStatesEqual = (
  current: ConstraintHighlightLayerState,
  next: ConstraintHighlightLayerState,
) => current.cacheKey === next.cacheKey;

function getVisibleBounds(
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
): Bounds {
  if (snapshot.mode === "2d") {
    const halfWidth =
      (snapshot.orthographic.right - snapshot.orthographic.left) / 2;
    const halfHeight =
      (snapshot.orthographic.top - snapshot.orthographic.bottom) / 2;
    const marginUnits =
      CLIP_MARGIN_PX * snapshot.unitsPerPixel + CLIP_MARGIN_UNITS;

    return {
      minX: snapshot.target.x - halfWidth - marginUnits,
      maxX: snapshot.target.x + halfWidth + marginUnits,
      minY: snapshot.target.y - halfHeight - marginUnits,
      maxY: snapshot.target.y + halfHeight + marginUnits,
    };
  }

  const rect = {
    width: Math.max(1, snapshot.width),
    height: Math.max(1, snapshot.height),
  };
  const screenPoints = [
    { x: 0, y: 0 },
    { x: rect.width / 2, y: 0 },
    { x: rect.width, y: 0 },
    { x: 0, y: rect.height / 2 },
    { x: rect.width, y: rect.height / 2 },
    { x: 0, y: rect.height },
    { x: rect.width / 2, y: rect.height },
    { x: rect.width, y: rect.height },
  ];
  const projectedPoints = screenPoints
    .map((point) => projectCanvasPointToWorldPlane(snapshot, rect, point, 0))
    .filter((point): point is PointXY => point !== null);

  if (projectedPoints.length === 0) {
    return {
      minX: -DEFAULT_3D_EXTENT,
      maxX: DEFAULT_3D_EXTENT,
      minY: -DEFAULT_3D_EXTENT,
      maxY: DEFAULT_3D_EXTENT,
    };
  }

  return {
    minX:
      Math.min(...projectedPoints.map((point) => point.x)) - CLIP_MARGIN_UNITS,
    maxX:
      Math.max(...projectedPoints.map((point) => point.x)) + CLIP_MARGIN_UNITS,
    minY:
      Math.min(...projectedPoints.map((point) => point.y)) - CLIP_MARGIN_UNITS,
    maxY:
      Math.max(...projectedPoints.map((point) => point.y)) + CLIP_MARGIN_UNITS,
  };
}

function clipLineToBounds(
  line: Line,
  bounds: Bounds,
): [PointXY, PointXY] | null {
  const [A, B, C] = line;
  if (Math.abs(A) < EPS && Math.abs(B) < EPS) {
    return null;
  }

  if (Math.abs(B) > Math.abs(A)) {
    return [
      { x: bounds.minX, y: (C - A * bounds.minX) / B },
      { x: bounds.maxX, y: (C - A * bounds.maxX) / B },
    ];
  }

  return [
    { y: bounds.minY, x: (C - B * bounds.minY) / A },
    { y: bounds.maxY, x: (C - B * bounds.maxY) / A },
  ];
}

function buildConstraintPositions(
  state: ConstraintHighlightLayerState,
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
) {
  if (
    state.completionMode === "draft" ||
    state.highlightIndex === null ||
    !state.polytope ||
    !hasPolytopeLines(state.polytope) ||
    state.isTransitioning3D ||
    (snapshot.mode === "3d" && !state.is3DMode)
  ) {
    return new Float32Array();
  }

  const line = state.polytope.lines[state.highlightIndex];
  if (!line) {
    return new Float32Array();
  }

  const clipped = clipLineToBounds(line, getVisibleBounds(snapshot));
  if (!clipped) {
    return new Float32Array();
  }

  const [start, end] = clipped;
  return new Float32Array([start.x, start.y, 0, end.x, end.y, 0]);
}

export function ConstraintHighlightLayer() {
  const snapshot = useViewportRenderSnapshot();
  const constraintState = useLpvizSelector(
    selectConstraintHighlightLayerState,
    areConstraintHighlightLayerStatesEqual,
  );
  const positions = useMemo(
    () => buildConstraintPositions(constraintState, snapshot),
    [constraintState, snapshot],
  );

  if (positions.length === 0) {
    return null;
  }

  const is3D = snapshot.mode === "3d";

  return (
    <lineSegments renderOrder={CONSTRAINT_RENDER_ORDER} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={CONSTRAINT_COLOR}
        depthTest={is3D}
        depthWrite={is3D}
      />
    </lineSegments>
  );
}
