import { computeIterateZ, type State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { BufferAttribute, Points, PointsMaterial } from "three";
import { makePointsGeo } from "../helpers/makePointsGeo";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { SHARED_CIRCLE_TEXTURE } from "../helpers/sharedTextures";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const ITERATE_HIGHLIGHT_COLOR = "#008000";
const ITERATE_HIGHLIGHT_PIXEL_SIZE = 8 * 2;
const ITERATE_HIGHLIGHT_RENDER_ORDER = RENDER_ORDER.iterateHighlight;

type PrevState = {
  iteratePath: State["iteratePath"];
  highlightIteratePathIndex: State["highlightIteratePathIndex"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
  transitionZMultiplier: number;
};

export class IterateHighlightLayer implements Layer {
  readonly object3D: Points;
  readonly renderPass = "trace" as const;
  readonly invalidationKeys = ["iterate"] as const;
  private prev: PrevState | null = null;

  constructor() {
    const mat = new PointsMaterial({
      color: ITERATE_HIGHLIGHT_COLOR,
      size: ITERATE_HIGHLIGHT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    });
    const p = new Points(makePointsGeo(), mat);
    p.renderOrder = ITERATE_HIGHLIGHT_RENDER_ORDER;
    p.frustumCulled = false;
    p.visible = false;
    this.object3D = p;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();

    const p = this.prev;
    if (
      p &&
      p.iteratePath === raw.iteratePath &&
      p.highlightIteratePathIndex === raw.highlightIteratePathIndex &&
      p.iterateObjectiveVector === raw.iterateObjectiveVector &&
      p.zScale === raw.zScale &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode &&
      p.transitionZMultiplier === snap.transitionZMultiplier
    ) {
      return;
    }
    this.prev = {
      iteratePath: raw.iteratePath,
      highlightIteratePathIndex: raw.highlightIteratePathIndex,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      zScale: raw.zScale,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
      transitionZMultiplier: snap.transitionZMultiplier,
    };

    const index = raw.highlightIteratePathIndex;
    if (
      index === null ||
      index < 0 ||
      index >= raw.iteratePath.length ||
      !shouldRenderSnapshotMode(snap.mode, raw)
    ) {
      this.object3D.visible = false;
      return;
    }

    const entry = raw.iteratePath[index];
    if (!entry) {
      this.object3D.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const z = is3D
      ? ((computeIterateZ(entry, raw.iterateObjectiveVector) * raw.zScale) /
          100) *
        snap.transitionZMultiplier
      : 0;

    this.object3D.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([entry[0]!, entry[1]!, z]), 3),
    );
    this.object3D.visible = true;
  }

  dispose(): void {
    (this.object3D.material as PointsMaterial).dispose();
    this.object3D.geometry.dispose();
  }
}
