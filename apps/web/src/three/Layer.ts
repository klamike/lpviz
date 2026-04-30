import type { ViewportDirtyFlags } from "@/features/core/store";
import type { Object3D } from "three";
import type { SceneContext } from "./SceneContext";

type LayerInvalidationKey = keyof ViewportDirtyFlags;
export type RenderPassName =
  | "background"
  | "transparent"
  | "foreground"
  | "vertices"
  | "traceLines"
  | "trace"
  | "overlay";

export type LayerRenderObject = {
  readonly object3D: Object3D;
  readonly pass: RenderPassName;
};

export interface Layer {
  readonly object3D: Object3D;
  readonly renderPass?: RenderPassName;
  readonly renderObjects?: readonly LayerRenderObject[];
  readonly invalidationKeys?: readonly LayerInvalidationKey[];
  update(ctx: SceneContext): void;
  dispose(): void;
}
