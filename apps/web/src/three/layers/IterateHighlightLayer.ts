import type { State } from "@/features/core/store";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { SHARED_CIRCLE_TEXTURE } from "../helpers/sharedTextures";
import { SinglePointSpriteLayer } from "./base/SinglePointSpriteLayer";

// Highlights the iterate the user is hovering in the solver log.
export class IterateHighlightLayer extends SinglePointSpriteLayer {
  constructor() {
    super({
      color: "#008000",
      pixelSize: 8 * 2,
      texture: SHARED_CIRCLE_TEXTURE,
      renderOrder: RENDER_ORDER.iterateHighlight,
      renderPass: "trace",
    });
  }

  protected selectorDeps(raw: State): readonly unknown[] {
    return [raw.highlightIteratePathIndex];
  }

  protected selectIndex(raw: State): number | null {
    return raw.highlightIteratePathIndex;
  }
}
