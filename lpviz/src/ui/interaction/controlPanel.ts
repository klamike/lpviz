import { getState, mutate, setState, SolverMode, handleStepSizeChange, resetTraceState, prepareAnimationInterval } from "../../state/store";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";
import { start3DTransition } from "../rendering/math3d";
import { setElementDisplay } from "../../state/utils";
import { refreshResponsiveLayout } from "../utils";
import { VRep } from "../../solvers/utils/polytope";
import { ViewportManager } from "../viewport";
import { LayoutManager } from "../layout";
import { runSolverWorker } from "../../solvers/worker/client";
import { hasPolytopeLines } from "../../solvers/utils/polytope";
import { bindControls, type ControlBinding } from "./bind";
import { SOLVER_DEFINITIONS, type SettingsElements } from "../../solvers/utils/registry";

export const getRequiredElementById = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
};

export function initializeControlPanel(canvasManager: ViewportManager, uiManager: LayoutManager, updateResult: (payload: ResultRenderPayload) => void, showAllResults?: () => void, onSettingsChange?: () => void) {
  function setupZoomHandlers() {
    uiManager.zoomButton?.addEventListener("click", () => {
      const { vertices } = getState();
      const bounds = VRep.fromPoints(vertices).boundingBox();
      if (!bounds) return;

      canvasManager.zoomToFit(bounds);
      const sidebarWidth = document.getElementById("sidebar")?.offsetWidth ?? 0;
      canvasManager.centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
      canvasManager.centerY = window.innerHeight / 2;
      uiManager.updateZoomButtonsState(canvasManager);
    });

    uiManager.unzoomButton?.addEventListener("click", () => {
      canvasManager.resetView();
      setState({ viewAngle: { x: -1.15, y: 0.4, z: 0 } });
      uiManager.updateZoomButtonsState(canvasManager);
    });
  }

  function setup3DHandlers() {
    uiManager.toggle3DButton?.addEventListener("click", () => {
      const viewState = getState();
      if (viewState.isTransitioning3D) return;
      start3DTransition(canvasManager, uiManager, !viewState.is3DMode);
    });

    uiManager.zScaleSlider?.addEventListener("input", () => {
      const newScale = parseFloat(uiManager.zScaleSlider?.value || "0.1");
      setState({ zScale: newScale });
      uiManager.updateZScaleValue();
      const { is3DMode, isTransitioning3D } = getState();
      if (is3DMode || isTransitioning3D) {
        canvasManager.draw();
      }
    });
  }

  const resetTraceAndRedrawIfNeeded = () => {
    resetTraceState();
    if (getState().traceEnabled) {
      canvasManager.draw();
    }
  };

  const runSolverWhenActive = (solverMode: SolverMode | undefined, callback: () => void) => {
    if (!solverMode) return;
    if (getState().solverMode === solverMode) {
      callback();
    }
  };

  function setupSolverModeHandlers() {
    const solverButtons = SOLVER_DEFINITIONS.map((definition) => ({
      ...definition,
      element: document.getElementById(definition.buttonId) as HTMLButtonElement | null,
    }));

    const settingsPanels = solverButtons.map((btn) => btn.settingsPanelId).filter((id): id is string => Boolean(id));

    solverButtons.forEach(({ element, mode, settingsPanelId }) => {
      if (!element) return;
      element.addEventListener("click", () => {
        if (getState().rotateObjectiveMode) resetTraceAndRedrawIfNeeded();
        setState({ solverMode: mode });
        solverButtons.forEach((btn) => {
          if (btn.element) btn.element.disabled = btn.element === element;
        });
        settingsPanels.forEach((panelId) => setElementDisplay(panelId, "none"));
        if (settingsPanelId) setElementDisplay(settingsPanelId, "block");
      });
    });
  }

  function setupSettingsInputs() {
    const bindings: ControlBinding[] = [
      { id: "alphaMaxSlider", displayId: "alphaMaxValue", decimals: 3, solver: "ipm" },
      { id: "pdhgEtaSlider", displayId: "pdhgEtaValue", decimals: 3, solver: "pdhg" },
      { id: "pdhgTauSlider", displayId: "pdhgTauValue", decimals: 3, solver: "pdhg" },
      { id: "centralPathIterSlider", displayId: "centralPathIterValue", decimals: 0, solver: "central" },
      {
        id: "objectiveAngleStepSlider",
        displayId: "objectiveAngleStepValue",
        decimals: 2,
        affectsTrace: false,
        onChange: () => {
          if (getState().traceEnabled) (handleStepSizeChange(), canvasManager.draw());
        },
      },
      { id: "objectiveRotationSpeedSlider", displayId: "objectiveRotationSpeedValue", decimals: 1, affectsTrace: false },
      { id: "maxitInput", solver: "ipm" },
      { id: "maxitInputPDHG", solver: "pdhg" },
      { id: "pdhgIneqMode", solver: "pdhg", event: "change" },
    ];

    return bindControls(bindings, {
      getElement: getRequiredElementById,
      resetTrace: resetTraceAndRedrawIfNeeded,
      runSolverWhenActive: (mode) => runSolverWhenActive(mode, computePath),
      onSettingsChange,
    });
  }

  function setupActionButtons() {
    const traceButton = getRequiredElementById<HTMLButtonElement>("traceButton");
    traceButton.addEventListener("click", () => {
      computePath();
      setState({ iteratePathComputed: true });
    });

    const startRotateButton = getRequiredElementById<HTMLButtonElement>("startRotateObjectiveButton");
    const stopRotateButton = getRequiredElementById<HTMLButtonElement>("stopRotateObjectiveButton");
    const rotationSettings = getRequiredElementById<HTMLElement>("objectiveRotationSettings");

    startRotateButton.addEventListener("click", () => {
      const { objectiveVector, animationIntervalId } = getState();
      const hadObjective = Boolean(objectiveVector);

      setState({
        rotateObjectiveMode: true,
        animationIntervalId: null,
        objectiveVector: objectiveVector || { x: 1, y: 0 },
      });
      resetTraceState();

      if (!hadObjective) uiManager.updateObjectiveDisplay();
      if (animationIntervalId !== null) clearInterval(animationIntervalId);

      rotationSettings.style.display = "block";
      uiManager.updateSolverModeButtons();
      computeAndRotate();
    });

    stopRotateButton.addEventListener("click", () => {
      setState({ rotateObjectiveMode: false, totalRotationAngle: 0 });
      rotationSettings.style.display = "none";
      uiManager.updateSolverModeButtons();
      showAllResults?.();
    });
  }

  function setupTraceAndAnimation() {
    const traceCheckbox = getRequiredElementById<HTMLInputElement>("traceCheckbox");
    traceCheckbox.checked = false;
    traceCheckbox.addEventListener("change", () => {
      setState({ traceEnabled: traceCheckbox.checked });
      if (!traceCheckbox.checked) {
        resetTraceState();
        canvasManager.draw();
      } else {
        handleStepSizeChange();
      }
    });

    const animateButton = getRequiredElementById<HTMLButtonElement>("animateButton");
    const replaySpeedSlider = getRequiredElementById<HTMLInputElement>("replaySpeedSlider");

    animateButton.addEventListener("click", () => {
      const solverSnapshot = getState();
      if (solverSnapshot.rotateObjectiveMode) return;

      if (solverSnapshot.animationIntervalId !== null) {
        clearInterval(solverSnapshot.animationIntervalId);
      }

      const intervalTime = parseInt(replaySpeedSlider.value, 10) || 500;
      const iteratesToAnimate = [...solverSnapshot.originalIteratePath];
      setState({
        iteratePath: [],
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      });
      canvasManager.draw();

      let currentIndex = 0;
      const intervalId = window.setInterval(() => {
        if (getState().animationIntervalId !== intervalId) return;

        if (currentIndex >= iteratesToAnimate.length) {
          clearInterval(intervalId);
          setState({ animationIntervalId: null });
          return;
        }

        mutate((draft) => {
          draft.iteratePath.push(iteratesToAnimate[currentIndex]);
          draft.highlightIteratePathIndex = currentIndex;
        });
        currentIndex++;
        canvasManager.draw();
      }, intervalTime);

      setState({ animationIntervalId: intervalId });
    });
  }

  async function computePath() {
    prepareAnimationInterval();
    const state = getState();
    const phaseSnapshot = state.snapshot;
    const { polytope, objectiveVector, solverMode } = state;
    if (phaseSnapshot.phase !== "ready_for_solvers" || !objectiveVector || !hasPolytopeLines(polytope)) {
      return;
    }

    const solverDefinition = SOLVER_DEFINITIONS.find((def) => def.mode === solverMode);
    if (!solverDefinition) return;

    const request = solverDefinition.buildRequest(state, settingsElements);
    if (!request) return;

    try {
      const response = await runSolverWorker(request);
      solverDefinition.applyResult(response, settingsElements, updateResult);
      uiManager.updateSolverModeButtons();
    } catch (error) {
      console.error("Error in computePath:", error);
    }
  }

  const BASE_ROTATION_WAIT_MS = 30;

  function scheduleNextRotation() {
    if (!getState().rotateObjectiveMode) {
      return;
    }
    const speedValue = parseFloat(settingsElements.objectiveRotationSpeedSlider.value || "1");
    const clampedSpeed = Math.max(0.2, speedValue);
    const wait = BASE_ROTATION_WAIT_MS / clampedSpeed;
    setTimeout(computeAndRotate, wait);
  }

  async function computeAndRotate() {
    const state = getState();
    const polytope = VRep.fromPoints(state.vertices);
    if (!polytope.isConvex()) {
      scheduleNextRotation();
      return;
    }

    const phaseSnapshot = state.snapshot;
    const { rotateObjectiveMode, objectiveVector } = state;
    if (!rotateObjectiveMode || !phaseSnapshot.objectiveDefined || !objectiveVector) return;

    const angleStep = parseFloat(settingsElements.objectiveAngleStepSlider.value);
    const angle = Math.atan2(objectiveVector.y, objectiveVector.x);
    const magnitude = Math.hypot(objectiveVector.x, objectiveVector.y);

    setState({
      objectiveVector: {
        x: magnitude * Math.cos(angle + angleStep),
        y: magnitude * Math.sin(angle + angleStep),
      },
    });
    if (getState().traceEnabled) {
      mutate((draft) => {
        draft.totalRotationAngle += angleStep;
      });
    }

    uiManager.updateObjectiveDisplay();
    canvasManager.draw();

    const updatedState = getState();
    const updatedPhase = updatedState.snapshot;
    const hasComputedLines = hasPolytopeLines(updatedState.polytope);
    if (updatedPhase.phase === "ready_for_solvers" && hasComputedLines) {
      try {
        await computePath();
      } catch (error) {
        console.error("Error in computePath:", error);
      }
    }

    scheduleNextRotation();
  }

  function setupSidebarResize() {
    const sidebar = getRequiredElementById<HTMLElement>("sidebar");
    const handle = getRequiredElementById<HTMLElement>("sidebarHandle");
    let isResizing = false;

    const minSidebarWidth = calculateMinSidebarWidth();

    handle.addEventListener("mousedown", (e) => ((isResizing = true), e.preventDefault()));

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const newWidth = Math.max(minSidebarWidth, Math.min(e.clientX, 1000));
      sidebar.style.width = `${newWidth}px`;
      handle.style.left = `${newWidth}px`;
      canvasManager.centerX = newWidth + (window.innerWidth - newWidth) / 2;
      canvasManager.draw();
      refreshResponsiveLayout();
    });

    document.addEventListener("mouseup", () => {
      if (isResizing) ((isResizing = false), refreshResponsiveLayout());
    });
  }

  function setupResultHover() {
    const resultDiv = document.getElementById("result") as HTMLElement | null;
    if (!resultDiv) return;

    const SELECTOR = ".iterate-item, .iterate-header, .iterate-footer";
    let mouseX = 0,
      mouseY = 0,
      pointerInside = false;
    let rafId: number | null = null;
    let currentHovered: HTMLElement | null = null;

    const clearHover = () => {
      if (!currentHovered) return;
      currentHovered.classList.remove("hover");
      currentHovered.dispatchEvent(new Event("mouseleave", { bubbles: true }));
      currentHovered = null;
    };

    const setHovered = (next: HTMLElement | null) => {
      if (currentHovered === next) return;
      clearHover();
      if (next) {
        currentHovered = next;
        next.classList.add("hover");
        next.dispatchEvent(new Event("mouseenter", { bubbles: true }));
      }
    };

    const updateHoverState = () => {
      if (!pointerInside) {
        rafId = null;
        return;
      }
      const el = document.elementFromPoint(mouseX, mouseY);
      setHovered(el instanceof HTMLElement && resultDiv.contains(el) && el.matches(SELECTOR) ? el : null);
      rafId = requestAnimationFrame(updateHoverState);
    };

    resultDiv.addEventListener("pointerenter", (e) => {
      pointerInside = true;
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (rafId === null) rafId = requestAnimationFrame(updateHoverState);
    });

    resultDiv.addEventListener("pointermove", (e) => {
      if (pointerInside) {
        mouseX = e.clientX;
        mouseY = e.clientY;
      }
    });

    resultDiv.addEventListener("pointerleave", () => {
      pointerInside = false;
      clearHover();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }

  setupZoomHandlers();
  setup3DHandlers();
  setupSolverModeHandlers();
  const settingsElements: SettingsElements = setupSettingsInputs();
  setupActionButtons();
  setupTraceAndAnimation();
  setupSidebarResize();
  setupResultHover();

  return { computePath, settingsElements };
}

function calculateMinSidebarWidth(): number {
  const logoElement = document.getElementById("nullStateMessage") as HTMLElement | null;
  const topResultContainer = document.getElementById("topResult") as HTMLElement | null;
  if (!logoElement || !topResultContainer) return 375;

  const style = window.getComputedStyle(topResultContainer);
  const measurementDiv = Object.assign(document.createElement("div"), { textContent: logoElement.textContent || "" });
  Object.assign(measurementDiv.style, {
    position: "absolute",
    visibility: "hidden",
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    whiteSpace: "pre-wrap",
    fontSize: "12px",
  });
  document.body.appendChild(measurementDiv);
  const logoWidth = measurementDiv.getBoundingClientRect().width;
  document.body.removeChild(measurementDiv);

  return Math.max(375, Math.min(logoWidth + 60, 400));
}
