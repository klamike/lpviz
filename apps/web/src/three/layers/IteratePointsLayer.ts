import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { writeFlatXYZ } from "../helpers/flatPositions";
import { PHASE_COLORS_LINEAR } from "../helpers/phaseColors";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { SHARED_CIRCLE_TEXTURE } from "../helpers/sharedTextures";
import type { SceneContext } from "../SceneContext";
import { PointCloudLayer } from "./base/PointCloudLayer";

// The solved iterate path as a point cloud, optionally colored by solver phase.
export class IteratePointsLayer extends PointCloudLayer {
  constructor() {
    super({
      color: "#800080",
      pixelSize: 8,
      texture: SHARED_CIRCLE_TEXTURE,
      renderOrder: RENDER_ORDER.iteratePoints,
      renderPass: "trace",
      invalidationKeys: ["iterate"],
      vertexColors: true,
    });
  }

  protected dependencies(ctx: SceneContext): readonly unknown[] {
    const raw = ctx.getState();
    return [
      raw.iteratePath,
      raw.iteratePhases,
      raw.iterateObjectiveVector,
      ctx.getSnapshot().mode,
    ];
  }

  protected rebuild(ctx: SceneContext): void {
    const raw = ctx.getState();
    const { points, count, stride } = raw.iteratePath;
    if (count === 0 || !shouldRenderSnapshotMode(ctx.getSnapshot().mode, raw)) {
      this.hide();
      return;
    }
    const phases = raw.iteratePhases;
    const hasPhases = phases.length === count && phases.length > 0;
    const objVec = raw.iterateObjectiveVector;
    this.draw(
      count,
      (pos) => writeFlatXYZ(pos, points, count, stride, objVec),
      hasPhases
        ? (col) => {
            for (let i = 0; i < count; i++) {
              const rgb =
                PHASE_COLORS_LINEAR[phases[i]! % PHASE_COLORS_LINEAR.length]!;
              col[i * 3] = rgb[0];
              col[i * 3 + 1] = rgb[1];
              col[i * 3 + 2] = rgb[2];
            }
          }
        : null,
    );
  }
}
