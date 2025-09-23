import JSONCrush from "jsoncrush";
import { PointXY } from "../types/arrays";
import { CanvasManager } from "../ui/canvasManager";
import { UIManager } from "../ui/uiManager";
import {
  getElement,
  setButtonsEnabled,
  setElementDisplay,
  showElement,
  updateInputValue,
  updateSliderAndDisplay,
} from "../utils/uiHelpers";
import { SolverMode, state } from "./state";

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
  vertices: "v",
  objective: "o",
  solverMode: "s",
  settings: "g",

  x: "x",
  y: "y",

  alphaMax: "a",
  maxitIPM: "i",
  pdhgEta: "e",
  pdhgTau: "t",
  maxitPDHG: "p",
  pdhgIneqMode: "m",
  centralPathIter: "c",
  objectiveAngleStep: "r",
} as const;

const FULL_KEYS = Object.fromEntries(
  Object.entries(COMPACT_KEYS).map(([full, compact]) => [compact, full]),
) as Record<string, string>;

function compactObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(compactObject);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const compactKey = COMPACT_KEYS[key as keyof typeof COMPACT_KEYS] || key;
    result[compactKey] = compactObject(value);
  }
  return result;
}

function expandObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(expandObject);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = FULL_KEYS[key] || key;
    result[fullKey] = expandObject(value);
  }
  return result;
}

interface SettingsElements {
  [key: string]: HTMLInputElement;
}

export function createSharingHandlers(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  settingsElements: SettingsElements,
  sendPolytope: () => void,
) {
  function generateShareLink(): string {
    const settings: ShareSettings = {};

    switch (state.solverMode) {
      case "ipm":
        settings.alphaMax = parseFloat(settingsElements.alphaMaxSlider.value);
        settings.maxitIPM = parseInt(settingsElements.maxitInput.value, 10);
        break;
      case "pdhg":
        settings.pdhgEta = parseFloat(settingsElements.pdhgEtaSlider.value);
        settings.pdhgTau = parseFloat(settingsElements.pdhgTauSlider.value);
        settings.maxitPDHG = parseInt(
          settingsElements.maxitInputPDHG.value,
          10,
        );
        settings.pdhgIneqMode = settingsElements.pdhgIneqMode.checked;
        break;
      case "central":
        settings.centralPathIter = parseInt(
          settingsElements.centralPathIterSlider.value,
          10,
        );
        break;
    }

    const data: ShareState = {
      vertices: state.vertices,
      objective: state.objectiveVector,
      solverMode: state.solverMode,
      settings,
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
      state.vertices = expandedObj.vertices.map((v: PointXY) => ({
        x: v.x,
        y: v.y,
      }));
      state.polygonComplete = state.vertices.length > 2;
    }

    if (expandedObj.objective) {
      state.objectiveVector = {
        x: expandedObj.objective.x,
        y: expandedObj.objective.y,
      };
    }

    if (expandedObj.solverMode) {
      state.solverMode = expandedObj.solverMode as SolverMode;
    }

    const settings = expandedObj.settings || {};

    const settingsConfig = [
      {
        key: "alphaMax",
        type: "slider",
        id: "alphaMaxSlider",
        displayId: "alphaMaxValue",
        decimals: 3,
      },
      { key: "maxitIPM", type: "input", id: "maxitInput" },
      {
        key: "pdhgEta",
        type: "slider",
        id: "pdhgEtaSlider",
        displayId: "pdhgEtaValue",
        decimals: 3,
      },
      {
        key: "pdhgTau",
        type: "slider",
        id: "pdhgTauSlider",
        displayId: "pdhgTauValue",
        decimals: 3,
      },
      { key: "maxitPDHG", type: "input", id: "maxitInputPDHG" },
      { key: "pdhgIneqMode", type: "input", id: "pdhgIneqMode" },
      {
        key: "centralPathIter",
        type: "slider",
        id: "centralPathIterSlider",
        displayId: "centralPathIterValue",
        decimals: 0,
      },
      {
        key: "objectiveAngleStep",
        type: "slider",
        id: "objectiveAngleStepSlider",
        displayId: "objectiveAngleStepValue",
        decimals: 2,
      },
    ];

    settingsConfig.forEach((config) => {
      const value = settings[config.key as keyof ShareSettings];
      if (value !== undefined) {
        if (config.type === "slider") {
          updateSliderAndDisplay(
            config.id,
            config.displayId!,
            value as number,
            config.decimals!,
          );
        } else {
          updateInputValue(config.id, value);
        }
      }
    });

    uiManager.hideNullStateMessage();

    if (state.polygonComplete && state.objectiveVector) {
      showElement("maximize");

      setButtonsEnabled({
        iteratePathButton: state.solverMode !== "central",
        ipmButton: state.solverMode !== "ipm",
        simplexButton: state.solverMode !== "simplex",
        pdhgButton: state.solverMode !== "pdhg",
        traceButton: true,
        zoomButton: true,
      });
      uiManager.updateSolverModeButtons();
    } else {
      setButtonsEnabled({
        traceButton: false,
      });
      uiManager.updateSolverModeButtons();
    }

    setElementDisplay(
      "ipmSettings",
      state.solverMode === "ipm" ? "block" : "none",
    );
    setElementDisplay(
      "pdhgSettings",
      state.solverMode === "pdhg" ? "block" : "none",
    );
    setElementDisplay(
      "centralPathSettings",
      state.solverMode === "central" ? "block" : "none",
    );

    uiManager.updateObjectiveDisplay();
    uiManager.updateSolverModeButtons();
    canvasManager.draw();

    if (state.polygonComplete) {
      sendPolytope();
    }
  }

  function setupShareButton(): void {
    getElement<HTMLButtonElement>("shareButton").addEventListener(
      "click",
      () => {
        const url = generateShareLink();
        window.prompt("Share this link:", url);
      },
    );
  }

  setupShareButton();

  return { loadStateFromObject, generateShareLink };
}
