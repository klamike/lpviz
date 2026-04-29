import type { State } from "@/features/core/store";
import type { ViewportRenderSnapshot } from "@/features/viewport/types";
import type { PointXY } from "@lpviz/math/types";

export interface SceneContext {
  readonly scene: import("three").Scene;
  readonly size: { width: number; height: number; dpr: number };
  getSnapshot(): ViewportRenderSnapshot;
  getFullSnapshot(): ViewportRenderSnapshot;
  getState(): State;
  getCurrentMouse(): PointXY | null;
  invalidate(): void;
}
