import {
  getGeometryState,
  getObjectiveState,
  getSolverState,
  mutateGeometryState,
  mutateObjectiveState,
  mutateSolverState,
  SolverMode,
} from "./state";
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
import { CanvasManager } from "../ui/canvasManager";
import { UIManager } from "../ui/uiManager";

export interface ShareSettings {
  alphaMax?: number;
  maxitIPM?: number;
  pdhgEta?: number;
  pdhgTau?: number;
  maxitPDHG?: number;
  pdhgIneqMode?: boolean;
  centralPathIter?: number;
  objectiveAngleStep?: number;
}

export interface ShareState {
  vertices: { x: number; y: number }[];
  objective: { x: number; y: number } | null;
  solverMode: string;
  settings: ShareSettings;
}

const COMPACT_KEYS = {
  vertices: 'v',
  objective: 'o',
  solverMode: 's',
  settings: 'g',

  x: 'x',
  y: 'y',
  
  alphaMax: 'a',
  maxitIPM: 'i',
  pdhgEta: 'e',
  pdhgTau: 't',
  maxitPDHG: 'p',
  pdhgIneqMode: 'm',
  centralPathIter: 'c',
  objectiveAngleStep: 'r'
} as const;

const FULL_KEYS = Object.fromEntries(
  Object.entries(COMPACT_KEYS).map(([full, compact]) => [compact, full])
) as Record<string, string>;

function compactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => compactObject(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const compactKey = COMPACT_KEYS[key as keyof typeof COMPACT_KEYS] || key;
    result[compactKey] = compactObject(value);
  }
  return result as T;
}

function expandObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => expandObject(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = FULL_KEYS[key] || key;
    result[fullKey] = expandObject(value);
  }
  return result as T;
}

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
    const geometryState = getGeometryState();
    const objectiveState = getObjectiveState();
    const solverState = getSolverState();
    const settings: ShareSettings = {};
    
    switch (solverState.solverMode) {
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
      vertices: geometryState.vertices,
      objective: objectiveState.objectiveVector,
      solverMode: solverState.solverMode,
      settings
    };
    
    // Compact the data before serializing
    const compactData = compactObject(data);
    const json = JSON.stringify(compactData);
    const crushed = JSONCrush.crush(json);
    const encoded = encodeURIComponent(crushed);
    return `${window.location.origin}${window.location.pathname}?s=${encoded}`;
  }

  function loadStateFromObject(obj: ShareState): void {
    if (!obj) return;
    
    const expandedObj = expandObject(obj) as ShareState;
    
    if (Array.isArray(expandedObj.vertices)) {
      const mappedVertices = expandedObj.vertices.map((v: PointXY) => ({ x: v.x, y: v.y }));
      mutateGeometryState((draft) => {
        draft.vertices = mappedVertices;
        draft.polygonComplete = mappedVertices.length > 2;
      });
    }
    
    if (expandedObj.objective) {
      mutateObjectiveState((draft) => {
        draft.objectiveVector = { x: expandedObj.objective!.x, y: expandedObj.objective!.y };
      });
    }
    
    if (expandedObj.solverMode) {
      mutateSolverState((draft) => {
        draft.solverMode = expandedObj.solverMode as SolverMode;
      });
    }
    
    const geometryState = getGeometryState();
    const objectiveState = getObjectiveState();
    const solverState = getSolverState();
    
    const settings = expandedObj.settings || {};

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
      const value = settings[config.key as keyof ShareSettings];
      if (value !== undefined) {
        if (config.type === 'slider') {
          updateSliderAndDisplay(config.id, config.displayId!, value as number, config.decimals!);
        } else {
          updateInputValue(config.id, value);
        }
      }
    });
    
    uiManager.hideNullStateMessage();

    if (geometryState.polygonComplete && objectiveState.objectiveVector) {
      showElement("maximize");
      
      setButtonsEnabled({
        "iteratePathButton": solverState.solverMode !== "central",
        "ipmButton": solverState.solverMode !== "ipm",
        "simplexButton": solverState.solverMode !== "simplex",
        "pdhgButton": solverState.solverMode !== "pdhg",
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

    setElementDisplay("ipmSettings", solverState.solverMode === "ipm" ? "block" : "none");
    setElementDisplay("pdhgSettings", solverState.solverMode === "pdhg" ? "block" : "none");
    setElementDisplay("centralPathSettings", solverState.solverMode === "central" ? "block" : "none");

    uiManager.updateObjectiveDisplay();
    uiManager.updateSolverModeButtons();
    canvasManager.draw();

    if (geometryState.polygonComplete) {
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
