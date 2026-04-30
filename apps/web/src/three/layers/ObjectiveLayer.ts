import type { State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { isObjectiveDirectionUnbounded } from "@lpviz/polytope/objectiveDirection";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";
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

const OBJECTIVE_COLOR = "#008000";
const OBJECTIVE_UNBOUNDED_COLOR = "#ff0000";
const OBJECTIVE_RENDER_ORDER = RENDER_ORDER.objective;
const OBJECTIVE_LINE_THICKNESS = 3;
const OBJECTIVE_HEAD_LENGTH_PX = 16;
const ARROW_HALF_ANGLE = Math.PI / 6;
const OBJECTIVE_EPSILON = 1e-3;

const getObjectiveMat = (color: string, is3D: boolean) =>
  getSharedLineMaterial({
    color,
    linewidth: OBJECTIVE_LINE_THICKNESS,
    depthTest: is3D,
    depthWrite: is3D,
    opacity: 1,
  });

function buildArrowHeadSegments(
  tip: PointXY,
  angle: number,
  length: number,
): [number, number, number, number][] {
  return [ARROW_HALF_ANGLE, -ARROW_HALF_ANGLE].map((offset) => {
    const a = angle + offset;
    return [
      tip.x,
      tip.y,
      tip.x - length * Math.cos(a),
      tip.y - length * Math.sin(a),
    ] as [number, number, number, number];
  });
}

type PrevState = {
  objectiveHidden: boolean;
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  completionMode: State["completionMode"];
  polytope: State["polytope"];
  isTransitioning3D: boolean;
  mode: string;
  unitsPerPixel: number;
};

export class ObjectiveLayer implements Layer {
  readonly object3D: Group;
  readonly invalidationKeys = ["objective"] as const;
  private objGeo: LineSegmentsGeometry;
  private objSegs: LineSegments2;
  private prev: PrevState | null = null;

  constructor() {
    const objGeo = new LineSegmentsGeometry();
    applyHugeBounds(objGeo);
    const objSegs = new LineSegments2(
      objGeo,
      getObjectiveMat(OBJECTIVE_COLOR, false),
    );
    objSegs.renderOrder = OBJECTIVE_RENDER_ORDER;
    objSegs.frustumCulled = false;
    objSegs.visible = false;
    const group = new Group();
    group.add(objSegs);
    this.object3D = group;
    this.objGeo = objGeo;
    this.objSegs = objSegs;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();

    const p = this.prev;
    if (
      p &&
      p.objectiveHidden === raw.objectiveHidden &&
      p.objectiveVector === raw.objectiveVector &&
      p.currentObjective === raw.currentObjective &&
      p.completionMode === raw.completionMode &&
      p.polytope === raw.polytope &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode &&
      p.unitsPerPixel === snap.unitsPerPixel
    ) {
      return;
    }
    this.prev = {
      objectiveHidden: raw.objectiveHidden,
      objectiveVector: raw.objectiveVector,
      currentObjective: raw.currentObjective,
      completionMode: raw.completionMode,
      polytope: raw.polytope,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
      unitsPerPixel: snap.unitsPerPixel,
    };

    if (raw.objectiveHidden || !shouldRenderSnapshotMode(snap.mode, raw)) {
      this.objSegs.visible = false;
      return;
    }

    const target =
      raw.objectiveVector ||
      (raw.completionMode !== "draft" && raw.currentObjective
        ? raw.currentObjective
        : null);

    if (!target || Math.hypot(target.x, target.y) < OBJECTIVE_EPSILON) {
      this.objSegs.visible = false;
      return;
    }

    const headLength = OBJECTIVE_HEAD_LENGTH_PX * snap.unitsPerPixel;
    const angle = Math.atan2(target.y, target.x);

    const positions: number[] = [0, 0, 0, target.x, target.y, 0];
    for (const [x1, y1, x2, y2] of buildArrowHeadSegments(
      target,
      angle,
      headLength,
    )) {
      positions.push(x1, y1, 0, x2, y2, 0);
    }

    this.objGeo.setPositions(positions);
    delete (this.objGeo as any)._maxInstanceCount;

    const isUnbounded =
      raw.polytope?.kind === "unbounded" &&
      hasPolytopeLines(raw.polytope) &&
      isObjectiveDirectionUnbounded(raw.polytope.lines, [target.x, target.y]);

    this.objSegs.material = getObjectiveMat(
      isUnbounded ? OBJECTIVE_UNBOUNDED_COLOR : OBJECTIVE_COLOR,
      snap.mode === "3d",
    );
    this.objSegs.visible = true;
  }

  dispose(): void {
    this.objGeo.dispose();
  }
}
