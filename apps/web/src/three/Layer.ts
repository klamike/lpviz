import type { Object3D } from "three";
import type { SceneContext } from "./SceneContext";

export interface Layer {
  readonly object3D: Object3D;
  update(ctx: SceneContext): void;
  dispose(): void;
}
