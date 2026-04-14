import type { SolverMode } from "@lpviz/state";
import { getState, mutate, resetTraceState, subscribe } from "@lpviz/state";
import type { R3FViewportBridge } from "@lpviz/viewport";
import { createViewportRuntime } from "@lpviz/viewport";
import { registerCanvasInteractions } from "../editor/canvasInteractions";
import { createHistoryRuntime } from "../editor/historyRuntime";
import { createPolytopeRuntime } from "../editor/polytopeRuntime";
import { createOnboardingRuntime } from "../onboarding/onboardingRuntime";
import type { SolverSettingUpdater } from "../shared/runtimeTypes";
import { createResultRuntime } from "../solver/resultRuntime";
import { createSolverControls } from "../solver/solverControls";
import { createSolverRuntime } from "../solver/solverRuntime";
import type {
  OnboardingUiController,
  RegisterLpvizRuntimeActions,
} from "../uiContracts";
import { registerCanvasRuntimeActions } from "./registerRuntimeActions";
import { createUiRuntime } from "./uiRuntime";

export type CanvasRuntimeElements = {
  viewportBridge: R3FViewportBridge;
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
    onboardingUi: OnboardingUiController;
  },
): Promise<CanvasRuntimeCleanup> {
  const { viewportBridge } = runtimeElements;
  const cleanupHandlers: Array<() => void> = [];
  const registerCleanup = (cleanup: () => void) => {
    cleanupHandlers.push(cleanup);
  };

  const canvasManager = await createViewportRuntime({
    viewportBridge,
  });
  let currentSidebarWidth = layout.initialSidebarWidth;
  const updateSolverSetting: SolverSettingUpdater = (key, value) => {
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

  const resultRuntime = createResultRuntime({ canvasManager });
  let wasNavigatingViewport = getState().isNavigatingViewport;
  registerCleanup(
    subscribe((snapshot) => {
      if (wasNavigatingViewport && !snapshot.isNavigatingViewport) {
        resultRuntime.flushDeferredRender();
      }
      wasNavigatingViewport = snapshot.isNavigatingViewport;
    }),
  );
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

  let onboardingRuntime: ReturnType<typeof createOnboardingRuntime> | null =
    null;
  const getOnboardingRuntime = () => {
    if (!onboardingRuntime) {
      throw new Error("Onboarding runtime is not ready");
    }
    return onboardingRuntime;
  };

  let uiRuntime: ReturnType<typeof createUiRuntime> | null = null;
  const getUiRuntime = () => {
    if (!uiRuntime) {
      throw new Error("UI runtime is not ready");
    }
    return uiRuntime;
  };

  const solverControls = createSolverControls({
    updateSolverSetting,
    hasUnboundedObjectiveDirection: (state) =>
      getSolverRuntime().hasUnboundedObjectiveDirection(state),
  });
  const getSolverControl = (mode: SolverMode) =>
    solverControls.find((solverControl) => solverControl.mode === mode);

  const polytopeRuntime = createPolytopeRuntime({
    handleProblemChange: () => getSolverRuntime().handleProblemChange(),
    scheduleNonconvexHint: () => getOnboardingRuntime().scheduleNonconvexHint(),
  });

  const historyRuntime = createHistoryRuntime({
    onRestore() {
      canvasManager.draw();
      polytopeRuntime.send();
    },
  });

  onboardingRuntime = createOnboardingRuntime({
    canvasManager,
    ui: runtime.onboardingUi,
    saveHistory: historyRuntime.save,
    sendPolytope: polytopeRuntime.send,
    runAction(action) {
      if (action === "activate-ipm") {
        getUiRuntime().setActiveSolverMode("ipm", true);
        return;
      }
      if (action === "activate-central") {
        getUiRuntime().setActiveSolverMode("central", true);
        return;
      }
      if (action === "toggle-3d") {
        getUiRuntime().toggle3D();
        return;
      }
      if (action === "start-rotation") {
        getSolverRuntime().startRotation();
        return;
      }
      getSolverRuntime().setTraceEnabled(!getState().traceEnabled);
    },
  });

  uiRuntime = createUiRuntime({
    params,
    canvasManager,
    getCurrentSidebarWidth: () => currentSidebarWidth,
    syncSidebarViewport,
    updateSolverSetting,
    collectSolverShareSettings: (mode) =>
      getSolverControl(mode)?.collectShareSettings() ?? {},
    applySolverSharedSettings(settings) {
      solverControls.forEach((solverControl) =>
        solverControl.applySharedSettings(settings),
      );
    },
    invalidatePendingSolveResults: () =>
      getSolverRuntime().invalidatePendingSolveResults(),
    computePath: () => getSolverRuntime().computePath(),
    sendPolytope: polytopeRuntime.send,
    resetTraceAndRedrawIfNeeded,
    resetOnboarding: onboardingRuntime.reset,
    startDemo: onboardingRuntime.start,
  });

  solverRuntime = createSolverRuntime({
    canvasManager,
    getSolverControl,
    resultRuntime,
  });

  registerCleanup(
    registerCanvasRuntimeActions({
      registerRuntimeActions: runtime.registerRuntimeActions,
      canvasManager,
      updateSolverSetting,
      resetTraceAndRedrawIfNeeded,
      getSolverRuntime,
      getUiRuntime,
      setCurrentSidebarWidth(width) {
        currentSidebarWidth = width;
      },
      syncSidebarViewport,
    }),
  );

  const { teardown: teardownCanvasInteractions } = registerCanvasInteractions(
    canvasManager,
    historyRuntime.save,
    polytopeRuntime.send,
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
