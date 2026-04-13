import JSONCrush from "jsoncrush";
import { registerLpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { DEFAULT_VIEW_ANGLE, computeDrawingPhase, getState, mutate, resetTraceState, setState } from "../../state/store";
import type { DrawingPhase, SolverMode } from "../../state/store";
import { subscribe } from "../../state/store";
import { applyCentralPathResult, applyIPMResult, applyPDHGResult, applySimplexResult } from "../../solvers/worker/solverService";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";
import type { SolverWorkerPayload, SolverWorkerSuccessResponse } from "../../solvers/worker/solverWorker";
import { ViewportManager } from "../viewport";
import { registerCanvasInteractions } from "./canvas";
import { computeEditorRegionForState } from "./editorSession";
import { VRep } from "../../solvers/utils/polygon";
import { hasPolytopeLines } from "../../solvers/utils/polytopeTypes";
import type { HistoryEntry, State } from "../../state/store";
import { buildSharedStatePatch, compactSharedAppState, expandSharedAppState, type ShareSettings, type SharedAppState } from "../sharedState";
import { collectZoomFitBounds } from "../viewBounds";
import { createResultRuntime } from "./resultRuntime";
import { createSolverRuntime } from "./solverRuntime";
import type { PointXY } from "../../solvers/utils/blas";
import type { ResultTextBlock } from "../resultPayload";

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
): Promise<CanvasRuntimeCleanup> {
  const {
    canvas,
  } = runtimeElements;
  const POPUP_ANIMATION_MS = 300;
  const TOUR_CURSOR_TRANSITION_MS = 700;
  const TOUR_DEFAULT_DELAY_MS = 300;
  const TOUR_STEP_PAUSE_MS = 250;
  const TOUR_CLICK_AT_POINT_DELAY_MS = 120;
  const TOUR_BUTTON_CLICK_DELAY_MS = 150;
  const TOUR_CURSOR_CLICK_ANIMATION_MS = 100;
  const TOUR_INACTIVITY_TIMEOUT_MS = 5000;
  const cleanupHandlers: Array<() => void> = [];
  const registerCleanup = (cleanup: () => void) => {
    cleanupHandlers.push(cleanup);
  };
  const bindEvent = (
    target: EventTarget | null | undefined,
    eventName: string,
    handler: (event: any) => void,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (!target) return;
    const listener = handler as EventListener;
    target.addEventListener(eventName, listener, options);
    registerCleanup(() => target.removeEventListener(eventName, listener, options));
  };

  const canvasManager = await ViewportManager.create(canvas);
  let currentSidebarWidth = layout.initialSidebarWidth;
  const updateSolverSetting = <K extends keyof import("../../state/store").SolverSettings>(key: K, value: import("../../state/store").SolverSettings[K]) => {
    mutate((draft) => {
      draft.solverSettings[key] = value;
    });
  };

  registerCleanup(registerLpvizRuntimeCommands({
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
      solverRuntime.recomputeIfModeActive(mode);
    },
    setTraceEnabled(enabled) {
      solverRuntime.setTraceEnabled(enabled);
    },
    startReplay() {
      solverRuntime.startReplay();
    },
    startRotation() {
      solverRuntime.startRotation();
    },
    stopRotation() {
      solverRuntime.stopRotation();
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
  const historyRuntime = {
    captureEntry(state: Pick<State, "vertices" | "objectiveVector" | "completionMode">): HistoryEntry {
      return {
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
        completionMode: state.completionMode,
      };
    },

    save(
      snapshotSource: Pick<State, "vertices" | "objectiveVector" | "completionMode"> = getState(),
      options: { clearRedo?: boolean } = {},
    ) {
      const snapshot = this.captureEntry(snapshotSource);
      mutate((draft) => {
        draft.historyStack.push(snapshot);
        if (options.clearRedo ?? true) {
          draft.redoStack = [];
        }
      });
    },

    handleUndoRedo(isRedo: boolean) {
      const state = getState();
      if (isRedo ? state.redoStack.length === 0 : state.historyStack.length === 0) return;

      if (isRedo) this.save(getState(), { clearRedo: false });

      const currentEntry = this.captureEntry(getState());
      let stateToRestore: HistoryEntry | null = null;
      mutate((draft) => {
        const sourceStack = isRedo ? draft.redoStack : draft.historyStack;
        const targetStack = isRedo ? draft.historyStack : draft.redoStack;
        if (sourceStack.length === 0) return;

        const popped = sourceStack.pop();
        if (!popped) return;
        stateToRestore = popped;

        if (!isRedo) {
          targetStack.push(currentEntry);
        }
      });

      if (!stateToRestore) return;

      mutate((draft) => {
        draft.vertices = stateToRestore!.vertices;
        draft.objectiveVector = stateToRestore!.objectiveVector;
        draft.completionMode = stateToRestore!.completionMode;
      });
      canvasManager.draw();
      polytopeRuntime.send();
    },
  };
  const createResultBlock = (className: ResultTextBlock["className"], text: string, index?: number): ResultTextBlock => ({
    className,
    text,
    index,
  });
  const createMessageResult = (header: string, message: string): ResultRenderPayload => ({
    type: "blocks",
    blocks: [
      createResultBlock("iterate-header", header),
      createResultBlock("iterate-item-nohover", message),
    ],
  });
  const solverControls = [
    {
      mode: "central",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) &&
        (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded") &&
        !solverRuntime.hasUnboundedObjectiveDirection(state),
      getRunBlock: (state: State): ResultRenderPayload | null => {
        const { polytope } = state;
        if (!hasPolytopeLines(polytope)) return null;
        if (polytope.kind === "empty") {
          return createMessageResult("No valid region", "Central Path requires a feasible region.");
        }
        if (solverRuntime.hasUnboundedObjectiveDirection(state)) {
          return createMessageResult(
            "Solver unavailable",
            "Central Path is disabled when the objective points in an unbounded direction.",
          );
        }
        return null;
      },
      collectShareSettings: (): ShareSettings => ({
        centralPathIter: getState().solverSettings.centralPathIter,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.centralPathIter !== undefined) {
          updateSolverSetting("centralPathIter", settings.centralPathIter);
        }
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope) || !state.polytope) {
          return null;
        }
        return {
          solver: "central",
          vertices: state.polytope.vertices,
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          niter: Math.max(1, state.solverSettings.centralPathIter || 1),
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyCentralPathResult(response.result, updateResult);
      },
    },
    {
      mode: "ipm",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (state: State): ResultRenderPayload | null =>
        hasPolytopeLines(state.polytope) && state.polytope.kind === "empty"
          ? createMessageResult("No valid region", "IPM requires a feasible region.")
          : null,
      collectShareSettings: (): ShareSettings => {
        const s = getState().solverSettings;
        return {
          alphaMax: s.alphaMax,
          correctorThreshold: s.correctorThreshold,
          maxitIPM: s.maxitIPM,
          ipmColorByPhase: s.ipmColorByPhase,
        };
      },
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.alphaMax !== undefined) updateSolverSetting("alphaMax", settings.alphaMax);
        if (settings.correctorThreshold !== undefined) updateSolverSetting("correctorThreshold", settings.correctorThreshold);
        if (settings.maxitIPM !== undefined) updateSolverSetting("maxitIPM", settings.maxitIPM);
        if (settings.ipmColorByPhase !== undefined) updateSolverSetting("ipmColorByPhase", settings.ipmColorByPhase);
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        const s = state.solverSettings;
        return {
          solver: "ipm",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          alphaMax: s.alphaMax,
          correctorThreshold: s.correctorThreshold,
          maxit: Math.max(1, s.maxitIPM || 1),
          colorByPhase: s.ipmColorByPhase,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyIPMResult(response.result, updateResult);
      },
    },
    {
      mode: "simplex",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (state: State): ResultRenderPayload | null =>
        hasPolytopeLines(state.polytope) && state.polytope.kind === "empty"
          ? createMessageResult("No valid region", "Simplex requires a valid feasible region.")
          : null,
      collectShareSettings: (): ShareSettings => ({
        simplexDualMode: getState().solverSettings.simplexDualMode,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.simplexDualMode !== undefined) updateSolverSetting("simplexDualMode", settings.simplexDualMode);
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        return {
          solver: "simplex",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          dual: state.solverSettings.simplexDualMode,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applySimplexResult(response.result, updateResult);
      },
    },
    {
      mode: "pdhg",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (): ResultRenderPayload | null => null,
      collectShareSettings: (): ShareSettings => {
        const s = getState().solverSettings;
        return {
          pdhgEta: s.pdhgEta,
          pdhgTau: s.pdhgTau,
          maxitPDHG: s.maxitPDHG,
          pdhgIneqMode: s.pdhgIneqMode,
          pdhgHalpernMode: s.pdhgHalpernMode,
          pdhgColorByBasis: s.pdhgColorByBasis,
        };
      },
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.pdhgEta !== undefined) updateSolverSetting("pdhgEta", settings.pdhgEta);
        if (settings.pdhgTau !== undefined) updateSolverSetting("pdhgTau", settings.pdhgTau);
        if (settings.maxitPDHG !== undefined) updateSolverSetting("maxitPDHG", settings.maxitPDHG);
        if (settings.pdhgIneqMode !== undefined) updateSolverSetting("pdhgIneqMode", settings.pdhgIneqMode);
        if (settings.pdhgHalpernMode !== undefined) updateSolverSetting("pdhgHalpernMode", settings.pdhgHalpernMode);
        if (settings.pdhgColorByBasis !== undefined) updateSolverSetting("pdhgColorByBasis", settings.pdhgColorByBasis);
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        const s = state.solverSettings;
        return {
          solver: "pdhg",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          ineq: s.pdhgIneqMode,
          halpern: s.pdhgHalpernMode,
          maxit: Math.max(1, s.maxitPDHG || 1),
          eta: s.pdhgEta,
          tau: s.pdhgTau,
          colorByBasis: s.pdhgColorByBasis,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyPDHGResult(response.result, updateResult);
      },
    },
  ] satisfies Array<{
    mode: SolverMode;
    isSelectable: (state: State) => boolean;
    getRunBlock: (state: State) => ResultRenderPayload | null;
    collectShareSettings: () => ShareSettings;
    applySharedSettings: (settings: ShareSettings) => void;
    buildRequest: (state: State) => SolverWorkerPayload | null;
    applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => void;
  }>;
  const getSolverControl = (mode: SolverMode) => solverControls.find((solverControl) => solverControl.mode === mode) ?? null;
  const syncSidebarViewport = () => {
    canvasManager.setSidebarWidth(currentSidebarWidth);
    canvasManager.updateDimensions();
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
          solverRuntime.handleProblemChange();
          overlayRuntime.scheduleNonconvexHint();
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
          solverRuntime.handleProblemChange();
          return;
        }

        mutate((draft) => {
          draft.polytope = result;
          draft.inequalitiesMessage = null;
          if (draft.highlightIndex !== null && draft.highlightIndex >= result.inequalities.length) {
            draft.highlightIndex = null;
          }
        });
        overlayRuntime.scheduleNonconvexHint();
        solverRuntime.handleProblemChange();
      } catch (error) {
        console.error("Error:", error);
        mutate((draft) => {
          draft.polytope = null;
          draft.inequalitiesMessage = "Error computing inequalities.";
          draft.highlightIndex = null;
        });
        solverRuntime.handleProblemChange();
        overlayRuntime.scheduleNonconvexHint();
      }
    },
  };
  const createOverlayPopup = (options: {
    id: string;
    text: string;
    side: "left" | "right";
    gradient: string;
    onClick?: () => void;
    onClose?: () => void;
  }) => {
    const popup = document.createElement("div");
    popup.id = options.id;
    popup.innerHTML = `
      <div class="tour-popup__content">
        <div class="tour-popup__text">${options.text}</div>
        <button class="tour-popup__close" aria-label="Close">×</button>
      </div>
    `;
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "20px",
      [options.side]: "20px",
      background: options.gradient,
      color: "#fff",
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      zIndex: "9999",
      fontFamily: "JuliaMono, monospace",
      cursor: "pointer",
      transform: "translateY(100px)",
      opacity: "0",
      transition: `all ${POPUP_ANIMATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.15)",
      maxWidth: "min(320px, calc(100% - 40px))",
    });
    const content = popup.querySelector(".tour-popup__content") as HTMLElement;
    Object.assign(content.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 20px",
      gap: "12px",
    });
    const closeBtn = popup.querySelector(".tour-popup__close") as HTMLButtonElement;
    Object.assign(closeBtn.style, {
      background: "rgba(255,255,255,0.2)",
      border: "none",
      color: "#fff",
      width: "24px",
      height: "24px",
      borderRadius: "50%",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "16px",
    });
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      options.onClose?.();
    });
    if (options.onClick) {
      popup.addEventListener("click", (event) => {
        if (event.target === closeBtn) return;
        options.onClick?.();
      });
    }
    return popup;
  };

  const showOverlayPopup = (popup: HTMLElement) => {
    document.body.appendChild(popup);
    requestAnimationFrame(() => {
      Object.assign(popup.style, { transform: "translateY(0)", opacity: "1" });
    });
  };

  const dismissOverlayPopup = (popup: HTMLElement | null) => {
    if (!popup) return;
    Object.assign(popup.style, { transform: "translateY(100px)", opacity: "0" });
    setTimeout(() => popup.remove(), POPUP_ANIMATION_MS);
  };

  const overlayRuntime = {
    nonconvexHintPopup: null as HTMLElement | null,
    nonconvexHintTimer: null as number | null,
    nonconvexHintShown: false,
    helpOverlayPopup: null as HTMLElement | null,
    helpOverlayTimer: null as number | null,
    helpOverlayShown: false,
    lastHelpPhase: null as DrawingPhase | null,

    dismissNonconvexHint() {
      this.nonconvexHintShown = false;
      if (this.nonconvexHintTimer) {
        clearTimeout(this.nonconvexHintTimer);
        this.nonconvexHintTimer = null;
      }
      dismissOverlayPopup(this.nonconvexHintPopup);
      this.nonconvexHintPopup = null;
    },

    scheduleNonconvexHint() {
      const state = getState();
      const polytope = VRep.fromPoints(state.vertices);
      const nonconvex = state.completionMode === "closed" && state.vertices.length >= 3 && !polytope.isConvex();
      if (!nonconvex || state.tourActive) {
        this.dismissNonconvexHint();
        return;
      }
      if (this.nonconvexHintShown || this.nonconvexHintTimer || this.nonconvexHintPopup) {
        return;
      }
      this.nonconvexHintTimer = window.setTimeout(() => {
        this.nonconvexHintTimer = null;
        if (getState().tourActive || this.nonconvexHintPopup) {
          return;
        }
        this.nonconvexHintShown = true;
        this.nonconvexHintPopup = createOverlayPopup({
          id: "nonconvexHint",
          text: "Tip: double-click inside the polytope to replace it with its convex hull.",
          side: "left",
          gradient: "linear-gradient(135deg,#ff9966 0%,#ff5e62 100%)",
          onClose: () => this.dismissNonconvexHint(),
        });
        showOverlayPopup(this.nonconvexHintPopup);
      }, 4000);
    },
    show() {
      if (tourRuntime.running || this.helpOverlayPopup) return;
      this.helpOverlayShown = true;
      this.helpOverlayPopup = createOverlayPopup({
        id: "helpPopup",
        text: "Stuck? Try a random LP",
        side: "right",
        gradient: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
        onClose: () => this.dismiss(),
        onClick: () => {
          this.dismiss();
          void tourRuntime.start();
        },
      });
      showOverlayPopup(this.helpOverlayPopup);
    },

    dismiss() {
      if (this.helpOverlayTimer) {
        clearTimeout(this.helpOverlayTimer);
        this.helpOverlayTimer = null;
      }
      dismissOverlayPopup(this.helpOverlayPopup);
      this.helpOverlayPopup = null;
    },

    reset() {
      this.dismiss();
      this.helpOverlayShown = false;
      this.scheduleIfNeeded();
    },

    teardown() {
      this.dismissNonconvexHint();
      this.dismiss();
    },

    scheduleIfNeeded() {
      const state = getState();
      if (state.objectiveVector !== null || state.tourActive || this.helpOverlayShown || this.helpOverlayTimer) {
        return;
      }
      this.helpOverlayTimer = window.setTimeout(() => {
        this.helpOverlayTimer = null;
        this.show();
      }, TOUR_INACTIVITY_TIMEOUT_MS);
    },
  };
  const tourRuntime = {
    cursor: null as HTMLElement | null,
    running: false,
    allowNextClick: false,
    clickBlocker: null as ((e: Event) => void) | null,

    delay(ms = TOUR_DEFAULT_DELAY_MS) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    logicalToScreen(point: { x: number; y: number }) {
      const rect = canvasManager.canvas.getBoundingClientRect();
      const canvasPoint = canvasManager.toCanvasCoords(point.x, point.y);
      return { x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y };
    },

    buildScript(vertices: PointXY[], objective: PointXY) {
      const steps: Array<
        | { type: "wait"; duration: number }
        | { type: "draw-vertex"; point: PointXY }
        | { type: "close-polytope"; point: PointXY }
        | { type: "set-objective"; point: PointXY }
        | { type: "click-button"; id: string }
      > = [{ type: "wait", duration: 500 }];
      vertices.forEach((point) => steps.push({ type: "draw-vertex", point }));
      steps.push({ type: "close-polytope", point: { x: 0, y: 0 } });
      steps.push({ type: "wait", duration: 1000 });
      steps.push({ type: "set-objective", point: objective });
      steps.push({ type: "wait", duration: 1000 });
      steps.push({ type: "click-button", id: "ipmButton" });
      steps.push({ type: "wait", duration: 750 });
      steps.push({ type: "click-button", id: "toggle3DButton" });
      steps.push({ type: "wait", duration: 750 });
      steps.push({ type: "click-button", id: "startRotateObjectiveButton" });
      steps.push({ type: "wait", duration: 2000 });
      steps.push({ type: "click-button", id: "iteratePathButton" });
      steps.push({ type: "wait", duration: 1500 });
      steps.push({ type: "click-button", id: "traceCheckbox" });
      return steps;
    },

    generatePentagon(): PointXY[] {
      const vertices: PointXY[] = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const radiusVariation = 0.8 + Math.random() * 0.4;
        const radius = 10 * radiusVariation;
        const angleVariation = (Math.random() - 0.5) * 0.3;
        vertices.push({
          x: radius * Math.cos(angle + angleVariation),
          y: radius * Math.sin(angle + angleVariation),
        });
      }
      return vertices;
    },

    generateObjective(): PointXY {
      const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
      const magnitude = 6 + Math.random() * 8;
      return {
        x: magnitude * Math.cos(angle),
        y: magnitude * Math.sin(angle),
      };
    },

    setClickBlocker(enabled: boolean) {
      if (enabled) {
        if (this.clickBlocker) return;
        this.clickBlocker = (event: Event) => {
          if (this.allowNextClick) {
            this.allowNextClick = false;
            return;
          }
          const target = event.target as HTMLElement;
          if (target?.id === "tourCursor" || target?.closest("#helpPopup")) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        };
        ["click", "mousedown", "mouseup"].forEach((evt) => document.addEventListener(evt, this.clickBlocker!, true));
        return;
      }
      if (!this.clickBlocker) return;
      ["click", "mousedown", "mouseup"].forEach((evt) => document.removeEventListener(evt, this.clickBlocker!, true));
      this.clickBlocker = null;
    },

    ensureCursor() {
      if (this.cursor) return;
      this.cursor = document.createElement("div");
      this.cursor.id = "tourCursor";
      this.cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="#4A90E2" stroke="#fff" stroke-width="1.5"/></svg>`;
      Object.assign(this.cursor.style, {
        position: "fixed",
        zIndex: "10000",
        width: "24px",
        height: "24px",
        pointerEvents: "none",
        transition: `all ${TOUR_CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
        transform: "translate(-25%, -25%)",
        filter: "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))",
      });
      document.body.appendChild(this.cursor);
    },

    async moveCursorToScreen(x: number, y: number) {
      if (!this.cursor) return;
      this.cursor.style.left = `${x}px`;
      this.cursor.style.top = `${y}px`;
      await this.delay(TOUR_CURSOR_TRANSITION_MS);
    },

    async moveCursorToPoint(point: PointXY) {
      const { x, y } = this.logicalToScreen(point);
      await this.moveCursorToScreen(x, y);
    },

    async animateCursorClick() {
      if (!this.cursor) return;
      this.cursor.style.transform = "translate(-25%, -25%) scale(1.8)";
      this.cursor.style.filter = "drop-shadow(2px 2px 8px rgba(74,144,226,0.6))";
      await this.delay(TOUR_CURSOR_CLICK_ANIMATION_MS);
      this.cursor.style.transform = "translate(-25%, -25%) scale(1)";
      this.cursor.style.filter = "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))";
    },

    resetWorkspace() {
      setState({
        vertices: [],
        completionMode: "draft",
        interiorPoint: null,
        currentMouse: null,
        objectiveVector: null,
        currentObjective: null,
      });
      canvasManager.draw();
    },

    async clickPoint(point: PointXY, apply: () => void) {
      await this.moveCursorToPoint(point);
      await this.animateCursorClick();
      apply();
      await this.delay(TOUR_CLICK_AT_POINT_DELAY_MS);
    },

    async clickButton(id: string) {
      const element = getTourButtonTarget(id);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      await this.moveCursorToScreen(rect.left + rect.width / 2, rect.top + rect.height / 2);
      await this.animateCursorClick();
      this.allowNextClick = true;
      element.click();
      await this.delay(TOUR_BUTTON_CLICK_DELAY_MS);
    },

    async runStep(
      step:
        | { type: "wait"; duration: number }
        | { type: "draw-vertex"; point: PointXY }
        | { type: "close-polytope"; point: PointXY }
        | { type: "set-objective"; point: PointXY }
        | { type: "click-button"; id: string },
    ) {
      if (step.type === "wait") {
        await this.delay(step.duration);
        return;
      }
      if (step.type === "click-button") {
        await this.clickButton(step.id);
        return;
      }
      if (step.type === "draw-vertex") {
        await this.clickPoint(step.point, () => {
          historyRuntime.save();
          mutate((draft) => {
            draft.vertices.push(step.point);
            draft.completionMode = "draft";
          });
          canvasManager.draw();
          polytopeRuntime.send();
        });
        return;
      }
      if (step.type === "set-objective") {
        await this.clickPoint(step.point, () => {
          historyRuntime.save();
          mutate((draft) => {
            draft.objectiveVector = step.point;
          });
          canvasManager.draw();
        });
        return;
      }
      await this.clickPoint(step.point, () => {
        historyRuntime.save();
        mutate((draft) => {
          draft.completionMode = "closed";
          draft.interiorPoint = step.point;
        });
        canvasManager.draw();
        polytopeRuntime.send();
      });
    },

    stop() {
      this.running = false;
      this.cursor?.remove();
      this.cursor = null;
      this.setClickBlocker(false);
      setState({ currentMouse: null, currentObjective: null, tourActive: false });
      canvasManager.draw();
    },

    async start() {
      if (this.running) return;
      this.running = true;
      setState({ tourActive: true });
      this.setClickBlocker(true);
      this.resetWorkspace();
      this.ensureCursor();

      const script = this.buildScript(this.generatePentagon(), this.generateObjective());
      try {
        for (const step of script) {
          if (!this.running) break;
          await this.runStep(step);
          if (!this.running) break;
          await this.delay(TOUR_STEP_PAUSE_MS);
        }
      } finally {
        this.stop();
      }
    },
  };
  const getTourButtonTarget = (id: string): HTMLElement | null => {
    return document.getElementById(id);
  };
  const unsubscribeHelpOverlay = subscribe((state: State) => {
    const phase = computeDrawingPhase(state);
    if (state.objectiveVector !== null || state.tourActive) {
      overlayRuntime.dismiss();
      overlayRuntime.lastHelpPhase = phase;
      return;
    }
    if (overlayRuntime.lastHelpPhase !== phase) {
      overlayRuntime.dismiss();
    }
    overlayRuntime.scheduleIfNeeded();
    overlayRuntime.lastHelpPhase = phase;
  });
  const handleBeforeUnload = () => {
    overlayRuntime.teardown();
    unsubscribeHelpOverlay();
  };
  bindEvent(window, "beforeunload", handleBeforeUnload);
  registerCleanup(() => {
    overlayRuntime.teardown();
    unsubscribeHelpOverlay();
  });
  overlayRuntime.scheduleIfNeeded();

  const resetTraceAndRedrawIfNeeded = () => {
    if (!getState().traceEnabled) return;
    resetTraceState();
    canvasManager.draw();
  };
  const uiRuntime = {
    collectShareSettings(solverMode: SolverMode): ShareSettings {
      const s = getState().solverSettings;
      const settings: ShareSettings = {
        objectiveAngleStep: s.objectiveAngleStep,
        objectiveRotationSpeed: s.objectiveRotationSpeed,
      };
      return { ...settings, ...(getSolverControl(solverMode)?.collectShareSettings() ?? {}) };
    },

    applySharedSettings(settings: ShareSettings = {}) {
      if (settings.objectiveAngleStep !== undefined) updateSolverSetting("objectiveAngleStep", settings.objectiveAngleStep);
      if (settings.objectiveRotationSpeed !== undefined) updateSolverSetting("objectiveRotationSpeed", settings.objectiveRotationSpeed);
      solverControls.forEach((solverControl) => solverControl.applySharedSettings(settings));
    },

    setActiveSolverMode(mode: SolverMode, solve = false) {
      solverRuntime.invalidatePendingSolveResults();
      if (getState().rotateObjectiveMode) {
        resetTraceAndRedrawIfNeeded();
      }

      setState({ solverMode: mode });
      if (solve && !getState().rotateObjectiveMode) {
        void solverRuntime.computePath();
      }
    },

    applySharedState(sharedState: SharedAppState) {
      solverRuntime.invalidatePendingSolveResults();
      mutate((draft) => {
        Object.assign(draft, buildSharedStatePatch(sharedState));
        draft.inequalitiesMessage = null;
        draft.highlightIndex = null;
      });

      this.applySharedSettings(sharedState.settings);

      const state = getState();
      const regionFinished = state.completionMode !== "draft";
      this.setActiveSolverMode(state.solverMode);

      if (regionFinished) {
        polytopeRuntime.send();
      }

      canvasManager.draw();
    },
    zoomToFitCurrentPolytope() {
      const state = getState();
      const isOpenUnbounded = state.completionMode === "open" && state.polytope?.kind === "unbounded";
      const zoomFit = collectZoomFitBounds(state);
      if (!zoomFit && !isOpenUnbounded) return;
      canvasManager.zoomToFit(isOpenUnbounded ? canvasManager.getUnboundedClipBounds() : zoomFit!.bounds, 50, zoomFit?.zBounds);
      canvasManager.setSidebarWidth(currentSidebarWidth);
    },

    resetView() {
      canvasManager.setViewState(1, 0, 0);
      setState({ viewAngle: { ...DEFAULT_VIEW_ANGLE } }, { viewportDirty: {} });
    },

    toggle3D() {
      const viewState = getState();
      if (viewState.isTransitioning3D) return;
      canvasManager.start3DTransition(!viewState.is3DMode);
    },

    toggleZOffsetOnly() {
      setState({ zAxisOffsetOnly: !getState().zAxisOffsetOnly }, { viewportDirty: canvasManager.getZScaleDirtyFlags() });
      canvasManager.draw();
    },

    share() {
      const crushed = JSONCrush.crush(JSON.stringify(this.buildSharedState()));
      window.prompt("Share this link:", `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(crushed)}`);
    },

    buildSharedState() {
      const { vertices, completionMode, objectiveVector, solverMode, zScale, zAxisOffsetOnly } = getState();
      return compactSharedAppState({
        vertices,
        completionMode,
        objective: objectiveVector,
        solverMode,
        settings: this.collectShareSettings(solverMode),
        zScale,
        zAxisOffsetOnly,
      });
    },

    handleStartupParams() {
      if (params.has("s")) {
        try {
          const crushed = decodeURIComponent(params.get("s") ?? "");
          const jsonString = JSONCrush.uncrush(crushed);
          const data = JSON.parse(jsonString);
          if (data) {
            this.applySharedState(expandSharedAppState(data) as SharedAppState);
          }
          history.replaceState(null, "", window.location.pathname);
          overlayRuntime.reset();
        } catch (error) {
          console.error("Failed to load shared state", error);
        }
      }

      if (params.has("demo")) {
        void tourRuntime.start();
      }
    },

    initialize() {
      syncSidebarViewport();
      this.handleStartupParams();
    },
  };
  const solverRuntime = createSolverRuntime({
    canvasManager,
    getSolverControl,
    resultRuntime,
  });

  const { teardown: teardownCanvasInteractions } = registerCanvasInteractions(
    canvasManager,
    historyRuntime.save.bind(historyRuntime),
    polytopeRuntime.send.bind(polytopeRuntime),
    historyRuntime.handleUndoRedo.bind(historyRuntime),
  );
  registerCleanup(() => {
    teardownCanvasInteractions();
  });
  uiRuntime.initialize();

  return () => {
    overlayRuntime.teardown();
    tourRuntime.stop();
    solverRuntime.stopActiveMotion();
    while (cleanupHandlers.length > 0) {
      cleanupHandlers.pop()?.();
    }
    canvasManager.destroy();
  };
}
