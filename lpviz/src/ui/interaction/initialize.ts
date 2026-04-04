import JSONCrush from "jsoncrush";
import { DEFAULT_VIEW_ANGLE, DEFAULT_Z_SCALE, computeDrawingPhase, getState, mutate, resetTraceState, setState } from "../../state/store";
import type { CompletionMode, DrawingPhase, SolverMode } from "../../state/store";
import { subscribe } from "../../state/store";
import { applyCentralPathResult, applyIPMResult, applyPDHGResult, applySimplexResult } from "../../solvers/worker/solverService";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";
import type { SolverWorkerPayload, SolverWorkerSuccessResponse } from "../../solvers/worker/solverWorker";
import { ViewportManager } from "../viewport";
import { isObjectiveDirectionUnbounded } from "../../solvers/utils/objectiveDirection";
import { registerCanvasInteractions } from "./canvas";
import { computeEditorRegionForState } from "./editorSession";
import { VRep } from "../../solvers/utils/polygon";
import { hasPolytopeLines } from "../../solvers/utils/polytopeTypes";
import type { HistoryEntry, State } from "../../state/store";
import { NULL_STATE_LOGO_VIEWBOX_HEIGHT, NULL_STATE_LOGO_VIEWBOX_WIDTH } from "../logo";
import { buildSharedStatePatch, compactSharedAppState, expandSharedAppState, type ShareSettings, type SharedAppState } from "../sharedState";
import { collectZoomFitBounds } from "../viewBounds";
import { createResultRuntime } from "./resultRuntime";
import { createSolverRuntime } from "./solverRuntime";

const MIN_SCREEN_WIDTH = 750;

