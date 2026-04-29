import type { AppContext } from "@/app/appContext";
import type { AppActions } from "@/features/core/actions";
import { setState } from "@/features/core/store";
import { createHistoryService } from "@/features/history/historyService";
import { createPolytopeService } from "@/features/polytope-editor/polytopeService";
import type { GalleryProblem } from "@/features/problem-gallery/problems";
import { createShareService } from "@/features/share/shareService";
import { applyUrlParamsOnce } from "@/features/share/urlParamsSync";
import { createSolverActions } from "@/features/solver/solverActions";
import type { ViewportRuntime } from "@/features/viewport/runtime";
import { createViewportActions } from "@/features/viewport/viewportActions";
import { mountCanvasStage } from "@/ui/canvas/mountCanvasStage";
import { mountSmallScreenOverlay } from "@/ui/overlays/mountSmallScreenOverlay";
import { mountSidebar } from "@/ui/sidebar/mountSidebar";

const DEFAULT_SIDEBAR_WIDTH = 450;

export function boot(root: HTMLElement) {
  root.replaceChildren();

  let sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
  let canvasManager: ViewportRuntime | null = null;
  let urlApplied = false;
  let solverHandleProblemChange = () => {};

  const disposers: Array<() => void> = [];

  const history = createHistoryService(() => {
    canvasManager?.draw();
    polytope.send();
  });

  const polytope = createPolytopeService(() => solverHandleProblemChange);
  const solver = createSolverActions(() => canvasManager);
  const viewport = createViewportActions(() => canvasManager, sidebarWidth);
  const share = createShareService(() => solver.solverControls);

  solverHandleProblemChange = solver.handleProblemChange;

  const setCanvasManager = (runtime: ViewportRuntime | null) => {
    canvasManager = runtime;
    if (runtime && !urlApplied) {
      urlApplied = true;
      applyUrlParamsOnce({
        canvasManager: runtime,
        solverControls: solver.solverControls,
        updateSolverSetting: solver.updateSolverSetting,
        invalidatePendingSolveResults: solver.invalidatePendingSolveResults,
        setActiveSolverMode: solver.setActiveSolverMode,
        sendPolytope: polytope.send,
      });
    }
  };

  const actions: AppActions = {
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

    setActiveSolverMode: (mode) => solver.setActiveSolverMode(mode, true),
    setSidebarWidth: viewport.setSidebarWidth,
    syncViewportLayout: viewport.syncViewportLayout,

    loadGalleryProblem: (problem: GalleryProblem) => {
      history.save();
      solver.invalidatePendingSolveResults();
      solver.stopRotation();
      setState(
        {
          vertices: problem.vertices.map((v) => ({ ...v })),
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
      polytope.send();
      canvasManager?.draw();
      window.requestAnimationFrame(() => viewport.zoomToFit());
    },
  };

  const ctx: AppContext = {
    actions,
    services: { history, polytope, solver, viewport },

    getCanvasManager: () => canvasManager,
    setCanvasManager,

    getSidebarWidth: () => sidebarWidth,
    setSidebarWidthValue: (w) => {
      sidebarWidth = w;
    },

    disposers,
  };

  const sidebar = mountSidebar(root, ctx);

  const onResizeStart = () => {
    const move = (event: MouseEvent) => {
      sidebarWidth = Math.max(
        260,
        Math.min(window.innerWidth - 240, event.clientX),
      );
      ctx.setSidebarWidthValue(sidebarWidth);
      sidebar.updateWidth(sidebarWidth);
      viewport.setSidebarWidth(sidebarWidth);
      stage.updateLayout();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      viewport.syncViewportLayout(sidebarWidth);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const stage = mountCanvasStage(root, ctx, onResizeStart);
  const overlay = mountSmallScreenOverlay(root);

  const onResize = () => viewport.syncViewportLayout(sidebarWidth);
  window.addEventListener("resize", onResize);

  return {
    destroy: () => {
      window.removeEventListener("resize", onResize);
      overlay.destroy();
      stage.destroy();
      sidebar.destroy();
      solver.destroy();
      for (const d of disposers.splice(0)) d();
      root.replaceChildren();
    },
  };
}
