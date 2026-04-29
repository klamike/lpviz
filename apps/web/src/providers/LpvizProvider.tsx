import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { registerAppActions, type AppActions } from "@/features/core/actions";
import { ViewportBridgeSetterContext } from "@/features/viewport/Bridge";
import { setState } from "@/features/core/store";
import { createViewportRuntime, type ViewportRuntime } from "@/features/viewport/runtime";
import { type ViewportBridge } from "@/features/viewport/types";
import type { GalleryProblem } from "@/features/problem-gallery/problems";

import { useCanvasInteractions } from "@/features/polytope-editor/interactions/useCanvasInteractions";
import { useHistory } from "@/features/history/useHistory";
import { usePolytope } from "@/features/polytope-editor/usePolytope";
import { useShare } from "@/features/share/useShare";
import { useSidebarViewportSync } from "@/hooks/useSidebarViewportSync";
import { useSolver } from "@/features/solver/useSolver";
import { useUrlParamsSync } from "@/features/share/useUrlParamsSync";
import { useViewportActions } from "@/features/viewport/useActions";

export function LpvizProvider({
  sidebarWidth,
  children,
}: PropsWithChildren<{ sidebarWidth: number }>) {
  const [viewportBridge, setViewportBridge] =
    useState<ViewportBridge | null>(null);
  const [canvasManager, setCanvasManager] = useState<ViewportRuntime | null>(
    null,
  );

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

  const polytope = usePolytope({
    handleProblemChange: useCallback(
      () => solverHandleProblemChangeRef.current(),
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
  });

  const setActiveSolverModeWithSolve = useCallback(
    (mode: Parameters<typeof solver.setActiveSolverMode>[0]) => {
      solver.setActiveSolverMode(mode, true);
    },
    [solver],
  );

  const loadGalleryProblem = useCallback(
    (problem: GalleryProblem) => {
      const cm = canvasManagerRef.current;
      history.save();
      solver.invalidatePendingSolveResults();
      solver.stopRotation();
      setState(
        {
          vertices: problem.vertices.map((vertex) => ({ ...vertex })),
          completionMode: "closed",
          interiorPoint: { ...problem.interiorPoint },
          polytope: null,
          inequalitiesMessage: null,
          objectiveVector: { ...problem.objectiveVector },
          currentObjective: null,
          highlightIndex: null,
          highlightIteratePathIndex: null,
          editorInteraction: { kind: "idle" },
          lastCompletedInteraction: "none",
          rotateObjectiveMode: false,
          animationIntervalId: null,
        },
        {
          viewportDirty: {
            grid: true,
            polytope: true,
            constraints: true,
            objective: true,
            trace: true,
            iterate: true,
          },
        },
      );
      polytope.sendRef.current();
      cm?.draw();
      window.requestAnimationFrame(() => viewport.zoomToFit());
    },
    [history, solver, viewport, polytope.sendRef],
  );

  const actions = useMemo<AppActions>(
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
      setZScale: viewport.setZScale,
      setActiveSolverMode: setActiveSolverModeWithSolve,
      setSidebarWidth: viewport.setSidebarWidth,
      syncViewportLayout: viewport.syncViewportLayout,
      loadGalleryProblem,
    }),
    [solver, share, viewport, setActiveSolverModeWithSolve, loadGalleryProblem],
  );

  const bridgeSetter = useCallback((bridge: ViewportBridge | null) => {
    setViewportBridge(bridge);
  }, []);

  registerAppActions(actions);

  return (
    <ViewportBridgeSetterContext.Provider value={bridgeSetter}>
      {children}
    </ViewportBridgeSetterContext.Provider>
  );
}
