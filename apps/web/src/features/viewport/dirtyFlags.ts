import type { ViewportDirtyFlags } from "@/features/core/store";

const VIEWPORT_UNBOUNDED_EXTENT = 5000;

export function isViewport3DState(state: {
  is3DMode: boolean;
  isTransitioning3D: boolean;
}) {
  return state.is3DMode || state.isTransitioning3D;
}

export function getObjectiveViewportDirtyFlags(
  is3DState: boolean,
): ViewportDirtyFlags {
  return is3DState ? { polytope: true, objective: true } : { objective: true };
}

export function getPolytopeViewportDirtyFlags(): ViewportDirtyFlags {
  return { polytope: true, constraints: true, objective: true };
}

export function getTraceViewportDirtyFlags(): ViewportDirtyFlags {
  return { trace: true };
}

export function getIterateViewportDirtyFlags(): ViewportDirtyFlags {
  return { iterate: true };
}

export function getConstraintViewportDirtyFlags(): ViewportDirtyFlags {
  return { constraints: true };
}

export function getDraftPreviewViewportDirtyFlags(): ViewportDirtyFlags {
  return { polytope: true };
}

export function getZScaleViewportDirtyFlags(): ViewportDirtyFlags {
  return { polytope: true, objective: true, trace: true, iterate: true };
}

export function getViewportUnboundedClipBounds(): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  return {
    minX: -VIEWPORT_UNBOUNDED_EXTENT,
    maxX: VIEWPORT_UNBOUNDED_EXTENT,
    minY: -VIEWPORT_UNBOUNDED_EXTENT,
    maxY: VIEWPORT_UNBOUNDED_EXTENT,
  };
}
