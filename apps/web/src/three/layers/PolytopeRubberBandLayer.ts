import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";
import type { State } from "@/features/core/store";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { applyHugeBounds, getSharedLineMaterial } from "../helpers/sharedLineMaterials";

const POLYTOPE_OUTLINE_COLOR = "#000000";
const EDGE_Z = 0.002;
const POLY_LINE_THICKNESS = 2;

const rbMat = getSharedLineMaterial({ color: POLYTOPE_OUTLINE_COLOR, linewidth: POLY_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 });

function getDisplayedObjectiveZ(x: number, y: number, ov: import("@lpviz/math/types").PointXY | null, zAxisOffsetOnly: boolean) {
  const val = ov ? ov.x * x + ov.y * y : 0;
  return zAxisOffsetOnly ? 0 : val;
}

function getRenderZ(
  x: number, y: number,
  ov: import("@lpviz/math/types").PointXY | null, zScale: number, zAxisOffsetOnly: boolean,
  is3D: boolean, offset: number,
) {
  if (!is3D) return offset;
  return (getDisplayedObjectiveZ(x, y, ov, zAxisOffsetOnly) * zScale) / 100 + offset;
}

type RubberBandState = {
  lastVertex: import("@lpviz/math/types").PointXY | null;
  objectiveVector: import("@lpviz/math/types").PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

function selectRubberBandState(state: State): RubberBandState {
  const isDraft = state.completionMode === "draft";
  const verts = state.vertices;
  const active = isDraft && !state.tourActive && verts.length >= 1;
  return {
    lastVertex: active ? verts[verts.length - 1]! : null,
    objectiveVector: state.objectiveVector,
    zScale: state.zScale,
    zAxisOffsetOnly: state.zAxisOffsetOnly,
    is3DMode: state.is3DMode,
    isTransitioning3D: state.isTransitioning3D,
  };
}

const RUBBER_BAND_BUF = new Float32Array(6);

export class PolytopeRubberBandLayer implements Layer {
  readonly object3D: Line2;
  private geometry: LineGeometry;

  constructor() {
    const geo = new LineGeometry();
    geo.setPositions([0, 0, 0, 0, 0, 0]);
    applyHugeBounds(geo);
    const ln = new Line2(geo, rbMat);
    ln.frustumCulled = false;
    ln.renderOrder = RENDER_ORDER.polyEdges;
    ln.computeLineDistances = () => ln;
    ln.visible = false;
    this.object3D = ln;
    this.geometry = geo;
  }

  update(ctx: SceneContext): void {
    const state = ctx.getState();
    const snap = ctx.getSnapshot();
    const rbState = selectRubberBandState(state);

    if (!rbState.lastVertex || !shouldRenderSnapshotMode(snap.mode, rbState)) {
      this.object3D.visible = false;
      return;
    }
    const mouse = ctx.getCurrentMouse();
    if (!mouse) {
      this.object3D.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const last = rbState.lastVertex;
    RUBBER_BAND_BUF[0] = last.x;
    RUBBER_BAND_BUF[1] = last.y;
    RUBBER_BAND_BUF[2] = getRenderZ(last.x, last.y, rbState.objectiveVector, rbState.zScale, rbState.zAxisOffsetOnly, is3D, EDGE_Z);
    RUBBER_BAND_BUF[3] = mouse.x;
    RUBBER_BAND_BUF[4] = mouse.y;
    RUBBER_BAND_BUF[5] = getRenderZ(mouse.x, mouse.y, rbState.objectiveVector, rbState.zScale, rbState.zAxisOffsetOnly, is3D, EDGE_Z);
    this.geometry.setPositions(RUBBER_BAND_BUF);
    this.object3D.visible = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
