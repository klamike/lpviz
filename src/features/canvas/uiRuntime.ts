import JSONCrush from "jsoncrush";

import {
  DEFAULT_VIEW_ANGLE,
  getState,
  mutate,
  setState,
  type SolverMode,
} from "../../store/lpvizStore";
import { ViewportManager } from "../../ViewportManager";
import type { SolverSettingUpdater } from "../shared/runtimeTypes";
import {
  buildSharedStatePatch,
  compactSharedAppState,
  expandSharedAppState,
  type ShareSettings,
  type SharedAppState,
} from "../shared/sharedState";
import { collectZoomFitBounds } from "./viewBounds";

export function createUiRuntime({
  params,
  canvasManager,
  getCurrentSidebarWidth,
  syncSidebarViewport,
  updateSolverSetting,
  collectSolverShareSettings,
  applySolverSharedSettings,
  invalidatePendingSolveResults,
  computePath,
  sendPolytope,
  resetTraceAndRedrawIfNeeded,
  resetOnboarding,
  startDemo,
}: {
  params: URLSearchParams;
  canvasManager: ViewportManager;
  getCurrentSidebarWidth: () => number;
  syncSidebarViewport: () => void;
  updateSolverSetting: SolverSettingUpdater;
  collectSolverShareSettings: (mode: SolverMode) => ShareSettings;
  applySolverSharedSettings: (settings: ShareSettings) => void;
  invalidatePendingSolveResults: () => void;
  computePath: () => Promise<void> | void;
  sendPolytope: () => void;
  resetTraceAndRedrawIfNeeded: () => void;
  resetOnboarding: () => void;
  startDemo: () => Promise<void> | void;
}) {
  const collectShareSettings = (solverMode: SolverMode): ShareSettings => {
    const settings = getState().solverSettings;
    return {
      objectiveAngleStep: settings.objectiveAngleStep,
      objectiveRotationSpeed: settings.objectiveRotationSpeed,
      ...collectSolverShareSettings(solverMode),
    };
  };

  const applySharedSettings = (settings: ShareSettings = {}) => {
    if (settings.objectiveAngleStep !== undefined) {
      updateSolverSetting("objectiveAngleStep", settings.objectiveAngleStep);
    }
    if (settings.objectiveRotationSpeed !== undefined) {
      updateSolverSetting(
        "objectiveRotationSpeed",
        settings.objectiveRotationSpeed,
      );
    }
    applySolverSharedSettings(settings);
  };

  const setActiveSolverMode = (mode: SolverMode, solve = false) => {
    invalidatePendingSolveResults();
    if (getState().rotateObjectiveMode) {
      resetTraceAndRedrawIfNeeded();
    }

    setState({ solverMode: mode });
    if (solve && !getState().rotateObjectiveMode) {
      void computePath();
    }
  };

  const applySharedState = (sharedState: SharedAppState) => {
    invalidatePendingSolveResults();
    mutate((draft) => {
      Object.assign(draft, buildSharedStatePatch(sharedState));
      draft.inequalitiesMessage = null;
      draft.highlightIndex = null;
    });

    applySharedSettings(sharedState.settings);

    const state = getState();
    const regionFinished = state.completionMode !== "draft";
    setActiveSolverMode(state.solverMode);

    if (regionFinished) {
      sendPolytope();
    }

    canvasManager.draw();
  };

  const zoomToFitCurrentPolytope = () => {
    const state = getState();
    const isOpenUnbounded =
      state.completionMode === "open" && state.polytope?.kind === "unbounded";
    const zoomFit = collectZoomFitBounds(state);
    if (!zoomFit && !isOpenUnbounded) {
      return;
    }
    canvasManager.zoomToFit(
      isOpenUnbounded
        ? canvasManager.getUnboundedClipBounds()
        : zoomFit!.bounds,
      50,
      zoomFit?.zBounds,
    );
    canvasManager.setSidebarWidth(getCurrentSidebarWidth());
  };

  const resetView = () => {
    canvasManager.setViewState(1, 0, 0);
    setState({ viewAngle: { ...DEFAULT_VIEW_ANGLE } }, { viewportDirty: {} });
  };

  const toggle3D = () => {
    const viewState = getState();
    if (viewState.isTransitioning3D) {
      return;
    }
    canvasManager.start3DTransition(!viewState.is3DMode);
  };

  const toggleZOffsetOnly = () => {
    setState(
      { zAxisOffsetOnly: !getState().zAxisOffsetOnly },
      { viewportDirty: canvasManager.getZScaleDirtyFlags() },
    );
    canvasManager.draw();
  };

  const buildSharedState = () => {
    const {
      vertices,
      completionMode,
      objectiveVector,
      solverMode,
      zScale,
      zAxisOffsetOnly,
    } = getState();
    return compactSharedAppState({
      vertices,
      completionMode,
      objective: objectiveVector,
      solverMode,
      settings: collectShareSettings(solverMode),
      zScale,
      zAxisOffsetOnly,
    });
  };

  const share = () => {
    const crushed = JSONCrush.crush(JSON.stringify(buildSharedState()));
    window.prompt(
      "Share this link:",
      `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(crushed)}`,
    );
  };

  const handleStartupParams = () => {
    if (params.has("s")) {
      try {
        const crushed = decodeURIComponent(params.get("s") ?? "");
        const jsonString = JSONCrush.uncrush(crushed);
        const data = JSON.parse(jsonString);
        if (data) {
          applySharedState(expandSharedAppState(data) as SharedAppState);
        }
        history.replaceState(null, "", window.location.pathname);
        resetOnboarding();
      } catch (error) {
        console.error("Failed to load shared state", error);
      }
    }

    if (params.has("demo")) {
      void startDemo();
    }
  };

  const initialize = () => {
    syncSidebarViewport();
    handleStartupParams();
  };

  return {
    setActiveSolverMode,
    zoomToFitCurrentPolytope,
    resetView,
    toggle3D,
    toggleZOffsetOnly,
    share,
    initialize,
  };
}
