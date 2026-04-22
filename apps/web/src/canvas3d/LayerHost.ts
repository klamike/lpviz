import type { Layer } from "./Layer";
import type { SceneContext } from "./SceneContext";

export class LayerHost {
  private layers: Layer[] = [];

  add(layer: Layer): void {
    this.layers.push(layer);
  }

  remove(layer: Layer): void {
    const index = this.layers.indexOf(layer);
    if (index !== -1) {
      this.layers.splice(index, 1);
    }
  }

  update(ctx: SceneContext): void {
    for (const layer of this.layers) {
      layer.update(ctx);
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.dispose();
    }
    this.layers = [];
  }
}
