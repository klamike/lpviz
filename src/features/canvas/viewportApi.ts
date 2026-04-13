import type { PointXY } from "../../math/blas";
import {
  getState,
  subscribe,
  type ViewportDirtyFlags,
} from "../../store/lpvizStore";
import { ViewportManager } from "../../ViewportManager";
import {
  resetViewportRenderSnapshot,
  setViewportRenderSnapshot,
} from "./r3f/viewportRenderStore";
import type { R3FViewportBridge } from "./r3f/ViewportBridge";

export type ViewportBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type ViewportZBounds = {
  minZ: number;
  maxZ: number;
};

export type ViewportApi = {
  draw: () => void;
  updateDimensions: () => void;
  setSidebarWidth: (width: number) => void;
  setNavigationFrameCallback: (callback: (() => void) | null) => void;
  isDefaultView: () => boolean;
  setViewState: (scale: number, offsetX: number, offsetY: number) => void;
  zoomToFit: (
    bounds: ViewportBounds,
    padding?: number,
    zBounds?: ViewportZBounds,
  ) => void;
  resetView: () => void;
  setControlsBlocked: (blocked: boolean) => void;
  set2DPanEnabled: (enabled: boolean) => void;
  toLogicalCoords: (x: number, y: number) => PointXY;
  toCanvasCoords: (x: number, y: number, z?: number) => PointXY;
  getObjectiveScreenPosition: (point: PointXY) => PointXY;
  getUnboundedClipBounds: () => ViewportBounds;
  start3DTransition: (targetMode: boolean) => void;
  getCanvasElement: () => HTMLCanvasElement;
  getCanvasRect: () => DOMRect;
  getObjectiveDirtyFlags: () => ViewportDirtyFlags;
  getPolytopeDirtyFlags: () => ViewportDirtyFlags;
  getTraceDirtyFlags: () => ViewportDirtyFlags;
  getIterateDirtyFlags: () => ViewportDirtyFlags;
  getConstraintDirtyFlags: () => ViewportDirtyFlags;
  getDraftPreviewDirtyFlags: () => ViewportDirtyFlags;
  getZScaleDirtyFlags: () => ViewportDirtyFlags;
};

export type ViewportRuntime = ViewportApi & {
  destroy: () => void;
};

export async function createViewportRuntime({
  canvas,
  viewportBridge,
}: {
  canvas: HTMLCanvasElement;
  viewportBridge: R3FViewportBridge;
}): Promise<ViewportRuntime> {
  const manager = await ViewportManager.create(
    canvas,
    viewportBridge.getCanvasElement(),
  );

  manager.setRenderSnapshotCallback((snapshot) => {
    setViewportRenderSnapshot(snapshot);
    viewportBridge.invalidate();
  });
  manager.setExternalGridEnabled(true);

  const syncExternal2DLayers = () => {
    const state = getState();
    const external2DLayersEnabled = !state.is3DMode && !state.isTransitioning3D;
    manager.setExternalPolytopeBaseEnabled(external2DLayersEnabled);
    manager.setExternalPolytopeVerticesEnabled(external2DLayersEnabled);
    manager.setExternalObjectiveEnabled(external2DLayersEnabled);
    manager.setExternalTraceLineEnabled(external2DLayersEnabled);
    manager.setExternalConstraintHighlightEnabled(external2DLayersEnabled);
  };
  syncExternal2DLayers();
  const unsubscribeExternal2DLayers = subscribe(() => {
    syncExternal2DLayers();
  });

  // Temporary compatibility bridge while ViewportManager still backs rendering.
  return {
    draw: () => {
      manager.draw();
      viewportBridge.invalidate();
    },
    updateDimensions: () => manager.updateDimensions(),
    setSidebarWidth: (width) => manager.setSidebarWidth(width),
    setNavigationFrameCallback: (callback) =>
      manager.setNavigationFrameCallback(callback),
    isDefaultView: () => manager.isDefaultView(),
    setViewState: (scale, offsetX, offsetY) =>
      manager.setViewState(scale, offsetX, offsetY),
    zoomToFit: (bounds, padding, zBounds) =>
      manager.zoomToFit(bounds, padding, zBounds),
    resetView: () => manager.resetView(),
    setControlsBlocked: (blocked) => manager.setControlsBlocked(blocked),
    set2DPanEnabled: (enabled) => manager.set2DPanEnabled(enabled),
    toLogicalCoords: (x, y) => manager.toLogicalCoords(x, y),
    toCanvasCoords: (x, y, z) => manager.toCanvasCoords(x, y, z),
    getObjectiveScreenPosition: (point) =>
      manager.getObjectiveScreenPosition(point),
    getUnboundedClipBounds: () => manager.getUnboundedClipBounds(),
    start3DTransition: (targetMode) => manager.start3DTransition(targetMode),
    getCanvasElement: () => viewportBridge.getCanvasElement(),
    getCanvasRect: () => viewportBridge.getCanvasRect(),
    getObjectiveDirtyFlags: () => manager.getObjectiveDirtyFlags(),
    getPolytopeDirtyFlags: () => manager.getPolytopeDirtyFlags(),
    getTraceDirtyFlags: () => manager.getTraceDirtyFlags(),
    getIterateDirtyFlags: () => manager.getIterateDirtyFlags(),
    getConstraintDirtyFlags: () => manager.getConstraintDirtyFlags(),
    getDraftPreviewDirtyFlags: () => manager.getDraftPreviewDirtyFlags(),
    getZScaleDirtyFlags: () => manager.getZScaleDirtyFlags(),
    destroy: () => {
      unsubscribeExternal2DLayers();
      manager.setRenderSnapshotCallback(null);
      resetViewportRenderSnapshot();
      manager.destroy();
    },
  };
}
