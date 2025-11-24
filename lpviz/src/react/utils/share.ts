import JSONCrush from "jsoncrush";
import { getState, mutate } from "../../state/store";

const KEYS: Record<string, string> = {
  vertices: "v",
  objective: "o",
  solverMode: "s",
  settings: "g",
  x: "x",
  y: "y",
  ipmAlphaMax: "a",
  ipmMaxIterations: "i",
  pdhgEta: "e",
  pdhgTau: "t",
  pdhgMaxIterations: "p",
  pdhgIneqMode: "m",
  centralPathSteps: "c",
  objectiveAngleStep: "r",
  objectiveRotationSpeed: "q",
};

const transformObject = <T>(obj: T, keyMap: Record<string, string>): T => {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => transformObject(item, keyMap)) as unknown as T;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[keyMap[key] || key] = transformObject(value, keyMap);
  }
  return result as T;
};

/**
 * Builds a shareable URL using the compact key scheme from the legacy app.
 * Currently captures vertices, objective vector, and solver mode.
 * TODO: add solver settings + rotation/share flags once React controls persist them in state.
 */
export function buildShareLink() {
  const {
    vertices,
    objectiveVector,
    solverMode,
    ipmAlphaMax,
    ipmMaxIterations,
    pdhgEta,
    pdhgTau,
    pdhgMaxIterations,
    pdhgIneqMode,
    centralPathSteps,
    objectiveAngleStep,
    objectiveRotationSpeed,
  } = getState();
  const payload = {
    vertices,
    objective: objectiveVector,
    solverMode,
    settings: {
      ipmAlphaMax,
      ipmMaxIterations,
      pdhgEta,
      pdhgTau,
      pdhgMaxIterations,
      pdhgIneqMode,
      centralPathSteps,
      objectiveAngleStep,
      objectiveRotationSpeed,
    },
  };
  const compact = transformObject(payload, KEYS);
  const json = JSON.stringify(compact);
  const crushed = JSONCrush.crush(json);
  const encoded = encodeURIComponent(crushed);
  return `${window.location.origin}${window.location.pathname}?s=${encoded}`;
}

const REVERSE_KEYS = Object.fromEntries(
  Object.entries(KEYS).map(([k, v]) => [v, k])
);

type ShareState = {
  vertices?: { x: number; y: number }[];
  objective?: { x: number; y: number } | null;
  solverMode?: string;
  settings?: Record<string, unknown>;
};

/**
 * Reads ?s= param and hydrates basic state (vertices, objective, solverMode).
 * Returns true if a state was loaded. Settings are currently ignored until
 * React controls persist them in global state.
 */
export function loadStateFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("s")) return false;
  try {
    const crushed = decodeURIComponent(params.get("s") ?? "");
    const json = JSONCrush.uncrush(crushed);
    const compactObj = JSON.parse(json) as ShareState;
    const expanded = transformObject(compactObj, REVERSE_KEYS) as ShareState;

    mutate((draft) => {
      if (expanded.vertices) {
        draft.vertices = expanded.vertices;
        draft.polytopeComplete = expanded.vertices.length > 2;
      }
      if (expanded.objective) {
        draft.objectiveVector = {
          x: expanded.objective.x,
          y: expanded.objective.y,
        };
      }
      if (expanded.solverMode) {
        draft.solverMode = expanded.solverMode as typeof draft.solverMode;
      }
      const settings = expanded.settings || {};
      if (typeof settings.ipmAlphaMax === "number") {
        draft.ipmAlphaMax = settings.ipmAlphaMax;
      }
      if (typeof settings.ipmMaxIterations === "number") {
        draft.ipmMaxIterations = settings.ipmMaxIterations;
      }
      if (typeof settings.pdhgEta === "number")
        draft.pdhgEta = settings.pdhgEta;
      if (typeof settings.pdhgTau === "number")
        draft.pdhgTau = settings.pdhgTau;
      if (typeof settings.pdhgMaxIterations === "number") {
        draft.pdhgMaxIterations = settings.pdhgMaxIterations;
      }
      if (typeof settings.pdhgIneqMode === "boolean") {
        draft.pdhgIneqMode = settings.pdhgIneqMode;
      }
      if (typeof settings.centralPathSteps === "number") {
        draft.centralPathSteps = settings.centralPathSteps;
      }
      if (typeof settings.objectiveAngleStep === "number") {
        draft.objectiveAngleStep = settings.objectiveAngleStep;
      }
      if (typeof settings.objectiveRotationSpeed === "number") {
        draft.objectiveRotationSpeed = settings.objectiveRotationSpeed;
      }
    });
    return true;
  } catch (err) {
    console.error("Failed to load shared state", err);
    return false;
  }
}
