import { computeIterateZ, type State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { BufferAttribute, Points, PointsMaterial } from "three";
import { makePointsGeo } from "../helpers/makePointsGeo";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { SHARED_STAR_TEXTURE } from "../helpers/sharedTextures";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const ITERATE_STAR_COLOR = "#008000";
const ITERATE_STAR_PIXEL_SIZE = 27;
const ITERATE_STAR_RENDER_ORDER = RENDER_ORDER.iterateStar;

type PrevState = {
  iteratePath: State["iteratePath"];
  originalIteratePath: State["originalIteratePath"];
  animationIntervalId: State["animationIntervalId"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
  transitionZMultiplier: number;
};

export class IterateStarLayer implements Layer {
  readonly object3D: Points;
  readonly renderPass = "overlay" as const;
  readonly invalidationKeys = ["iterate"] as const;
  private prev: PrevState | null = null;

  constructor() {
    const mat = new PointsMaterial({
      color: ITERATE_STAR_COLOR,
      size: ITERATE_STAR_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_STAR_TEXTURE,
      alphaTest: 0.2,
    });
    const p = new Points(makePointsGeo(), mat);
    p.renderOrder = ITERATE_STAR_RENDER_ORDER;
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
      p.originalIteratePath === raw.originalIteratePath &&
      p.animationIntervalId === raw.animationIntervalId &&
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
      originalIteratePath: raw.originalIteratePath,
      animationIntervalId: raw.animationIntervalId,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      zScale: raw.zScale,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
      transitionZMultiplier: snap.transitionZMultiplier,
    };

    const replayInProgress = raw.animationIntervalId !== null;
    const replayComplete =
      raw.originalIteratePath.length === 0 ||
      raw.iteratePath.length >= raw.originalIteratePath.length;
    if (replayInProgress && !replayComplete) {
      this.object3D.visible = false;
      return;
    }

    const entry = raw.iteratePath[raw.iteratePath.length - 1];
    if (!entry || !shouldRenderSnapshotMode(snap.mode, raw)) {
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
