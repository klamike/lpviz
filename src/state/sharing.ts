import JSONCrush from "jsoncrush";
import { PointXY } from "../types/arrays";
import { pointCentroid } from "../utils/math2d";
import { CanvasManager } from "../ui/canvasManager";
import { SolverMode, state } from "./state";
import {
  hideNullStateMessage,
  setSolverMode,
  updateSolverButtonStates,
} from "./uiActions";

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

export interface LoadOptions {
  canvasManager?: CanvasManager;
  sendPolytope?: () => void;
}

export function generateShareState(): ShareState {
  const settings: ShareSettings = {};

  switch (state.solverMode) {
    case "ipm":
      settings.alphaMax = state.solverSettings.ipmAlphaMax;
      settings.maxitIPM = state.solverSettings.ipmMaxIterations;
      break;
    case "pdhg":
      settings.pdhgEta = state.solverSettings.pdhgEta;
      settings.pdhgTau = state.solverSettings.pdhgTau;
      settings.maxitPDHG = state.solverSettings.pdhgMaxIterations;
      settings.pdhgIneqMode = state.solverSettings.pdhgIneqMode;
      break;
    case "central":
      settings.centralPathIter = state.solverSettings.centralPathSteps;
      settings.objectiveAngleStep = state.solverSettings.objectiveAngleStep;
      break;
  }

  return {
    vertices: state.vertices.map((v: PointXY) => ({ x: v.x, y: v.y })),
    objective: state.objectiveVector
      ? { x: state.objectiveVector.x, y: state.objectiveVector.y }
      : null,
    solverMode: state.solverMode,
    settings,
  };
}

export function generateShareLink(): string {
  const data = generateShareState();
  const compactData = compactObject(data);
  const json = JSON.stringify(compactData);
  const crushed = JSONCrush.crush(json);
  const encoded = encodeURIComponent(crushed);
  return `${window.location.origin}${window.location.pathname}?s=${encoded}`;
}

export function loadStateFromObject(
  obj: ShareState,
  options: LoadOptions = {},
): void {
  if (!obj) return;

  const expandedObj = expandObject(obj) as ShareState;

  if (Array.isArray(expandedObj.vertices)) {
    state.vertices = expandedObj.vertices.map((v: PointXY) => ({
      x: v.x,
      y: v.y,
    }));
    state.polygonComplete = state.vertices.length > 2;
    state.interiorPoint = state.polygonComplete
      ? pointCentroid(state.vertices)
      : null;
  }

  if (expandedObj.objective) {
    state.objectiveVector = {
      x: expandedObj.objective.x,
      y: expandedObj.objective.y,
    };
  } else {
    state.objectiveVector = null;
  }

  if (expandedObj.solverMode) {
    setSolverMode(expandedObj.solverMode as SolverMode);
  } else {
    updateSolverButtonStates();
  }

  const settings = expandedObj.settings || {};

  if (typeof settings.alphaMax === "number") {
    state.solverSettings.ipmAlphaMax = settings.alphaMax;
  }
  if (typeof settings.maxitIPM === "number") {
    state.solverSettings.ipmMaxIterations = settings.maxitIPM;
  }
  if (typeof settings.pdhgEta === "number") {
    state.solverSettings.pdhgEta = settings.pdhgEta;
  }
  if (typeof settings.pdhgTau === "number") {
    state.solverSettings.pdhgTau = settings.pdhgTau;
  }
  if (typeof settings.maxitPDHG === "number") {
    state.solverSettings.pdhgMaxIterations = settings.maxitPDHG;
  }
  if (typeof settings.pdhgIneqMode === "boolean") {
    state.solverSettings.pdhgIneqMode = settings.pdhgIneqMode;
  }
  if (typeof settings.centralPathIter === "number") {
    state.solverSettings.centralPathSteps = settings.centralPathIter;
  }
  if (typeof settings.objectiveAngleStep === "number") {
    state.solverSettings.objectiveAngleStep = settings.objectiveAngleStep;
  }

  if (state.vertices.length > 0 || state.objectiveVector) {
    hideNullStateMessage();
    state.uiButtons["traceButton"] = true;
    state.uiButtons["zoomButton"] = true;
  } else {
    state.uiButtons["traceButton"] = false;
    state.uiButtons["zoomButton"] = false;
  }

  updateSolverButtonStates();

  if (options.canvasManager) {
    options.canvasManager.draw();
  }

  if (state.polygonComplete && options.sendPolytope) {
    options.sendPolytope();
  }
}
