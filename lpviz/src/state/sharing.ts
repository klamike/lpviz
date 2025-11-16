import { getState, mutate, SolverMode } from "./store";
import type { PointXY } from "../solvers/utils/blas";
import JSONCrush from "jsoncrush";
import { updateSliderAndDisplay, updateInputValue, setButtonsEnabled, setElementDisplay, showElement } from "./utils";
import { ViewportManager } from "../ui/viewport";
import { LayoutManager } from "../ui/layout";

export interface ShareSettings {
  alphaMax?: number;
  maxitIPM?: number;
  pdhgEta?: number;
  pdhgTau?: number;
  maxitPDHG?: number;
  pdhgIneqMode?: boolean;
  centralPathIter?: number;
  objectiveAngleStep?: number;
  objectiveRotationSpeed?: number;
}

export interface ShareState {
  vertices: { x: number; y: number }[];
  objective: { x: number; y: number } | null;
  solverMode: string;
  settings: ShareSettings;
}

const KEYS: Record<string, string> = {
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
  objectiveRotationSpeed: "q",
};

const REVERSE_KEYS = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [v, k]));

function transformObject<T>(obj: T, keyMap: Record<string, string>): T {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformObject(item, keyMap)) as unknown as T;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[keyMap[key] || key] = transformObject(value, keyMap);
  }
  return result as T;
}

const compactObject = <T>(obj: T) => transformObject(obj, KEYS);
const expandObject = <T>(obj: T) => transformObject(obj, REVERSE_KEYS);

interface SettingsElements {
  [key: string]: HTMLInputElement;
}

export function createSharingHandlers(canvasManager: ViewportManager, uiManager: LayoutManager, settingsElements: SettingsElements, sendPolytope: () => void) {
  function generateShareLink(): string {
    const { vertices, objectiveVector, solverMode } = getState();
    const settings: ShareSettings = {};

    switch (solverMode) {
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
    settings.objectiveAngleStep = parseFloat(settingsElements.objectiveAngleStepSlider.value);
    settings.objectiveRotationSpeed = parseFloat(settingsElements.objectiveRotationSpeedSlider.value);

    const data: ShareState = {
      vertices,
      objective: objectiveVector,
      solverMode,
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
      const mappedVertices = expandedObj.vertices.map((v: PointXY) => ({
        x: v.x,
        y: v.y,
      }));
      mutate((draft) => {
        draft.vertices = mappedVertices;
        draft.polytopeComplete = mappedVertices.length > 2;
      });
    }

    if (expandedObj.objective) {
      mutate((draft) => {
        draft.objectiveVector = {
          x: expandedObj.objective!.x,
          y: expandedObj.objective!.y,
        };
      });
    }

    if (expandedObj.solverMode) {
      mutate((draft) => {
        draft.solverMode = expandedObj.solverMode as SolverMode;
      });
    }

    const { polytopeComplete, objectiveVector: objective, solverMode } = getState();
    const settings = expandedObj.settings || {};

    const sliders: Array<[keyof ShareSettings, string, string, number]> = [
      ["alphaMax", "alphaMaxSlider", "alphaMaxValue", 3],
      ["pdhgEta", "pdhgEtaSlider", "pdhgEtaValue", 3],
      ["pdhgTau", "pdhgTauSlider", "pdhgTauValue", 3],
      ["centralPathIter", "centralPathIterSlider", "centralPathIterValue", 0],
      ["objectiveAngleStep", "objectiveAngleStepSlider", "objectiveAngleStepValue", 2],
      ["objectiveRotationSpeed", "objectiveRotationSpeedSlider", "objectiveRotationSpeedValue", 1],
    ];

    const inputs: Array<[keyof ShareSettings, string]> = [
      ["maxitIPM", "maxitInput"],
      ["maxitPDHG", "maxitInputPDHG"],
      ["pdhgIneqMode", "pdhgIneqMode"],
    ];

    sliders.forEach(([key, id, displayId, decimals]) => {
      const value = settings[key];
      if (value !== undefined) updateSliderAndDisplay(id, displayId, value as number, decimals);
    });

    inputs.forEach(([key, id]) => {
      const value = settings[key];
      if (value !== undefined) updateInputValue(id, value);
    });

    uiManager.hideNullStateMessage();

    if (polytopeComplete && objective) {
      showElement("maximize");

      setButtonsEnabled({
        iteratePathButton: solverMode !== "central",
        ipmButton: solverMode !== "ipm",
        simplexButton: solverMode !== "simplex",
        pdhgButton: solverMode !== "pdhg",
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

    setElementDisplay("ipmSettings", solverMode === "ipm" ? "block" : "none");
    setElementDisplay("pdhgSettings", solverMode === "pdhg" ? "block" : "none");
    setElementDisplay("centralPathSettings", solverMode === "central" ? "block" : "none");

    uiManager.updateObjectiveDisplay();
    uiManager.updateSolverModeButtons();
    canvasManager.draw();

    if (polytopeComplete) {
      sendPolytope();
    }
  }

  function setupShareButton(): void {
    const shareButton = document.getElementById("shareButton") as HTMLButtonElement | null;
    shareButton?.addEventListener("click", () => {
      const url = generateShareLink();
      window.prompt("Share this link:", url);
    });
  }

  setupShareButton();

  return { loadStateFromObject, generateShareLink };
}
