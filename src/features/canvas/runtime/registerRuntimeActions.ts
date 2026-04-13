import type { RegisterLpvizRuntimeActions } from "../../../LpvizRuntimeProvider";
import { ViewportManager } from "../../../lib/viewport/ViewportManager";
import { getState, setState, type SolverMode } from "../../../store/lpvizStore";
import type { SolverSettingUpdater } from "../../view/runtime/runtimeTypes";

export function registerCanvasRuntimeActions({
  registerRuntimeActions,
  canvasManager,
  updateSolverSetting,
  resetTraceAndRedrawIfNeeded,
  getSolverRuntime,
  getUiRuntime,
  setCurrentSidebarWidth,
  syncSidebarViewport,
}: {
  registerRuntimeActions: RegisterLpvizRuntimeActions;
  canvasManager: ViewportManager;
  updateSolverSetting: SolverSettingUpdater;
  resetTraceAndRedrawIfNeeded: () => void;
  getSolverRuntime: () => {
    recomputeIfModeActive: (mode: SolverMode) => void;
    setTraceEnabled: (enabled: boolean) => void;
    startReplay: () => void;
    startRotation: () => void;
    stopRotation: () => void;
  };
  getUiRuntime: () => {
    share: () => void;
    zoomToFitCurrentPolytope: () => void;
    resetView: () => void;
    toggle3D: () => void;
    toggleZOffsetOnly: () => void;
    setActiveSolverMode: (mode: SolverMode, solve?: boolean) => void;
  };
  setCurrentSidebarWidth: (width: number) => void;
  syncSidebarViewport: () => void;
}) {
  return registerRuntimeActions({
    setConstraintHighlight(index) {
      if (getState().highlightIndex === index) {
        return;
      }

      setState(
        { highlightIndex: index },
        { viewportDirty: canvasManager.getConstraintDirtyFlags() },
      );
      canvasManager.draw();
    },
    setIterateHighlight(index) {
      if (getState().highlightIteratePathIndex === index) {
        return;
      }

      setState(
        { highlightIteratePathIndex: index },
        { viewportDirty: canvasManager.getIterateDirtyFlags() },
      );
      canvasManager.draw();
    },
    updateSolverSetting,
    recomputeIfModeActive(mode) {
      resetTraceAndRedrawIfNeeded();
      getSolverRuntime().recomputeIfModeActive(mode);
    },
    setTraceEnabled(enabled) {
      getSolverRuntime().setTraceEnabled(enabled);
    },
    startReplay() {
      getSolverRuntime().startReplay();
    },
    startRotation() {
      getSolverRuntime().startRotation();
    },
    stopRotation() {
      getSolverRuntime().stopRotation();
    },
    share() {
      getUiRuntime().share();
    },
    zoomToFit() {
      getUiRuntime().zoomToFitCurrentPolytope();
    },
    resetView() {
      getUiRuntime().resetView();
    },
    toggle3D() {
      getUiRuntime().toggle3D();
    },
    toggleZOffset() {
      getUiRuntime().toggleZOffsetOnly();
    },
    setZScale(value) {
      setState(
        { zScale: value },
        { viewportDirty: canvasManager.getZScaleDirtyFlags() },
      );
      const { is3DMode, isTransitioning3D } = getState();
      if (is3DMode || isTransitioning3D) {
        canvasManager.draw();
      }
    },
    setActiveSolverMode(mode) {
      getUiRuntime().setActiveSolverMode(mode, true);
    },
    setSidebarWidth(width) {
      setCurrentSidebarWidth(width);
      canvasManager.setSidebarWidth(width);
      canvasManager.draw();
    },
    syncViewportLayout(sidebarWidth) {
      setCurrentSidebarWidth(sidebarWidth);
      syncSidebarViewport();
    },
  });
}
