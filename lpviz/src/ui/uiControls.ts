import { state, SolverMode, handleStepSizeChange, resetTraceState } from "../state/state";
import { start3DTransition } from "../utils/transitions";
import {
  getElement,
  showElement,
  hideElement,
  adjustFontSize,
  adjustLogoFontSize,
  adjustTerminalHeight,
  calculateMinSidebarWidth,
  getElementChecked,
} from "../utils/uiHelpers";
import { prepareAnimationInterval } from "../state/state";
import {
  applyCentralPathResult,
  applyIPMResult,
  applyPDHGResult,
  applySimplexResult,
} from "../services/solverService";
import { isPolygonConvex } from "../utils/math2d";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";
import {
  SolverWorkerPayload,
  SolverWorkerResponse,
  SolverWorkerSuccessResponse,
} from "../workers/solverWorkerTypes";

const solverWorker = new Worker(new URL("../workers/solverWorker.ts", import.meta.url), {
  type: "module",
});

let solverWorkerMessageId = 0;
const pendingSolverRequests = new Map<
  number,
  {
    resolve: (value: SolverWorkerSuccessResponse) => void;
    reject: (reason?: unknown) => void;
  }
>();

solverWorker.addEventListener("message", (event: MessageEvent<SolverWorkerResponse>) => {
  const data = event.data;
  const pending = pendingSolverRequests.get(data.id);
  if (!pending) return;
  pendingSolverRequests.delete(data.id);
  if (data.success) {
    pending.resolve(data);
  } else {
    pending.reject(new Error(data.error));
  }
});

function runSolverWorker(request: SolverWorkerPayload): Promise<SolverWorkerSuccessResponse> {
  return new Promise((resolve, reject) => {
    const id = ++solverWorkerMessageId;
    pendingSolverRequests.set(id, { resolve, reject });
    solverWorker.postMessage({ id, ...request });
  });
}

interface SettingsElements {
  [key: string]: HTMLInputElement;
}