const getOptionalElementById = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const getRequiredElementById = <T extends HTMLElement>(id: string): T => {
  const element = getOptionalElementById<T>(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

export async function initializeUI(canvas: HTMLCanvasElement, params: URLSearchParams) {
  const POPUP_ANIMATION_MS = 300;
  const TOUR_CURSOR_TRANSITION_MS = 700;
  const TOUR_DEFAULT_DELAY_MS = 300;
  const TOUR_STEP_PAUSE_MS = 250;
  const TOUR_CLICK_AT_POINT_DELAY_MS = 120;
  const TOUR_BUTTON_CLICK_DELAY_MS = 150;
  const TOUR_CURSOR_CLICK_ANIMATION_MS = 100;
  const TOUR_INACTIVITY_TIMEOUT_MS = 5000;
  const fontSizeCache = new Map<string, number>();

  const canvasManager = await ViewportManager.create(canvas);
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
  const objectiveDisplay = getRequiredElementById<HTMLElement>("objectiveDisplay");
  const inequalitiesDiv = getRequiredElementById<HTMLElement>("inequalities");
  const zoomButton = getRequiredElementById<HTMLButtonElement>("zoomButton");
  const unzoomButton = getRequiredElementById<HTMLButtonElement>("unzoomButton");
  const toggle3DButton = getRequiredElementById<HTMLButtonElement>("toggle3DButton");
  const toggleZOffsetButton = getRequiredElementById<HTMLButtonElement>("toggleZOffsetButton");
  const zScaleSliderContainer = getRequiredElementById<HTMLElement>("zScaleSliderContainer");
  const zScaleSlider = getRequiredElementById<HTMLInputElement>("zScaleSlider");
  const zScaleValue = getRequiredElementById<HTMLElement>("zScaleValue");
  const iteratePathButton = getRequiredElementById<HTMLButtonElement>("iteratePathButton");
  const ipmButton = getRequiredElementById<HTMLButtonElement>("ipmButton");
  const simplexButton = getRequiredElementById<HTMLButtonElement>("simplexButton");
  const simplexDualMode = getRequiredElementById<HTMLInputElement>("simplexDualMode");
  const pdhgButton = getRequiredElementById<HTMLButtonElement>("pdhgButton");
  const animateButton = getRequiredElementById<HTMLButtonElement>("animateButton");
  const startRotateButton = getRequiredElementById<HTMLButtonElement>("startRotateObjectiveButton");
  const stopRotateButton = getRequiredElementById<HTMLButtonElement>("stopRotateObjectiveButton");
  const traceCheckbox = getRequiredElementById<HTMLInputElement>("traceCheckbox");
  const replaySpeedSlider = getRequiredElementById<HTMLInputElement>("replaySpeedSlider");
  const rotationSettings = getRequiredElementById<HTMLElement>("objectiveRotationSettings");
  const alphaMaxSlider = getRequiredElementById<HTMLInputElement>("alphaMaxSlider");
  const correctorThresholdSlider = getRequiredElementById<HTMLInputElement>("correctorThresholdSlider");
  const ipmColorByPhase = getRequiredElementById<HTMLInputElement>("ipmColorByPhase");
  const pdhgEtaSlider = getRequiredElementById<HTMLInputElement>("pdhgEtaSlider");
  const pdhgTauSlider = getRequiredElementById<HTMLInputElement>("pdhgTauSlider");
  const centralPathIterSlider = getRequiredElementById<HTMLInputElement>("centralPathIterSlider");
  const objectiveAngleStepSlider = getRequiredElementById<HTMLInputElement>("objectiveAngleStepSlider");
  const objectiveRotationSpeedSlider = getRequiredElementById<HTMLInputElement>("objectiveRotationSpeedSlider");
  const maxitInput = getRequiredElementById<HTMLInputElement>("maxitInput");
  const maxitInputPDHG = getRequiredElementById<HTMLInputElement>("maxitInputPDHG");
  const pdhgIneqMode = getRequiredElementById<HTMLInputElement>("pdhgIneqMode");
  const pdhgHalpernMode = getRequiredElementById<HTMLInputElement>("pdhgHalpernMode");
  const pdhgColorByBasis = getRequiredElementById<HTMLInputElement>("pdhgColorByBasis");
  const sidebar = getRequiredElementById<HTMLElement>("sidebar");
  const sidebarHandle = getRequiredElementById<HTMLElement>("sidebarHandle");
  const readSolverNumber = (value: string, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  const createMessageResult = (header: string, message: string): ResultRenderPayload => ({
    type: "html",
    html: `
      <div class="iterate-header">${escapeHtml(header)}</div>
      <div class="iterate-item-nohover">${escapeHtml(message)}</div>
    `,
  });
  const solverControls = [
    {
      mode: "central",
      button: iteratePathButton,
      settingsPanel: getOptionalElementById<HTMLElement>("centralPathSettings"),
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
        centralPathIter: parseInt(centralPathIterSlider.value, 10),
      }),
      applySharedSettings: (settings: ShareSettings) =>
        applySliderSetting(settings.centralPathIter, centralPathIterSlider, centralPathIterValue, 0),
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope) || !state.polytope) {
          return null;
        }
        return {
          solver: "central",
          vertices: state.polytope.vertices,
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          niter: Math.max(1, parseInt(centralPathIterSlider.value, 10) || 1),
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyCentralPathResult(response.result, updateResult);
      },
    },
    {
      mode: "ipm",
      button: ipmButton,
      settingsPanel: getOptionalElementById<HTMLElement>("ipmSettings"),
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (state: State): ResultRenderPayload | null =>
        hasPolytopeLines(state.polytope) && state.polytope.kind === "empty"
          ? createMessageResult("No valid region", "IPM requires a feasible region.")
          : null,
      collectShareSettings: (): ShareSettings => ({
        alphaMax: parseFloat(alphaMaxSlider.value),
        correctorThreshold: parseFloat(correctorThresholdSlider.value),
        maxitIPM: parseInt(maxitInput.value, 10),
        ipmColorByPhase: ipmColorByPhase.checked,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        applySliderSetting(settings.alphaMax, alphaMaxSlider, alphaMaxValue, 3);
        applySliderSetting(settings.correctorThreshold, correctorThresholdSlider, correctorThresholdValue, 3);
        if (settings.maxitIPM !== undefined) {
          maxitInput.value = settings.maxitIPM.toString();
        }
        if (settings.ipmColorByPhase !== undefined) {
          ipmColorByPhase.checked = settings.ipmColorByPhase;
        }
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        return {
          solver: "ipm",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          alphaMax: readSolverNumber(alphaMaxSlider.value),
          correctorThreshold: readSolverNumber(correctorThresholdSlider.value, 0.9),
          maxit: Math.max(1, parseInt(maxitInput.value, 10) || 1),
          colorByPhase: ipmColorByPhase.checked,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyIPMResult(response.result, updateResult);
      },
    },
    {
      mode: "simplex",
      button: simplexButton,
      settingsPanel: getOptionalElementById<HTMLElement>("simplexSettings"),
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (state: State): ResultRenderPayload | null =>
        hasPolytopeLines(state.polytope) && state.polytope.kind === "empty"
          ? createMessageResult("No valid region", "Simplex requires a valid feasible region.")
          : null,
      collectShareSettings: (): ShareSettings => ({
        simplexDualMode: simplexDualMode.checked,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.simplexDualMode !== undefined) {
          simplexDualMode.checked = settings.simplexDualMode;
        }
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        return {
          solver: "simplex",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          dual: simplexDualMode.checked,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applySimplexResult(response.result, updateResult);
      },
    },
    {
      mode: "pdhg",
      button: pdhgButton,
      settingsPanel: getOptionalElementById<HTMLElement>("pdhgSettings"),
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (): ResultRenderPayload | null => null,
      collectShareSettings: (): ShareSettings => ({
        pdhgEta: parseFloat(pdhgEtaSlider.value),
        pdhgTau: parseFloat(pdhgTauSlider.value),
        maxitPDHG: parseInt(maxitInputPDHG.value, 10),
        pdhgIneqMode: pdhgIneqMode.checked,
        pdhgHalpernMode: pdhgHalpernMode.checked,
        pdhgColorByBasis: pdhgColorByBasis.checked,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        applySliderSetting(settings.pdhgEta, pdhgEtaSlider, pdhgEtaValue, 3);
        applySliderSetting(settings.pdhgTau, pdhgTauSlider, pdhgTauValue, 3);
        if (settings.maxitPDHG !== undefined) {
          maxitInputPDHG.value = settings.maxitPDHG.toString();
        }
        if (settings.pdhgIneqMode !== undefined) {
          pdhgIneqMode.checked = settings.pdhgIneqMode;
        }
        if (settings.pdhgHalpernMode !== undefined) {
          pdhgHalpernMode.checked = settings.pdhgHalpernMode;
        }
        if (settings.pdhgColorByBasis !== undefined) {
          pdhgColorByBasis.checked = settings.pdhgColorByBasis;
        }
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        return {
          solver: "pdhg",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          ineq: pdhgIneqMode.checked,
          halpern: pdhgHalpernMode.checked,
          maxit: Math.max(1, parseInt(maxitInputPDHG.value, 10) || 1),
          eta: readSolverNumber(pdhgEtaSlider.value),
          tau: readSolverNumber(pdhgTauSlider.value),
          colorByBasis: pdhgColorByBasis.checked,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyPDHGResult(response.result, updateResult);
      },
    },
  ] satisfies Array<{
    mode: SolverMode;
    button: HTMLButtonElement | null;
    settingsPanel: HTMLElement | null;
    isSelectable: (state: State) => boolean;
    getRunBlock: (state: State) => ResultRenderPayload | null;
    collectShareSettings: () => ShareSettings;
    applySharedSettings: (settings: ShareSettings) => void;
    buildRequest: (state: State) => SolverWorkerPayload | null;
    applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => void;
  }>;
  const getSolverControl = (mode: SolverMode) => solverControls.find((solverControl) => solverControl.mode === mode) ?? null;
  const existingSmallScreenOverlay = getOptionalElementById<HTMLElement>("smallScreenOverlay");
  const smallScreenOverlay =
    existingSmallScreenOverlay ??
    Object.assign(document.createElement("div"), {
      id: "smallScreenOverlay",
      className: "small-screen-overlay",
    });
  if (!existingSmallScreenOverlay) {
    document.body.appendChild(smallScreenOverlay);
  }
  smallScreenOverlay.classList.add("is-hidden");
  const responsiveUiRuntime = {
    pendingOptions: null as { includeTerminal?: boolean; forceResultFont?: boolean } | null,

    queue(options: { includeTerminal?: boolean; forceResultFont?: boolean }) {
      this.pendingOptions = {
        includeTerminal: Boolean(this.pendingOptions?.includeTerminal || options.includeTerminal),
        forceResultFont: Boolean(this.pendingOptions?.forceResultFont || options.forceResultFont),
      };
    },

    flush() {
      if (!this.pendingOptions || getState().isNavigatingViewport) return;
      const options = this.pendingOptions;
      this.pendingOptions = null;
      runResponsiveUiSync(options);
    },
  };
  const runResponsiveUiSync = (options: { includeTerminal?: boolean; forceResultFont?: boolean } = {}) => {
    const resultContainer = getOptionalElementById<HTMLElement>("result");
    if (resultContainer && !resultContainer.querySelector("#usageTips")) {
      const selector = resultContainer.classList.contains("virtualized")
        ? ".iterate-header, .iterate-item, .iterate-footer"
        : "div";
      const texts = resultContainer.querySelectorAll(selector);
      let maxLineChars = 0;
      texts.forEach((text) => {
        const content = (text.textContent ?? "").split("\n");
        for (const line of content) {
          maxLineChars = Math.max(maxLineChars, line.length);
        }
      });
      const datasetMax = parseInt(resultContainer.dataset.virtualMaxChars || "", 10);
      if (Number.isFinite(datasetMax)) {
        maxLineChars = Math.max(maxLineChars, datasetMax);
      }
      if (maxLineChars > 0) {
        const containerStyle = window.getComputedStyle(resultContainer);
        const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
        const effectiveWidth = resultContainer.clientWidth - paddingLeft - paddingRight;
        if (effectiveWidth > 0) {
          const cacheKey = `${maxLineChars}-${Math.round(effectiveWidth)}`;
          let fontSize = fontSizeCache.get(cacheKey);
          if (options.forceResultFont || fontSize === undefined) {
            const baseSize = 18;
            const targetWidth = Math.max(1, effectiveWidth - 10);
            const maxLineWidth = maxLineChars * baseSize * 0.55;
            const scale = Math.min(4, Math.max(0, targetWidth / maxLineWidth));
            fontSize = Math.min(24, Math.max(10, baseSize * scale * 0.875));
            fontSizeCache.set(cacheKey, fontSize);
          }
          texts.forEach((text) => {
            (text as HTMLElement).style.fontSize = `${fontSize}px`;
          });
          resultContainer.style.setProperty("--virtual-font-size", `${fontSize}px`);
        }
      }
    }

    const tooSmall = window.innerWidth < MIN_SCREEN_WIDTH;
    smallScreenOverlay.textContent = `The window is not wide enough (${window.innerWidth}px < ${MIN_SCREEN_WIDTH}px) for lpviz.`;
    setElementVisibility(smallScreenOverlay, tooSmall, "is-flex");

    if (!options.includeTerminal) return;
  };
  const syncResponsiveUi = (options: { includeTerminal?: boolean; forceResultFont?: boolean } = {}) => {
    if (getState().isNavigatingViewport) {
      responsiveUiRuntime.queue(options);
      return;
    }
    runResponsiveUiSync(options);
  };
  const applySidebarWidth = (width: number, options: { draw?: boolean; syncResponsive?: boolean } = {}) => {
    sidebar.style.width = `${width}px`;
    sidebarHandle.style.left = `${width}px`;
    canvasManager.setSidebarWidth(width);
    if (options.draw) {
      canvasManager.draw();
    }
    if (options.syncResponsive) {
      syncResponsiveUi();
    }
  };
  const syncSidebarViewport = () => {
    canvasManager.setSidebarWidth(sidebar.offsetWidth);
    canvasManager.updateDimensions();
    canvasManager.draw();
    uiRuntime.syncButtonStates();
    syncResponsiveUi({ includeTerminal: true });
  };

  const resultDiv = getRequiredElementById<HTMLElement>("result");
  const resultSelector = ".iterate-item, .iterate-header, .iterate-footer";
  const resultRuntime = createResultRuntime({
    canvasManager,
    resultDiv,
    resultSelector,
    syncResponsiveUi,
  });
  let wasNavigatingViewport = getState().isNavigatingViewport;
  subscribe((snapshot) => {
    if (wasNavigatingViewport && !snapshot.isNavigatingViewport) {
      resultRuntime.flushDeferredRender();
      responsiveUiRuntime.flush();
    }
    wasNavigatingViewport = snapshot.isNavigatingViewport;
  });

  const polytopeRuntime = {
    renderInequalities(polytope: { inequalities: string[]; lines: number[][] }, completionMode: "draft" | "closed" | "open") {
      const displayedInequalities =
        completionMode === "draft"
          ? polytope.inequalities.slice(0, Math.max(0, polytope.inequalities.length - 1))
          : polytope.inequalities;
      inequalitiesDiv.innerHTML = displayedInequalities
        .map(
          (ineq, index) => `
            <div class="inequality-item" data-index="${index}">
              ${ineq}
            </div>
          `,
        )
        .join("");

      inequalitiesDiv.querySelectorAll(".inequality-item").forEach((item) => {
        item.addEventListener("mouseenter", () => {
          const index = parseInt(item.getAttribute("data-index") || "0");
          setState({ highlightIndex: index }, { viewportDirty: canvasManager.getConstraintDirtyFlags() });
          canvasManager.draw();
        });
        item.addEventListener("mouseleave", () => {
          setState({ highlightIndex: null }, { viewportDirty: canvasManager.getConstraintDirtyFlags() });
          canvasManager.draw();
        });
      });

      const element = getOptionalElementById<HTMLElement>("subjectTo");
      if (!element) return;
      setElementVisibility(element, polytope.lines.length > 0);
    },

    showInequalityText(text: string) {
      inequalitiesDiv.textContent = text;
    },

    send() {
      const state = getState();
      if (state.vertices.length > 0 || state.objectiveVector !== null || state.currentObjective !== null) {
        uiRuntime.hideNullStateMessage();
      }

      try {
        const regionResult = computeEditorRegionForState(state);

        if (regionResult.status === "nonconvex") {
          mutate((draft) => {
            draft.polytope = null;
          });
          this.showInequalityText("Nonconvex");
          solverRuntime.handleProblemChange();
          uiRuntime.syncButtonStates();
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
          this.showInequalityText("No inequalities returned.");
          solverRuntime.handleProblemChange();
          return;
        }

        const nextState = getState();
        this.renderInequalities(result, nextState.completionMode);
        mutate((draft) => {
          draft.polytope = result;
        });
        uiRuntime.syncButtonStates();
        overlayRuntime.scheduleNonconvexHint();
        solverRuntime.handleProblemChange();
      } catch (error) {
        console.error("Error:", error);
        this.showInequalityText("Error computing inequalities.");
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
      uiRuntime.syncButtonStates();
      uiRuntime.updateObjectiveDisplay();
      canvasManager.draw();
    },

    async clickPoint(point: PointXY, apply: () => void) {
      await this.moveCursorToPoint(point);
      await this.animateCursorClick();
      apply();
      await this.delay(TOUR_CLICK_AT_POINT_DELAY_MS);
    },

    async clickButton(id: string) {
      const element = getOptionalElementById<HTMLElement>(id);
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
          uiRuntime.hideNullStateMessage();
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
          uiRuntime.updateMaximizeVisibility();
          uiRuntime.syncButtonStates();
          uiRuntime.updateObjectiveDisplay();
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
        uiRuntime.syncButtonStates();
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
  window.addEventListener("beforeunload", () => {
    overlayRuntime.teardown();
    unsubscribeHelpOverlay();
  });
  overlayRuntime.scheduleIfNeeded();

  const resetTraceAndRedrawIfNeeded = () => {
    if (!getState().traceEnabled) return;
    resetTraceState();
    canvasManager.draw();
  };
  const alphaMaxValue = getRequiredElementById<HTMLElement>("alphaMaxValue");
  const correctorThresholdValue = getRequiredElementById<HTMLElement>("correctorThresholdValue");
  const pdhgEtaValue = getRequiredElementById<HTMLElement>("pdhgEtaValue");
  const pdhgTauValue = getRequiredElementById<HTMLElement>("pdhgTauValue");
  const centralPathIterValue = getRequiredElementById<HTMLElement>("centralPathIterValue");
  const setSliderDisplay = (slider: HTMLInputElement, valueElement: HTMLElement | null, digits: number | null) => {
    if (!valueElement || digits === null) return;
    valueElement.textContent = parseFloat(slider.value).toFixed(digits);
  };
  const setElementVisibility = (
    element: HTMLElement,
    visible: boolean,
    visibleClass: "is-block" | "is-flex" | null = "is-block",
  ) => {
    element.style.removeProperty("display");
    element.classList.toggle("is-hidden", !visible);
    if (visibleClass) {
      element.classList.toggle(visibleClass, visible);
    }
  };
  const applySliderSetting = (value: number | undefined, slider: HTMLInputElement, valueElement: HTMLElement | null, digits: number | null) => {
    if (value === undefined) return;
    slider.value = value.toString();
    setSliderDisplay(slider, valueElement, digits);
  };
  const uiRuntime = {
    hideNullStateMessage() {
      const element = getOptionalElementById<HTMLElement>("nullStateMessage");
      if (!element) return;
      setElementVisibility(element, false);
    },

    updateObjectiveDisplay() {
      const { objectiveVector } = getState();
      const active = objectiveVector !== null;
      objectiveDisplay.classList.toggle("objective-item", active);
      objectiveDisplay.classList.toggle("objective-active", active);
      if (!objectiveVector) {
        objectiveDisplay.innerHTML = "";
        return;
      }
      const round = (value: number) => Math.round(value * 1000) / 1000;
      const a = round(objectiveVector.x);
      const b = round(objectiveVector.y);
      const bTerm = b >= 0 ? `+ ${b}y` : `- ${-b}y`;
      objectiveDisplay.innerHTML = `${a}x ${bTerm}`;
    },

    updateMaximizeVisibility() {
      const maximize = getOptionalElementById<HTMLElement>("maximize");
      if (!maximize) return;
      const state = getState();
      const visible = state.completionMode !== "draft" && state.objectiveVector !== null;
      setElementVisibility(maximize, visible);
    },

    updateSolverSettingsPanels(activeMode: SolverMode) {
      solverControls.forEach(({ mode, settingsPanel }) => {
        if (!settingsPanel) return;
        setElementVisibility(settingsPanel, mode === activeMode);
      });
    },

    syncButtonStates() {
      const state = getState();
      const hasComputedLines = solverRuntime.hasComputedConstraintSystem(state);
      const readyForSolvers =
        computeDrawingPhase(state) === "ready_for_solvers" &&
        hasComputedLines &&
        state.objectiveVector !== null;
      const hasSolution = (state.originalIteratePath?.length ?? 0) > 0;
      const hasObjective = state.objectiveVector !== null;
      const isRotating = state.rotateObjectiveMode;
      const isAnimating = state.animationIntervalId !== null && !isRotating;
      const is3DMode = state.is3DMode;
      const zAxisOffsetOnly = state.zAxisOffsetOnly;

      zoomButton.disabled = false;
      unzoomButton.disabled = false;
      solverControls.forEach(({ button, mode, isSelectable }) => {
        if (!button) return;
        button.disabled = !readyForSolvers || !isSelectable(state);
        button.classList.toggle("button-active", state.solverMode === mode);
      });
      animateButton.disabled = !hasComputedLines || !hasSolution || isAnimating || isRotating;
      startRotateButton.disabled = !hasComputedLines || !hasObjective || isAnimating || isRotating;
      stopRotateButton.disabled = !isRotating;
      toggle3DButton.textContent = is3DMode ? "2D" : "3D";
      toggle3DButton.classList.toggle("button-active", is3DMode);
      toggleZOffsetButton.classList.toggle("button-active", zAxisOffsetOnly);
      setElementVisibility(toggleZOffsetButton, is3DMode, null);
      setElementVisibility(zScaleSliderContainer, is3DMode, null);
    },

    updateZScaleValue() {
      const zScale = getState().zScale;
      zScaleValue.textContent = zScale.toFixed(2);
      zScaleSlider.value = String(zScale);
    },

    synchronize() {
      this.syncButtonStates();
      this.updateSolverSettingsPanels(getState().solverMode);
      this.updateZScaleValue();
      this.updateObjectiveDisplay();
      this.updateMaximizeVisibility();
      if (getState().objectiveVector) {
        this.hideNullStateMessage();
      }
      syncResponsiveUi();
    },

    collectShareSettings(solverMode: SolverMode): ShareSettings {
      const settings: ShareSettings = {
        objectiveAngleStep: parseFloat(objectiveAngleStepSlider.value),
        objectiveRotationSpeed: parseFloat(objectiveRotationSpeedSlider.value),
      };
      return { ...settings, ...(getSolverControl(solverMode)?.collectShareSettings() ?? {}) };
    },

    applySharedSettings(settings: ShareSettings = {}) {
      applySliderSetting(settings.objectiveAngleStep, objectiveAngleStepSlider, null, null);
      applySliderSetting(settings.objectiveRotationSpeed, objectiveRotationSpeedSlider, null, null);
      solverControls.forEach((solverControl) => solverControl.applySharedSettings(settings));
    },

    setActiveSolverMode(mode: SolverMode, solve = false) {
      solverRuntime.invalidatePendingSolveResults();
      if (getState().rotateObjectiveMode) {
        resetTraceAndRedrawIfNeeded();
      }

      setState({ solverMode: mode });
      this.updateSolverSettingsPanels(mode);
      this.syncButtonStates();
      if (solve && !getState().rotateObjectiveMode) {
        void solverRuntime.computePath();
      }
    },

    applySharedState(sharedState: SharedAppState) {
      solverRuntime.invalidatePendingSolveResults();
      mutate((draft) => {
        Object.assign(draft, buildSharedStatePatch(sharedState));
      });

      this.applySharedSettings(sharedState.settings);

      const state = getState();
      const regionFinished = state.completionMode !== "draft";
      uiRuntime.hideNullStateMessage();
      uiRuntime.updateMaximizeVisibility();
      this.setActiveSolverMode(state.solverMode);
      uiRuntime.updateZScaleValue();
      uiRuntime.updateObjectiveDisplay();

      if (regionFinished) {
        polytopeRuntime.send();
      } else {
        uiRuntime.syncButtonStates();
      }

      canvasManager.draw();
    },
    zoomToFitCurrentPolytope() {
      const state = getState();
      const isOpenUnbounded = state.completionMode === "open" && state.polytope?.kind === "unbounded";
      const zoomFit = collectZoomFitBounds(state);
      if (!zoomFit && !isOpenUnbounded) return;
      canvasManager.zoomToFit(isOpenUnbounded ? canvasManager.getUnboundedClipBounds() : zoomFit!.bounds, 50, zoomFit?.zBounds);
      canvasManager.setSidebarWidth(sidebar.offsetWidth);
      uiRuntime.syncButtonStates();
    },

    resetView() {
      canvasManager.setViewState(1, 0, 0);
      setState({ viewAngle: { ...DEFAULT_VIEW_ANGLE } }, { viewportDirty: {} });
      uiRuntime.syncButtonStates();
    },

    toggle3D() {
      const viewState = getState();
      if (viewState.isTransitioning3D) return;
      canvasManager.start3DTransition(!viewState.is3DMode);
      uiRuntime.syncButtonStates();
    },

    toggleZOffsetOnly() {
      setState({ zAxisOffsetOnly: !getState().zAxisOffsetOnly }, { viewportDirty: canvasManager.getZScaleDirtyFlags() });
      uiRuntime.syncButtonStates();
      canvasManager.draw();
    },

    setZScale() {
      const newScale = parseFloat(zScaleSlider.value || DEFAULT_Z_SCALE.toString());
      setState({ zScale: newScale }, { viewportDirty: canvasManager.getZScaleDirtyFlags() });
      uiRuntime.updateZScaleValue();
      const { is3DMode, isTransitioning3D } = getState();
      if (is3DMode || isTransitioning3D) {
        canvasManager.draw();
      }
    },

    getMinSidebarWidth() {
      const topResultContainer = getOptionalElementById<HTMLElement>("topResult");
      if (!topResultContainer) return 375;

      const style = window.getComputedStyle(topResultContainer);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const availableHeight = Math.max(1, topResultContainer.clientHeight - paddingTop - paddingBottom);
      const aspectRatio = NULL_STATE_LOGO_VIEWBOX_WIDTH / NULL_STATE_LOGO_VIEWBOX_HEIGHT;
      const logoWidth = availableHeight * aspectRatio;
      return Math.max(375, Math.min(logoWidth + paddingLeft + paddingRight + 20, 400));
    },

    resizeTimeout: null as number | null,
    isResizing: false,

    scheduleViewportSync() {
      syncResponsiveUi({ includeTerminal: true });
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = window.setTimeout(() => {
        syncSidebarViewport();
        this.resizeTimeout = null;
      }, 16);
    },

    beginResize(event: MouseEvent) {
      this.isResizing = true;
      event.preventDefault();
    },

    updateResize(event: MouseEvent) {
      if (!this.isResizing) return;
      const newWidth = Math.max(this.getMinSidebarWidth(), Math.min(event.clientX, 1000));
      applySidebarWidth(newWidth, { draw: true, syncResponsive: true });
    },

    finishResize() {
      if (!this.isResizing) return;
      this.isResizing = false;
      syncResponsiveUi();
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

    initialize(finishOpenRegion?: () => void) {
      this.bindControls(finishOpenRegion);
      this.synchronize();
      syncSidebarViewport();
      this.handleStartupParams();
      this.synchronize();
      canvas.focus();
    },

    bindControls(finishOpenRegion?: () => void) {
      const bind = <T extends EventTarget>(
        target: T | null | undefined,
        eventName: string,
        handler: (event: any) => void,
      ) => target?.addEventListener(eventName, handler);

      bind(getOptionalElementById<HTMLButtonElement>("shareButton"), "click", () => {
        const crushed = JSONCrush.crush(JSON.stringify(this.buildSharedState()));
        window.prompt("Share this link:", `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(crushed)}`);
      });

      solverControls.forEach(({ button, mode }) => {
        bind(button, "click", () => {
          this.setActiveSolverMode(mode, true);
        });
      });

      bind(window, "resize", () => {
        this.scheduleViewportSync();
      });
      bind(zoomButton, "click", () => {
        this.zoomToFitCurrentPolytope();
      });
      bind(unzoomButton, "click", () => {
        this.resetView();
      });
      bind(toggle3DButton, "click", () => {
        this.toggle3D();
      });
      bind(toggleZOffsetButton, "click", () => {
        this.toggleZOffsetOnly();
      });
      bind(zScaleSlider, "input", () => {
        this.setZScale();
      });
      bind(sidebarHandle, "mousedown", (event) => {
        this.beginResize(event);
      });
      bind(document, "mousemove", (event) => {
        this.updateResize(event);
      });
      bind(document, "mouseup", () => {
        this.finishResize();
      });

      bind(window, "keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          historyRuntime.handleUndoRedo(event.shiftKey);
        }
        if (event.key === "Enter") {
          event.preventDefault();
          finishOpenRegion?.();
        }
        if (event.key.toLowerCase() === "s") {
          const { snapToGrid } = getState();
          setState({ snapToGrid: !snapToGrid });
        }
        if (event.key.toLowerCase() === "h") {
          const { objectiveHidden } = getState();
          setState({ objectiveHidden: !objectiveHidden });
          canvasManager.draw();
        }
      });
    },
  };
  const solverRuntime = createSolverRuntime({
    canvasManager,
    getSolverControl,
    objectiveAngleStepSlider,
    objectiveRotationSpeedSlider,
    replaySpeedSlider,
    rotationSettings,
    setElementVisibility,
    resultRuntime,
    uiRuntime: {
      syncButtonStates: () => uiRuntime.syncButtonStates(),
      updateObjectiveDisplay: () => uiRuntime.updateObjectiveDisplay(),
    },
  });

  const { finishOpenRegion } = registerCanvasInteractions(
    canvasManager,
    {
      hideNullStateMessage: uiRuntime.hideNullStateMessage,
      updateSolverModeButtons: uiRuntime.syncButtonStates,
      updateObjectiveDisplay: uiRuntime.updateObjectiveDisplay,
      updateMaximizeVisibility: uiRuntime.updateMaximizeVisibility,
      updateZScaleValue: uiRuntime.updateZScaleValue,
    },
    historyRuntime.save.bind(historyRuntime),
    polytopeRuntime.send.bind(polytopeRuntime),
  );
  const bindSolverControls = () => {
    const bindSlider = (
      slider: HTMLInputElement,
      valueElement: HTMLElement | null,
      digits: number | null,
      onInput: () => void,
    ) => {
      setSliderDisplay(slider, valueElement, digits);
      slider.addEventListener("input", () => {
        setSliderDisplay(slider, valueElement, digits);
        onInput();
        syncResponsiveUi({ forceResultFont: true });
      });
    };
    const bindSolverInput = (
      control: HTMLInputElement,
      eventName: "input" | "change",
      mode: SolverMode,
    ) => {
      control.addEventListener(eventName, () => {
        resetTraceAndRedrawIfNeeded();
        solverRuntime.recomputeIfModeActive(mode);
        syncResponsiveUi({ forceResultFont: true });
      });
    };

    traceCheckbox.checked = false;
    traceCheckbox.addEventListener("change", () => {
      solverRuntime.setTraceEnabled(traceCheckbox.checked);
    });
    animateButton.addEventListener("click", () => {
      solverRuntime.startReplay();
    });

    bindSlider(alphaMaxSlider, alphaMaxValue, 3, () => {
      resetTraceAndRedrawIfNeeded();
      solverRuntime.recomputeIfModeActive("ipm");
    });
    bindSlider(correctorThresholdSlider, correctorThresholdValue, 3, () => {
      resetTraceAndRedrawIfNeeded();
      solverRuntime.recomputeIfModeActive("ipm");
    });
    bindSlider(pdhgEtaSlider, pdhgEtaValue, 3, () => {
      resetTraceAndRedrawIfNeeded();
      solverRuntime.recomputeIfModeActive("pdhg");
    });
    bindSlider(pdhgTauSlider, pdhgTauValue, 3, () => {
      resetTraceAndRedrawIfNeeded();
      solverRuntime.recomputeIfModeActive("pdhg");
    });
    bindSlider(centralPathIterSlider, centralPathIterValue, 0, () => {
      resetTraceAndRedrawIfNeeded();
      solverRuntime.recomputeIfModeActive("central");
    });
    bindSlider(objectiveAngleStepSlider, null, null, () => {
      if (getState().traceEnabled) {
        solverRuntime.syncTraceCapacity();
        canvasManager.draw();
      }
    });
    bindSlider(objectiveRotationSpeedSlider, null, null, () => {});

    bindSolverInput(maxitInput, "input", "ipm");
    bindSolverInput(ipmColorByPhase, "change", "ipm");
    bindSolverInput(maxitInputPDHG, "input", "pdhg");
    bindSolverInput(pdhgIneqMode, "change", "pdhg");
    bindSolverInput(pdhgHalpernMode, "change", "pdhg");
    bindSolverInput(pdhgColorByBasis, "change", "pdhg");
    bindSolverInput(simplexDualMode, "change", "simplex");

    startRotateButton.addEventListener("click", () => {
      solverRuntime.startRotation();
    });
    stopRotateButton.addEventListener("click", () => {
      solverRuntime.stopRotation();
    });
  };
  bindSolverControls();
  uiRuntime.initialize(finishOpenRegion ?? undefined);
}
