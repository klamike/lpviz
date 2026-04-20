import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useTourUiController } from "@/providers/TourProvider";
import { getState } from "@/state";
import type { TourActionTarget } from "@/types/tour";
import {
  createViewportRuntime,
  type R3FViewportBridge,
  type ViewportRuntime,
} from "@/viewport";

import { useCanvasInteractions } from "@/hooks/interactions/useCanvasInteractions";
import { useHistory } from "@/hooks/useHistory";
import { usePolytope } from "@/hooks/usePolytope";
import { useShare } from "@/hooks/useShare";
import { useSidebarViewportSync } from "@/hooks/useSidebarViewportSync";
import { useSolver } from "@/hooks/useSolver";
import { useTour } from "@/hooks/useTour";
import { useUrlParamsSync } from "@/hooks/useUrlParamsSync";
import { useViewportActions } from "@/hooks/useViewportActions";

import { LpvizActionsContext, type LpvizActions } from "./LpvizActionsContext";
import { ViewportBridgeSetterContext } from "./ViewportBridgeContext";

export function LpvizController({
  sidebarWidth,
  children,
}: PropsWithChildren<{ sidebarWidth: number }>) {
  const [viewportBridge, setViewportBridge] =
    useState<R3FViewportBridge | null>(null);
  const [canvasManager, setCanvasManager] = useState<ViewportRuntime | null>(
    null,
  );
  const tourUi = useTourUiController();

  useEffect(() => {
    if (!viewportBridge) return;
    viewportBridge.getCanvasElement().focus();

    let disposed = false;
    let manager: ViewportRuntime | null = null;
    void createViewportRuntime({ viewportBridge })
      .then((cm) => {
        if (disposed) {
          cm.destroy();
          return;
        }
        manager = cm;
        setCanvasManager(cm);
      })
      .catch((error) => {
        console.error("Failed to initialize viewport", error);
      });

    return () => {
      disposed = true;
      setCanvasManager(null);
      manager?.destroy();
    };
  }, [viewportBridge]);

  const solverHandleProblemChangeRef = useRef<() => void>(() => {});
  const scheduleNonconvexHintRef = useRef<() => void>(() => {});
  const runActionRef = useRef<(target: TourActionTarget) => void>(() => {});

  const polytope = usePolytope({
    handleProblemChange: useCallback(
      () => solverHandleProblemChangeRef.current(),
      [],
    ),
    scheduleNonconvexHint: useCallback(
      () => scheduleNonconvexHintRef.current(),
      [],
    ),
  });

  const canvasManagerRef = useRef<ViewportRuntime | null>(canvasManager);
  canvasManagerRef.current = canvasManager;

  const polytopeSendRef = polytope.sendRef;

  const history = useHistory({
    onRestore: useCallback(() => {
      canvasManagerRef.current?.draw();
      polytopeSendRef.current();
    }, [polytopeSendRef]),
  });

  const solver = useSolver({ canvasManager });
  solverHandleProblemChangeRef.current = solver.handleProblemChange;

  const viewport = useViewportActions({
    canvasManager,
    initialSidebarWidth: sidebarWidth,
  });

  const share = useShare({ solverControls: solver.solverControls });

  const tour = useTour({
    canvasManager,
    ui: tourUi,
    saveHistory: history.save,
    sendPolytope: polytope.send,
    runAction: useCallback(
      (target: TourActionTarget) => runActionRef.current(target),
      [],
    ),
  });
  scheduleNonconvexHintRef.current = tour.scheduleNonconvexHint;

  runActionRef.current = (target) => {
    if (target === "activate-ipm") {
      solver.setActiveSolverMode("ipm", true);
      return;
    }
    if (target === "activate-central") {
      solver.setActiveSolverMode("central", true);
      return;
    }
    if (target === "toggle-3d") {
      viewport.toggle3D();
      return;
    }
    if (target === "start-rotation") {
      solver.startRotation();
      return;
    }
    solver.setTraceEnabled(!getState().traceEnabled);
  };

  useCanvasInteractions({
    canvasManager,
    saveHistory: history.save,
    sendPolytope: polytope.send,
    handleUndoRedo: history.handleUndoRedo,
  });

  useSidebarViewportSync({
    canvasManager,
    sidebarWidth,
    syncViewportLayout: viewport.syncViewportLayout,
  });

  useUrlParamsSync({
    canvasManager,
    solverControls: solver.solverControls,
    updateSolverSetting: solver.updateSolverSetting,
    invalidatePendingSolveResults: solver.invalidatePendingSolveResults,
    setActiveSolverMode: solver.setActiveSolverMode,
    sendPolytope: polytope.send,
    resetTour: tour.reset,
    startDemo: tour.start,
  });

  const setActiveSolverModeWithSolve = useCallback(
    (mode: Parameters<typeof solver.setActiveSolverMode>[0]) => {
      solver.setActiveSolverMode(mode, true);
    },
    [solver],
  );

  const actions = useMemo<LpvizActions>(
    () => ({
      setConstraintHighlight: solver.setConstraintHighlight,
      setIterateHighlight: solver.setIterateHighlight,
      updateSolverSetting: solver.updateSolverSetting,
      recomputeIfModeActive: solver.recomputeIfModeActive,
      setTraceEnabled: solver.setTraceEnabled,
      startReplay: solver.startReplay,
      startRotation: solver.startRotation,
      stopRotation: solver.stopRotation,
      share: share.share,
      zoomToFit: viewport.zoomToFit,
      resetView: viewport.resetView,
      toggle3D: viewport.toggle3D,
      toggleZOffset: viewport.toggleZOffset,
      setZScale: viewport.setZScale,
      setActiveSolverMode: setActiveSolverModeWithSolve,
      setSidebarWidth: viewport.setSidebarWidth,
      syncViewportLayout: viewport.syncViewportLayout,
    }),
    [solver, share, viewport, setActiveSolverModeWithSolve],
  );

  const bridgeSetter = useCallback((bridge: R3FViewportBridge | null) => {
    setViewportBridge(bridge);
  }, []);

  return (
    <ViewportBridgeSetterContext.Provider value={bridgeSetter}>
      <LpvizActionsContext.Provider value={actions}>
        {children}
      </LpvizActionsContext.Provider>
    </ViewportBridgeSetterContext.Provider>
  );
}
