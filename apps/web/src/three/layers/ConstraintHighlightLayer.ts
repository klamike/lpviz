import type { State } from "@/features/core/store";
import { type BoundingBox } from "@lpviz/math/geometry";
import type { Line, PointXY } from "@lpviz/math/types";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";
import { projectCanvasPointToWorldPlane } from "@lpviz/viewport/transition";
import { Group } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import {
  applyHugeBounds,
  getSharedLineMaterial,
} from "../helpers/sharedLineMaterials";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const CONSTRAINT_COLOR = "#ff0000";
const CONSTRAINT_RENDER_ORDER = RENDER_ORDER.constraintLines;
const CONSTRAINT_LINE_THICKNESS = 2;
const CLIP_MARGIN_PX = 50;
const CLIP_MARGIN_UNITS = 50;
const DEFAULT_3D_EXTENT = 5000;
const EPS = 1e-10;

const getConstraintMat = (is3D: boolean) =>
  getSharedLineMaterial({
    color: CONSTRAINT_COLOR,
    linewidth: CONSTRAINT_LINE_THICKNESS,
    depthTest: is3D,
    depthWrite: is3D,
    opacity: 1,
  });

function getVisibleBounds(
  snap: ReturnType<SceneContext["getSnapshot"]>,
): BoundingBox {
  if (snap.mode === "2d") {
    const halfWidth = (snap.orthographic.right - snap.orthographic.left) / 2;
    const halfHeight = (snap.orthographic.top - snap.orthographic.bottom) / 2;
    const marginUnits = CLIP_MARGIN_PX * snap.unitsPerPixel + CLIP_MARGIN_UNITS;
    return {
      minX: snap.target.x - halfWidth - marginUnits,
      maxX: snap.target.x + halfWidth + marginUnits,
      minY: snap.target.y - halfHeight - marginUnits,
      maxY: snap.target.y + halfHeight + marginUnits,
    };
  }
  const rect = {
    width: Math.max(1, snap.width),
    height: Math.max(1, snap.height),
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
  const pts = screenPoints
    .map((p) => projectCanvasPointToWorldPlane(snap, rect, p, 0))
    .filter((p): p is PointXY => p !== null);
  if (pts.length === 0) {
    return {
      minX: -DEFAULT_3D_EXTENT,
      maxX: DEFAULT_3D_EXTENT,
      minY: -DEFAULT_3D_EXTENT,
      maxY: DEFAULT_3D_EXTENT,
    };
  }
  return {
    minX: Math.min(...pts.map((p) => p.x)) - CLIP_MARGIN_UNITS,
    maxX: Math.max(...pts.map((p) => p.x)) + CLIP_MARGIN_UNITS,
    minY: Math.min(...pts.map((p) => p.y)) - CLIP_MARGIN_UNITS,
    maxY: Math.max(...pts.map((p) => p.y)) + CLIP_MARGIN_UNITS,
  };
}

function clipLineToBounds(
  line: Line,
  b: BoundingBox,
): [PointXY, PointXY] | null {
  const [A, B, C] = line;
  if (Math.abs(A) < EPS && Math.abs(B) < EPS) return null;
  if (Math.abs(B) > Math.abs(A)) {
    return [
      { x: b.minX, y: (C - A * b.minX) / B },
      { x: b.maxX, y: (C - A * b.maxX) / B },
    ];
  }
  return [
    { y: b.minY, x: (C - B * b.minY) / A },
    { y: b.maxY, x: (C - B * b.maxY) / A },
  ];
}

type PrevState = {
  completionMode: State["completionMode"];
  highlightIndex: number | null;
  polytope: State["polytope"];
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
  orthoLeft: number;
  orthoRight: number;
  orthoTop: number;
  orthoBottom: number;
  targetX: number;
  targetY: number;
  unitsPerPixel: number;
  width: number;
  height: number;
  scaleFactor: number;
};

export class ConstraintHighlightLayer implements Layer {
  readonly object3D: Group;
  readonly invalidationKeys = ["constraints"] as const;
  private cGeo: LineSegmentsGeometry;
  private cSegs: LineSegments2;
  private prev: PrevState | null = null;

  constructor() {
    const cGeo = new LineSegmentsGeometry();
    applyHugeBounds(cGeo);
    const cSegs = new LineSegments2(cGeo, getConstraintMat(false));
    cSegs.renderOrder = CONSTRAINT_RENDER_ORDER;
    cSegs.frustumCulled = false;
    cSegs.visible = false;
    const group = new Group();
    group.add(cSegs);
    this.object3D = group;
    this.cGeo = cGeo;
    this.cSegs = cSegs;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();

    const p = this.prev;
    if (
      p &&
      p.completionMode === raw.completionMode &&
      p.highlightIndex === raw.highlightIndex &&
      p.polytope === raw.polytope &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode &&
      p.orthoLeft === snap.orthographic.left &&
      p.orthoRight === snap.orthographic.right &&
      p.orthoTop === snap.orthographic.top &&
      p.orthoBottom === snap.orthographic.bottom &&
      p.targetX === snap.target.x &&
      p.targetY === snap.target.y &&
      p.unitsPerPixel === snap.unitsPerPixel &&
      p.width === snap.width &&
      p.height === snap.height &&
      p.scaleFactor === snap.scaleFactor
    ) {
      return;
    }
    this.prev = {
      completionMode: raw.completionMode,
      highlightIndex: raw.highlightIndex,
      polytope: raw.polytope,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
      orthoLeft: snap.orthographic.left,
      orthoRight: snap.orthographic.right,
      orthoTop: snap.orthographic.top,
      orthoBottom: snap.orthographic.bottom,
      targetX: snap.target.x,
      targetY: snap.target.y,
      unitsPerPixel: snap.unitsPerPixel,
      width: snap.width,
      height: snap.height,
      scaleFactor: snap.scaleFactor,
    };

    if (
      raw.completionMode === "draft" ||
      raw.highlightIndex === null ||
      !raw.polytope ||
      !hasPolytopeLines(raw.polytope) ||
      !shouldRenderSnapshotMode(snap.mode, raw)
    ) {
      this.cSegs.visible = false;
      return;
    }

    const line = raw.polytope.lines[raw.highlightIndex];
    if (!line) {
      this.cSegs.visible = false;
      return;
    }

    const clipped = clipLineToBounds(line, getVisibleBounds(snap));
    if (!clipped) {
      this.cSegs.visible = false;
      return;
    }

    const [start, end] = clipped;
    this.cGeo.setPositions([start.x, start.y, 0, end.x, end.y, 0]);
    delete (this.cGeo as any)._maxInstanceCount;

    this.cSegs.material = getConstraintMat(snap.mode === "3d");
    this.cSegs.visible = true;
  }

  dispose(): void {
    this.cGeo.dispose();
  }
}
