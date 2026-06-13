import type { State } from "@/features/core/store";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { SHARED_STAR_TEXTURE } from "../helpers/sharedTextures";
import { SinglePointSpriteLayer } from "./base/SinglePointSpriteLayer";

// Marks the final iterate of the solved path (the optimum), shown once any
// replay animation has finished playing out.
export class IterateStarLayer extends SinglePointSpriteLayer {
  constructor() {
    super({
      color: "#008000",
      pixelSize: 27,
      texture: SHARED_STAR_TEXTURE,
      renderOrder: RENDER_ORDER.iterateStar,
      renderPass: "overlay",
    });
  }

  protected selectorDeps(raw: State): readonly unknown[] {
    return [raw.originalIteratePath, raw.animationIntervalId];
  }

  protected selectIndex(raw: State): number | null {
    if (raw.iteratePath.count === 0) return null;
    const replayInProgress = raw.animationIntervalId !== null;
    const replayComplete =
      raw.originalIteratePath.count === 0 ||
      raw.iteratePath.count >= raw.originalIteratePath.count;
    if (replayInProgress && !replayComplete) return null;
    return raw.iteratePath.count - 1;
  }
}
