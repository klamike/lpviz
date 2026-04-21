import { collectZoomFitBounds } from "@/lib/viewBounds";
import { getState, setState } from "@/state";
import type { ViewportApi } from "@/viewport";
import { useRef } from "react";

export function useViewportActions({
  canvasManager,
  initialSidebarWidth,
}: {
  canvasManager: ViewportApi | null;
  initialSidebarWidth: number;
}) {
  const canvasManagerRef = useRef<ViewportApi | null>(canvasManager);
  canvasManagerRef.current = canvasManager;

  const currentSidebarWidthRef = useRef(initialSidebarWidth);

  const getCurrentSidebarWidth = () => currentSidebarWidthRef.current;

  const syncSidebarViewport = () => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    cm.setSidebarWidth(currentSidebarWidthRef.current);
    cm.updateDimensions();
    cm.draw();
  };

  const resetView = () => {
    canvasManagerRef.current?.resetView();
  };

  const zoomToFit = () => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    const state = getState();
    const isOpenUnbounded =
      state.completionMode === "open" && state.polytope?.kind === "unbounded";
    const zoomFit = collectZoomFitBounds(state);
    if (!zoomFit && !isOpenUnbounded) {
      return;
    }
    cm.zoomToFit(
      isOpenUnbounded ? cm.getUnboundedClipBounds() : zoomFit!.bounds,
      50,
      zoomFit?.zBounds,
    );
    cm.setSidebarWidth(currentSidebarWidthRef.current);
  };

  const toggle3D = () => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    const viewState = getState();
    if (viewState.isTransitioning3D) return;
    cm.start3DTransition(!viewState.is3DMode);
  };

  const toggleZOffset = () => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    setState(
      { zAxisOffsetOnly: !getState().zAxisOffsetOnly },
      { viewportDirty: cm.getZScaleDirtyFlags() },
    );
    cm.draw();
  };

  const setZScale = (value: number) => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    setState({ zScale: value }, { viewportDirty: cm.getZScaleDirtyFlags() });
    const { is3DMode, isTransitioning3D } = getState();
    if (is3DMode || isTransitioning3D) {
      cm.draw();
    }
  };

  const setSidebarWidth = (width: number) => {
    const cm = canvasManagerRef.current;
    currentSidebarWidthRef.current = width;
    if (!cm) return;
    cm.setSidebarWidth(width);
    cm.draw();
  };

  const syncViewportLayout = (sidebarWidth: number) => {
    currentSidebarWidthRef.current = sidebarWidth;
    syncSidebarViewport();
  };

  return {
    resetView,
    zoomToFit,
    toggle3D,
    toggleZOffset,
    setZScale,
    setSidebarWidth,
    syncViewportLayout,
    getCurrentSidebarWidth,
    syncSidebarViewport,
  };
}
