import { computeFlatZ, type State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { BufferAttribute, DynamicDrawUsage, Points, PointsMaterial } from "three";
import { makePointsGeo } from "../helpers/makePointsGeo";
import { PHASE_COLORS_LINEAR } from "../helpers/phaseColors";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { SHARED_CIRCLE_TEXTURE } from "../helpers/sharedTextures";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const ITERATE_POINT_COLOR = "#800080";
const ITERATE_POINT_PIXEL_SIZE = 8;
const ITERATE_POINTS_RENDER_ORDER = RENDER_ORDER.iteratePoints;

type PrevState = {
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  mode: string;
};

export class IteratePointsLayer implements Layer {
  readonly object3D: Points;
  readonly renderPass = "trace" as const;
  readonly invalidationKeys = ["iterate"] as const;
  private matPlain: PointsMaterial;
  private matColored: PointsMaterial;
  private prev: PrevState | null = null;

  constructor() {
    const shared = {
      size: ITERATE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    };
    this.matPlain = new PointsMaterial({
      ...shared,
      color: ITERATE_POINT_COLOR,
      vertexColors: false,
    });
    this.matColored = new PointsMaterial({
      ...shared,
      color: "#ffffff",
      vertexColors: true,
    });
    const pts = new Points(makePointsGeo(), this.matPlain);
    pts.renderOrder = ITERATE_POINTS_RENDER_ORDER;
    pts.frustumCulled = false;
    pts.visible = false;
    this.object3D = pts;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();
    // raw z is baked into the buffer; zScale and the transition flattening
    // apply through scale.z so neither forces a rebuild (z is ignored by the
    // 2D orthographic projection)
    this.object3D.scale.z = (raw.zScale / 100) * snap.transitionZMultiplier;

    const p = this.prev;
    if (
      p &&
      p.iteratePath === raw.iteratePath &&
      p.iteratePhases === raw.iteratePhases &&
      p.iterateObjectiveVector === raw.iterateObjectiveVector &&
      p.mode === snap.mode
    ) {
      return;
    }
    this.prev = {
      iteratePath: raw.iteratePath,
      iteratePhases: raw.iteratePhases,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      mode: snap.mode,
    };

    if (
      raw.iteratePath.count === 0 ||
      !shouldRenderSnapshotMode(snap.mode, raw)
    ) {
      this.object3D.visible = false;
      return;
    }

    const { points, count, stride } = raw.iteratePath;
    const hasPhases =
      raw.iteratePhases.length === count && raw.iteratePhases.length > 0;

    // grow-only attributes updated in place: rotation replaces the path
    // dozens of times per second, and allocating buffers per step churns
    // the GC and the GL driver (visible as periodic frame spikes)
    const geometry = this.object3D.geometry;
    let posAttr = geometry.getAttribute("position") as
      | BufferAttribute
      | undefined;
    if (!posAttr || posAttr.count < count) {
      posAttr = new BufferAttribute(new Float32Array(count * 3), 3);
      posAttr.setUsage(DynamicDrawUsage);
      geometry.setAttribute("position", posAttr);
    }
    let colorAttr = geometry.getAttribute("color") as
      | BufferAttribute
      | undefined;
    if (hasPhases && (!colorAttr || colorAttr.count < count)) {
      colorAttr = new BufferAttribute(new Float32Array(count * 3), 3);
      colorAttr.setUsage(DynamicDrawUsage);
      geometry.setAttribute("color", colorAttr);
    }
    const positions = posAttr.array as Float32Array;
    const colors = hasPhases ? (colorAttr!.array as Float32Array) : null;

    for (let i = 0; i < count; i++) {
      const base = i * stride;
      positions[i * 3] = points[base]!;
      positions[i * 3 + 1] = points[base + 1]!;
      positions[i * 3 + 2] = computeFlatZ(
        points,
        base,
        stride,
        raw.iterateObjectiveVector,
      );

      if (colors) {
        const phase = raw.iteratePhases[i]!;
        const rgb = PHASE_COLORS_LINEAR[phase % PHASE_COLORS_LINEAR.length]!;
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      }
    }
    posAttr.needsUpdate = true;
    if (hasPhases) {
      colorAttr!.needsUpdate = true;
      this.object3D.material = this.matColored;
    } else {
      if (colorAttr) geometry.deleteAttribute("color");
      this.object3D.material = this.matPlain;
    }
    geometry.setDrawRange(0, count);
    this.object3D.visible = true;
  }

  dispose(): void {
    this.matPlain.dispose();
    this.matColored.dispose();
    this.object3D.geometry.dispose();
  }
}
