import { collectZoomFitBounds } from "@/lib/viewBounds";
import { getState, setState } from "@/state";
import type { ViewportApi } from "@/viewport";
import { useCallback, useMemo, useRef } from "react";

export type ViewportActions = {
  resetView: () => void;
  zoomToFit: () => void;
  toggle3D: () => void;
  toggleZOffset: () => void;
  setZScale: (value: number) => void;
  setSidebarWidth: (width: number) => void;
  syncViewportLayout: (sidebarWidth: number) => void;
  getCurrentSidebarWidth: () => number;
  syncSidebarViewport: () => void;
};

export function useViewportActions({
  canvasManager,
  initialSidebarWidth,
}: {
  canvasManager: ViewportApi | null;
  initialSidebarWidth: number;
}): ViewportActions {
  const canvasManagerRef = useRef<ViewportApi | null>(canvasManager);
  canvasManagerRef.current = canvasManager;

  const currentSidebarWidthRef = useRef(initialSidebarWidth);

  const getCurrentSidebarWidth = useCallback(
    () => currentSidebarWidthRef.current,
    [],
  );

  const syncSidebarViewport = useCallback(() => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    cm.setSidebarWidth(currentSidebarWidthRef.current);
    cm.updateDimensions();
    cm.draw();
  }, []);

  const resetView = useCallback(() => {
    canvasManagerRef.current?.resetView();
  }, []);

  const zoomToFit = useCallback(() => {
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
  }, []);

  const toggle3D = useCallback(() => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    const viewState = getState();
    if (viewState.isTransitioning3D) return;
    cm.start3DTransition(!viewState.is3DMode);
  }, []);

  const toggleZOffset = useCallback(() => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    setState(
      { zAxisOffsetOnly: !getState().zAxisOffsetOnly },
      { viewportDirty: cm.getZScaleDirtyFlags() },
    );
    cm.draw();
  }, []);

  const setZScale = useCallback((value: number) => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    setState({ zScale: value }, { viewportDirty: cm.getZScaleDirtyFlags() });
    const { is3DMode, isTransitioning3D } = getState();
    if (is3DMode || isTransitioning3D) {
      cm.draw();
    }
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    const cm = canvasManagerRef.current;
    currentSidebarWidthRef.current = width;
    if (!cm) return;
    cm.setSidebarWidth(width);
    cm.draw();
  }, []);

  const syncViewportLayout = useCallback(
    (sidebarWidth: number) => {
      currentSidebarWidthRef.current = sidebarWidth;
      syncSidebarViewport();
    },
    [syncSidebarViewport],
  );

  return useMemo(
    () => ({
      resetView,
      zoomToFit,
      toggle3D,
      toggleZOffset,
      setZScale,
      setSidebarWidth,
      syncViewportLayout,
      getCurrentSidebarWidth,
      syncSidebarViewport,
    }),
    [
      resetView,
      zoomToFit,
      toggle3D,
      toggleZOffset,
      setZScale,
      setSidebarWidth,
      syncViewportLayout,
      getCurrentSidebarWidth,
      syncSidebarViewport,
    ],
  );
}
