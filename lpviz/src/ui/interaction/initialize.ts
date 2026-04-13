import type { RegisterLpvizRuntimeActions } from "../../app/lpvizRuntime";
import { getState, mutate, resetTraceState, setState, subscribe } from "../../state/store";
import type { SolverMode } from "../../state/store";
import { ViewportManager } from "../viewport";
import { registerCanvasInteractions } from "./canvas";
import { computeEditorRegionForState } from "./editorSession";
import { createHistoryRuntime } from "./historyRuntime";
import { createOnboardingRuntime } from "./onboardingRuntime";
import { createResultRuntime } from "./resultRuntime";
import { createSolverControls } from "./solverControls";
import { createSolverRuntime } from "./solverRuntime";
import { createUiRuntime } from "./uiRuntime";

export type CanvasRuntimeElements = {
  canvas: HTMLCanvasElement;
};

export type CanvasRuntimeCleanup = () => void;

export async function initializeCanvasRuntime(
  runtimeElements: CanvasRuntimeElements,
  params: URLSearchParams,
  layout: {
    initialSidebarWidth: number;
  },
  runtime: {
    registerRuntimeActions: RegisterLpvizRuntimeActions;
  },
): Promise<CanvasRuntimeCleanup> {
  const { canvas } = runtimeElements;
  const cleanupHandlers: Array<() => void> = [];
  const registerCleanup = (cleanup: () => void) => {
    cleanupHandlers.push(cleanup);
  };

  const canvasManager = await ViewportManager.create(canvas);
  let currentSidebarWidth = layout.initialSidebarWidth;
  const updateSolverSetting = <K extends keyof import("../../state/store").SolverSettings>(
    key: K,
    value: import("../../state/store").SolverSettings[K],
  ) => {
    mutate((draft) => {
      draft.solverSettings[key] = value;
    });
  };
  const syncSidebarViewport = () => {
    canvasManager.setSidebarWidth(currentSidebarWidth);
    canvasManager.updateDimensions();
    canvasManager.draw();
  };
  const resetTraceAndRedrawIfNeeded = () => {
    if (!getState().traceEnabled) {
      return;
    }
    resetTraceState();
    canvasManager.draw();
  };

  const resultRuntime = createResultRuntime({
    canvasManager,
  });
  let wasNavigatingViewport = getState().isNavigatingViewport;
  const unsubscribeViewportNavigation = subscribe((snapshot) => {
    if (wasNavigatingViewport && !snapshot.isNavigatingViewport) {
      resultRuntime.flushDeferredRender();
    }
    wasNavigatingViewport = snapshot.isNavigatingViewport;
  });
  registerCleanup(unsubscribeViewportNavigation);
  registerCleanup(() => {
    resultRuntime.teardown();
  });

  let solverRuntime: ReturnType<typeof createSolverRuntime> | null = null;
  const getSolverRuntime = () => {
    if (!solverRuntime) {
      throw new Error("Solver runtime is not ready");
    }
    return solverRuntime;
  };

  const solverControls = createSolverControls({
    updateSolverSetting,
    hasUnboundedObjectiveDirection: (state) => getSolverRuntime().hasUnboundedObjectiveDirection(state),
  });
  const getSolverControl = (mode: SolverMode) => solverControls.find((solverControl) => solverControl.mode === mode) ?? null;

  let onboardingRuntime: ReturnType<typeof createOnboardingRuntime> | null = null;
  const getOnboardingRuntime = () => {
    if (!onboardingRuntime) {
      throw new Error("Onboarding runtime is not ready");
    }
    return onboardingRuntime;
  };

  const polytopeRuntime = {
    send() {
      const state = getState();

      try {
        const regionResult = computeEditorRegionForState(state);

        if (regionResult.status === "nonconvex") {
          mutate((draft) => {
            draft.polytope = null;
            draft.inequalitiesMessage = "Nonconvex";
            draft.highlightIndex = null;
          });
          getSolverRuntime().handleProblemChange();
          getOnboardingRuntime().scheduleNonconvexHint();
          return;
        }

        if (regionResult.promotion) {
          mutate((draft) => {
            draft.vertices = regionResult.promotion!.vertices;
            draft.completionMode = regionResult.promotion!.completionMode;
            draft.interiorPoint = regionResult.promotion!.interiorPoint;
          });
        }

        const result = regionResult.polytope;
        if (!result.inequalities) {
          mutate((draft) => {
            draft.polytope = null;
            draft.inequalitiesMessage = "No inequalities returned.";
            draft.highlightIndex = null;
          });
          getSolverRuntime().handleProblemChange();
          return;
        }

        mutate((draft) => {
          draft.polytope = result;
          draft.inequalitiesMessage = null;
          if (draft.highlightIndex !== null && draft.highlightIndex >= result.inequalities.length) {
            draft.highlightIndex = null;
          }
        });
        getOnboardingRuntime().scheduleNonconvexHint();
        getSolverRuntime().handleProblemChange();
      } catch (error) {
        console.error("Error:", error);
        mutate((draft) => {
          draft.polytope = null;
          draft.inequalitiesMessage = "Error computing inequalities.";
          draft.highlightIndex = null;
        });
        getSolverRuntime().handleProblemChange();
        getOnboardingRuntime().scheduleNonconvexHint();
      }
    },
  };

  const historyRuntime = createHistoryRuntime({
    onRestore() {
      canvasManager.draw();
      polytopeRuntime.send();
    },
  });

  onboardingRuntime = createOnboardingRuntime({
    canvasManager,
    saveHistory: historyRuntime.save,
    sendPolytope: polytopeRuntime.send.bind(polytopeRuntime),
    getButtonTarget(id) {
      return document.getElementById(id);
    },
  });

  const uiRuntime = createUiRuntime({
    params,
    canvasManager,
    getCurrentSidebarWidth: () => currentSidebarWidth,
    syncSidebarViewport,
    updateSolverSetting,
    collectSolverShareSettings: (mode) => getSolverControl(mode)?.collectShareSettings() ?? {},
    applySolverSharedSettings(settings) {
      solverControls.forEach((solverControl) => solverControl.applySharedSettings(settings));
    },
    invalidatePendingSolveResults: () => getSolverRuntime().invalidatePendingSolveResults(),
    computePath: () => getSolverRuntime().computePath(),
    sendPolytope: polytopeRuntime.send.bind(polytopeRuntime),
    resetTraceAndRedrawIfNeeded,
    resetOnboarding: onboardingRuntime.reset,
    startDemo: onboardingRuntime.start,
  });

  registerCleanup(runtime.registerRuntimeActions({
    setConstraintHighlight(index) {
      if (getState().highlightIndex === index) {
        return;
      }

      setState({ highlightIndex: index }, { viewportDirty: canvasManager.getConstraintDirtyFlags() });
      canvasManager.draw();
    },
    setIterateHighlight(index) {
      if (getState().highlightIteratePathIndex === index) {
        return;
      }

      setState({ highlightIteratePathIndex: index }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
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
      uiRuntime.share();
    },
    zoomToFit() {
      uiRuntime.zoomToFitCurrentPolytope();
    },
    resetView() {
      uiRuntime.resetView();
    },
    toggle3D() {
      uiRuntime.toggle3D();
    },
    toggleZOffset() {
      uiRuntime.toggleZOffsetOnly();
    },
    setZScale(value) {
      setState({ zScale: value }, { viewportDirty: canvasManager.getZScaleDirtyFlags() });
      const { is3DMode, isTransitioning3D } = getState();
      if (is3DMode || isTransitioning3D) {
        canvasManager.draw();
      }
    },
    setActiveSolverMode(mode) {
      uiRuntime.setActiveSolverMode(mode, true);
    },
    setSidebarWidth(width) {
      currentSidebarWidth = width;
      canvasManager.setSidebarWidth(width);
      canvasManager.draw();
    },
    syncViewportLayout(sidebarWidth) {
      currentSidebarWidth = sidebarWidth;
      syncSidebarViewport();
    },
  }));

  solverRuntime = createSolverRuntime({
    canvasManager,
    getSolverControl,
    resultRuntime,
  });

  const { teardown: teardownCanvasInteractions } = registerCanvasInteractions(
    canvasManager,
    historyRuntime.save,
    polytopeRuntime.send.bind(polytopeRuntime),
    historyRuntime.handleUndoRedo,
  );
  registerCleanup(() => {
    teardownCanvasInteractions();
  });

  onboardingRuntime.initialize();
  uiRuntime.initialize();

  return () => {
    onboardingRuntime.teardown();
    getSolverRuntime().stopActiveMotion();

    while (cleanupHandlers.length > 0) {
      cleanupHandlers.pop()?.();
    }
    canvasManager.destroy();
  };
}
