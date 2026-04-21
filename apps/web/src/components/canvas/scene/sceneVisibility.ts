import type { ViewportRenderSnapshot } from "@/features/viewport/types";

export function shouldRenderSnapshotMode(
  mode: ViewportRenderSnapshot["mode"],
  state: {
    is3DMode: boolean;
    isTransitioning3D: boolean;
  },
) {
  return mode !== "3d" || state.is3DMode || state.isTransitioning3D;
}