export function setupUIControls(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  updateResult: (html: string) => void
): SettingsElements {
  function setupZoomHandlers() {
    uiManager.zoomButton?.addEventListener("click", () => {
      if (state.vertices.length === 0) return;
      
      const bounds = state.vertices.reduce(
        (acc, v) => ({
          minX: Math.min(acc.minX, v.x),
          maxX: Math.max(acc.maxX, v.x),
          minY: Math.min(acc.minY, v.y),
          maxY: Math.max(acc.maxY, v.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      
      const polyWidth = bounds.maxX - bounds.minX;
      const polyHeight = bounds.maxY - bounds.minY;
      const centroid = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
      
      canvasManager.offset.x = -centroid.x;
      canvasManager.offset.y = -centroid.y;
      
      const padding = 50;
      const sidebarWidth = getElement("sidebar")?.offsetWidth ?? 0;
      const availWidth = (window.innerWidth - sidebarWidth) - 2 * padding;
      const availHeight = window.innerHeight - 2 * padding;
      
      if (polyWidth > 0 && polyHeight > 0) {
        canvasManager.scaleFactor = Math.min(
          availWidth / (polyWidth * canvasManager.gridSpacing),
          availHeight / (polyHeight * canvasManager.gridSpacing)
        );
      }
      
      canvasManager.centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
      canvasManager.centerY = window.innerHeight / 2;
      canvasManager.draw();
      uiManager.updateZoomButtonsState(canvasManager);
    });

    uiManager.unzoomButton?.addEventListener("click", () => {
      canvasManager.scaleFactor = 1;
      canvasManager.offset.x = 0;
      canvasManager.offset.y = 0;
      state.viewAngle.x = -1.15;
      state.viewAngle.y = 0.4;
      state.viewAngle.z = 0;
      canvasManager.draw();
      uiManager.updateZoomButtonsState(canvasManager);
    });
  }

  function setup3DHandlers() {
    uiManager.toggle3DButton?.addEventListener("click", () => {
      if (state.isTransitioning3D) return;
      start3DTransition(canvasManager, uiManager, !state.is3DMode);
    });
    
    uiManager.zScaleSlider?.addEventListener("input", () => {
      state.zScale = parseFloat(uiManager.zScaleSlider?.value || "0.1");
      uiManager.updateZScaleValue();
      if (state.is3DMode || state.isTransitioning3D) {
        canvasManager.draw();
      }
    });
  }
  
  function setupSolverModeHandlers() {
    const solverButtons = [
      { id: "iteratePathButton", mode: "central" as SolverMode, settings: "centralPathSettings" },
      { id: "ipmButton", mode: "ipm" as SolverMode, settings: "ipmSettings" },
      { id: "simplexButton", mode: "simplex" as SolverMode },
      { id: "pdhgButton", mode: "pdhg" as SolverMode, settings: "pdhgSettings" }
    ];
    
    const buttonElements = solverButtons.map(config => ({
      ...config,
      element: getElement<HTMLButtonElement>(config.id)
    }));
    
    buttonElements.forEach(({ element, mode, settings }) => {
      element.addEventListener("click", () => {
        state.solverMode = mode;
        
        if (state.rotateObjectiveMode) {
          resetTraceState();
          if (state.traceEnabled) {
            canvasManager.draw();
          }
        }
        
        buttonElements.forEach(btn => {
          btn.element.disabled = (btn.element === element);
        });
        
        ["ipmSettings", "pdhgSettings", "centralPathSettings"].forEach(hideElement);
        if (settings) {
          showElement(settings);
        }
      });
    });
  }

  function setupSliderWithDisplay(
    sliderId: string, 
    displayId: string, 
    decimalPlaces: number, 
    solverMode?: string,
    customCallback?: () => void
  ) {
    const slider = getElement<HTMLInputElement>(sliderId);
    const display = getElement<HTMLElement>(displayId);
    
    slider.addEventListener("input", () => {
      display.textContent = parseFloat(slider.value).toFixed(decimalPlaces);
      
      if (solverMode) {
        resetTraceState();
        if (state.traceEnabled) {
          canvasManager.draw();
        }
      }
      
      if (customCallback) {
        customCallback();
      } else if (solverMode && state.solverMode === solverMode) {
        computePath();
      }
    });
    
    return slider;
  }
  
  function setupInputWithSolverMode(inputId: string, solverMode: string, eventType: "input" | "change" = "input") {
    const input = getElement<HTMLInputElement>(inputId);
    input.addEventListener(eventType, () => {
      resetTraceState();
      if (state.traceEnabled) {
        canvasManager.draw();
      }
      
      if (state.solverMode === solverMode) computePath();
    });
    return input;
  }

  function setupSettingsInputs() {
    const sliders = [
      { id: "alphaMaxSlider", displayId: "alphaMaxValue", decimals: 3, solver: "ipm" },
      { id: "pdhgEtaSlider", displayId: "pdhgEtaValue", decimals: 3, solver: "pdhg" },
      { id: "pdhgTauSlider", displayId: "pdhgTauValue", decimals: 3, solver: "pdhg" },
      { id: "centralPathIterSlider", displayId: "centralPathIterValue", decimals: 0, solver: "central" }
    ];
    
    const sliderElements = sliders.reduce((acc, config) => {
      acc[config.id] = setupSliderWithDisplay(config.id, config.displayId, config.decimals, config.solver);
      return acc;
    }, {} as Record<string, HTMLInputElement>);
    
    // Special callback for objective angle step
    const objectiveAngleStepSlider = setupSliderWithDisplay("objectiveAngleStepSlider", "objectiveAngleStepValue", 2, undefined, () => {
      if (state.traceEnabled) {
        handleStepSizeChange();
        canvasManager.draw();
      }
    });
    
    const inputs = [
      { id: "maxitInput", solver: "ipm" },
      { id: "maxitInputPDHG", solver: "pdhg" },
      { id: "pdhgIneqMode", solver: "pdhg", eventType: "change" as const }
    ];
    
    const inputElements = inputs.reduce((acc, config) => {
      acc[config.id] = setupInputWithSolverMode(config.id, config.solver, config.eventType);
      return acc;
    }, {} as Record<string, HTMLInputElement>);
    
    return { 
      ...sliderElements, 
      objectiveAngleStepSlider, 
      ...inputElements 
    } as Record<string, HTMLInputElement>;
  }
  
  function setupActionButtons() {
    getElement<HTMLButtonElement>("traceButton").addEventListener("click", () => {
      computePath();
      state.iteratePathComputed = true;
    });

    const startRotateButton = getElement<HTMLButtonElement>("startRotateObjectiveButton");
    const stopRotateButton = getElement<HTMLButtonElement>("stopRotateObjectiveButton");
    const rotationSettings = getElement<HTMLElement>("objectiveRotationSettings");

    startRotateButton.addEventListener("click", () => {
      state.rotateObjectiveMode = true;
      resetTraceState();
      
      if (!state.objectiveVector) {
        state.objectiveVector = { x: 1, y: 0 };
        uiManager.updateObjectiveDisplay();
      }
      
      if (state.animationIntervalId !== null) {
        clearInterval(state.animationIntervalId);
        state.animationIntervalId = null;
      }
      
      rotationSettings.style.display = "block";
      uiManager.updateSolverModeButtons();
      computeAndRotate();
    });
    
    stopRotateButton.addEventListener("click", () => {
      state.rotateObjectiveMode = false;
      state.totalRotationAngle = 0;
      rotationSettings.style.display = "none";
      uiManager.updateSolverModeButtons();
    });
  }
  
  function setupTraceAndAnimation() {
    const traceCheckbox = getElement<HTMLInputElement>("traceCheckbox");
    traceCheckbox.checked = false;
    traceCheckbox.addEventListener("change", () => {
      state.traceEnabled = traceCheckbox.checked;
      if (!state.traceEnabled) {
        resetTraceState();
        canvasManager.draw();
      } else {
        handleStepSizeChange();
      }
    });

    const animateButton = getElement<HTMLButtonElement>("animateButton");
    const replaySpeedSlider = getElement<HTMLInputElement>("replaySpeedSlider");
    
    animateButton.addEventListener("click", () => {
      if (state.rotateObjectiveMode) return;
      
      if (state.animationIntervalId !== null) {
        clearInterval(state.animationIntervalId);
        state.animationIntervalId = null;
      }
      
      const intervalTime = parseInt(replaySpeedSlider.value, 10) || 500;
      const iteratesToAnimate = [...state.originalIteratePath];
      state.iteratePath = [];
      state.highlightIteratePathIndex = null;
      canvasManager.draw();
      
      let currentIndex = 0;
      const intervalId = window.setInterval(() => {
        if (state.animationIntervalId !== intervalId) return;
        
        if (currentIndex >= iteratesToAnimate.length) {
          clearInterval(intervalId);
          state.animationIntervalId = null;
          return;
        }
        
        state.iteratePath.push(iteratesToAnimate[currentIndex]);
        state.highlightIteratePathIndex = currentIndex;
        currentIndex++;
        canvasManager.draw();
      }, intervalTime);
      
      state.animationIntervalId = intervalId;
    });
  }

  async function computePath() {
    prepareAnimationInterval();
    if (!state.objectiveVector || !state.computedLines?.length) {
      return;
    }
    const objective: [number, number] = [state.objectiveVector.x, state.objectiveVector.y];
    let request: SolverWorkerPayload | null = null;
    
    switch (state.solverMode) {
      case "ipm":
        request = {
          solver: "ipm",
          lines: state.computedLines,
          objective,
          alphaMax: parseFloat(settingsElements.alphaMaxSlider.value),
          maxit: parseInt(settingsElements.maxitInput.value, 10),
        };
        break;
      case "simplex":
        request = {
          solver: "simplex",
          lines: state.computedLines,
          objective,
        };
        break;
      case "pdhg":
        request = {
          solver: "pdhg",
          lines: state.computedLines,
          objective,
          ineq: getElementChecked("pdhgIneqMode"),
          maxit: parseInt(settingsElements.maxitInputPDHG.value, 10),
          eta: parseFloat(settingsElements.pdhgEtaSlider.value),
          tau: parseFloat(settingsElements.pdhgTauSlider.value),
        };
        break;
      default: // central
        if (!state.computedVertices?.length) return;
        request = {
          solver: "central",
          vertices: state.computedVertices,
          lines: state.computedLines,
          objective,
          niter: parseInt(settingsElements.centralPathIterSlider.value, 10),
        };
        break;
    }
    if (!request) return;
    try {
      const response = await runSolverWorker(request);
      switch (response.solver) {
        case "ipm":
          applyIPMResult(response.result, updateResult);
          break;
        case "simplex":
          applySimplexResult(response.result, updateResult);
          break;
        case "pdhg":
          applyPDHGResult(response.result, updateResult);
          break;
        case "central":
          applyCentralPathResult(
            response.result,
            parseFloat(settingsElements.objectiveAngleStepSlider.value),
            updateResult
          );
          break;
      }
      uiManager.updateSolverModeButtons();
    } catch (error) {
      console.error("Error in computePath:", error);
    }
  }

  async function computeAndRotate() {
    const MIN_WAIT = 30;
    
    if (!isPolygonConvex(state.vertices)) {
      setTimeout(computeAndRotate, MIN_WAIT);
      return;
    }
    
    if (!state.rotateObjectiveMode) return;
    
    const angleStep = parseFloat(settingsElements.objectiveAngleStepSlider.value);
    const angle = Math.atan2(state.objectiveVector!.y, state.objectiveVector!.x);
    const magnitude = Math.hypot(state.objectiveVector!.x, state.objectiveVector!.y);
    
    state.objectiveVector = {
      x: magnitude * Math.cos(angle + angleStep),
      y: magnitude * Math.sin(angle + angleStep),
    };
    
    if (state.traceEnabled) {
      state.totalRotationAngle += angleStep;
    }
    
    uiManager.updateObjectiveDisplay();
    canvasManager.draw();
    
    if (state.polygonComplete && state.computedLines?.length > 0) {
      try {
        await computePath();
      } catch (error) {
        console.error("Error in computePath:", error);
      }
    }
    
    if (state.rotateObjectiveMode) {
      setTimeout(computeAndRotate, MIN_WAIT);
    }
  }
  
  function setupSidebarResize() {
    const sidebar = getElement<HTMLElement>("sidebar");
    const handle = getElement<HTMLElement>("sidebarHandle");
    let isResizing = false;
    
    const minSidebarWidth = calculateMinSidebarWidth();
    
    handle.addEventListener("mousedown", (e) => {
      isResizing = true;
      e.preventDefault();
    });
    
    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      
      const newWidth = Math.max(minSidebarWidth, Math.min(e.clientX, 1000));
      sidebar.style.width = `${newWidth}px`;
      handle.style.left = `${newWidth}px`;
      canvasManager.centerX = newWidth + (window.innerWidth - newWidth) / 2;
      canvasManager.draw();
      adjustFontSize();
      adjustLogoFontSize();
      adjustTerminalHeight();
    });
    
    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        adjustFontSize();
        adjustLogoFontSize();
        adjustTerminalHeight();
      }
    });
  }
  
  function setupResultHover() {
    let mouseX = 0;
    let mouseY = 0;
    let currentHovered: HTMLElement | null = null;
    const resultDiv = getElement<HTMLElement>("result");
    
    function updateHoverState() {
      const el = document.elementFromPoint(mouseX, mouseY);
      
      if (el && el.classList.contains("iterate-item")) {
        if (currentHovered !== el) {
          if (currentHovered) {
            currentHovered.classList.remove("hover");
            currentHovered.dispatchEvent(new Event("mouseleave", { bubbles: true }));
          }
          el.classList.add("hover");
          el.dispatchEvent(new Event("mouseenter", { bubbles: true }));
          currentHovered = el as HTMLElement;
        }
      } else if (currentHovered) {
        currentHovered.classList.remove("hover");
        currentHovered.dispatchEvent(new Event("mouseleave", { bubbles: true }));
        currentHovered = null;
      }
    }
    
    document.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      updateHoverState();
    });
    
    resultDiv.addEventListener("scroll", updateHoverState);
  }

  setupZoomHandlers();
  setup3DHandlers();
  setupSolverModeHandlers();
  const settingsElements = setupSettingsInputs();
  setupActionButtons();
  setupTraceAndAnimation();
  setupSidebarResize();
  setupResultHover();

  return settingsElements;
}
