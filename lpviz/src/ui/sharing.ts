import { state, Settings, ShareState, SolverMode } from "../state/state";
import { PointXY } from "../types/arrays";
import JSONCrush from "jsoncrush";
import { 
  updateSliderAndDisplay, 
  updateInputValue, 
  setButtonsEnabled, 
  setElementDisplay, 
  showElement,
  getElement
} from "../utils/uiHelpers";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";

interface SettingsElements {
  [key: string]: HTMLInputElement;
}

export function createSharingHandlers(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  settingsElements: SettingsElements,
  sendPolytope: () => void
) {
  function generateShareLink(): string {
    const settings: Settings = {};
    
    switch (state.solverMode) {
      case "ipm":
        settings.alphaMax = parseFloat(settingsElements.alphaMaxSlider.value);
        settings.maxitIPM = parseInt(settingsElements.maxitInput.value, 10);
        break;
      case "pdhg":
        settings.pdhgEta = parseFloat(settingsElements.pdhgEtaSlider.value);
        settings.pdhgTau = parseFloat(settingsElements.pdhgTauSlider.value);
        settings.maxitPDHG = parseInt(settingsElements.maxitInputPDHG.value, 10);
        settings.pdhgIneqMode = settingsElements.pdhgIneqMode.checked;
        break;
      case "central":
        settings.centralPathIter = parseInt(settingsElements.centralPathIterSlider.value, 10);
        break;
    }
    
    const data: ShareState = {
      vertices: state.vertices,
      objective: state.objectiveVector,
      solverMode: state.solverMode,
      settings
    };
    
    const json = JSON.stringify(data);
    const crushed = JSONCrush.crush(json);
    const encoded = encodeURIComponent(crushed);
    return `${window.location.origin}${window.location.pathname}?s=${encoded}`;
  }

  function loadStateFromObject(obj: ShareState): void {
    if (!obj) return;
    
    if (Array.isArray(obj.vertices)) {
      state.vertices = obj.vertices.map((v: PointXY) => ({ x: v.x, y: v.y }));
      state.polygonComplete = state.vertices.length > 2;
    }
    
    if (obj.objective) {
      state.objectiveVector = { x: obj.objective.x, y: obj.objective.y };
    }
    
    if (obj.solverMode) {
      state.solverMode = obj.solverMode as SolverMode;
    }
    
    const settings = obj.settings || {};

    const settingsConfig = [
      { key: 'alphaMax', type: 'slider', id: 'alphaMaxSlider', displayId: 'alphaMaxValue', decimals: 3 },
      { key: 'maxitIPM', type: 'input', id: 'maxitInput' },
      { key: 'pdhgEta', type: 'slider', id: 'pdhgEtaSlider', displayId: 'pdhgEtaValue', decimals: 3 },
      { key: 'pdhgTau', type: 'slider', id: 'pdhgTauSlider', displayId: 'pdhgTauValue', decimals: 3 },
      { key: 'maxitPDHG', type: 'input', id: 'maxitInputPDHG' },
      { key: 'pdhgIneqMode', type: 'input', id: 'pdhgIneqMode' },
      { key: 'centralPathIter', type: 'slider', id: 'centralPathIterSlider', displayId: 'centralPathIterValue', decimals: 0 },
      { key: 'objectiveAngleStep', type: 'slider', id: 'objectiveAngleStepSlider', displayId: 'objectiveAngleStepValue', decimals: 2 }
    ];
    
    settingsConfig.forEach(config => {
      const value = settings[config.key as keyof Settings];
      if (value !== undefined) {
        if (config.type === 'slider') {
          updateSliderAndDisplay(config.id, config.displayId!, value as number, config.decimals!);
        } else {
          updateInputValue(config.id, value);
        }
      }
    });
    
    uiManager.hideNullStateMessage();

    if (state.polygonComplete && state.objectiveVector) {
      showElement("maximize");
      
      setButtonsEnabled({
        "iteratePathButton": state.solverMode !== "central",
        "ipmButton": state.solverMode !== "ipm",
        "simplexButton": state.solverMode !== "simplex",
        "pdhgButton": state.solverMode !== "pdhg",
        "traceButton": true,
        "zoomButton": true
      });
      uiManager.updateSolverModeButtons();
    } else {
      setButtonsEnabled({
        "traceButton": false
      });
      uiManager.updateSolverModeButtons();
    }

    setElementDisplay("ipmSettings", state.solverMode === "ipm" ? "block" : "none");
    setElementDisplay("pdhgSettings", state.solverMode === "pdhg" ? "block" : "none");
    setElementDisplay("centralPathSettings", state.solverMode === "central" ? "block" : "none");

    uiManager.updateObjectiveDisplay();
    uiManager.updateSolverModeButtons();
    canvasManager.draw();

    if (state.polygonComplete) {
      sendPolytope();
    }
  }

  function setupShareButton(): void {
    getElement<HTMLButtonElement>("shareButton").addEventListener("click", () => {
      const url = generateShareLink();
      window.prompt("Share this link:", url);
    });
  }

  setupShareButton();

  return { loadStateFromObject, generateShareLink };
}
