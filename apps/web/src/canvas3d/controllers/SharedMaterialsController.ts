import { tickSharedLineMaterialResolutions } from "../helpers/sharedLineMaterials";
import type { SceneManager } from "../SceneManager";

export class SharedMaterialsController {
  private lastW = 0;
  private lastH = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(sceneManager: SceneManager) {
    this.unsubscribe = sceneManager.sizeSignal.subscribe((size) => {
      this.tick(size.width, size.height);
    });
    const size = sceneManager.sizeSignal.get();
    this.tick(size.width, size.height);
  }

  tick(w: number, h: number): void {
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;
    tickSharedLineMaterialResolutions(w, h);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
