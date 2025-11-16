import type { State } from "../state/store";
import type { SolverMode } from "../state/types";
import type { ResultRenderPayload } from "../types/resultPayload";
import { hasPolytopeLines, hasPolytopeVertices } from "../types/problem";
import type { SolverWorkerPayload, SolverWorkerSuccessResponse } from "../workers/solverWorkerTypes";
import { applyCentralPathResult, applyIPMResult, applyPDHGResult, applySimplexResult } from "../workers/solverService";

export type SettingsElements = Record<string, HTMLInputElement>;

export interface SolverDefinition {
  mode: SolverMode;
  buttonId: string;
  settingsPanelId?: string;
  buildRequest: (state: State, settings: SettingsElements) => SolverWorkerPayload | null;
  applyResult: (
    response: SolverWorkerSuccessResponse,
    settings: SettingsElements,
    updateResult: (payload: ResultRenderPayload) => void,
  ) => void;
}

type BaseRequest = {
  objective: [number, number];
  lines: NonNullable<State["polytope"]>["lines"];
};

function createBaseRequest(state: State): BaseRequest | null {
  if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
    return null;
  }
  return {
    objective: [state.objectiveVector.x, state.objectiveVector.y],
    lines: state.polytope.lines,
  };
}

function parseNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const SOLVER_DEFINITIONS: SolverDefinition[] = [
  {
    mode: "central",
    buttonId: "iteratePathButton",
    settingsPanelId: "centralPathSettings",
    buildRequest: (state, settings) => {
      const base = createBaseRequest(state);
      if (!base || !state.polytope || !hasPolytopeVertices(state.polytope)) return null;
      return {
        solver: "central",
        vertices: state.polytope.vertices,
        lines: base.lines,
        objective: base.objective,
        niter: Math.max(1, parseInt(settings["centralPathIterSlider"].value, 10) || 1),
      };
    },
    applyResult: (response, settings, updateResult) => {
      if (response.solver !== "central") return;
      const angleStep = parseNumber(settings["objectiveAngleStepSlider"].value, 0.1);
      applyCentralPathResult(response.result, angleStep, updateResult);
    },
  },
  {
    mode: "ipm",
    buttonId: "ipmButton",
    settingsPanelId: "ipmSettings",
    buildRequest: (state, settings) => {
      const base = createBaseRequest(state);
      if (!base) return null;
      return {
        solver: "ipm",
        lines: base.lines,
        objective: base.objective,
        alphaMax: parseNumber(settings["alphaMaxSlider"].value),
        maxit: Math.max(1, parseInt(settings["maxitInput"].value, 10) || 1),
      };
    },
    applyResult: (response, _settings, updateResult) => {
      if (response.solver !== "ipm") return;
      applyIPMResult(response.result, updateResult);
    },
  },
  {
    mode: "simplex",
    buttonId: "simplexButton",
    buildRequest: (state) => {
      const base = createBaseRequest(state);
      if (!base) return null;
      return {
        solver: "simplex",
        lines: base.lines,
        objective: base.objective,
      };
    },
    applyResult: (response, _settings, updateResult) => {
      if (response.solver !== "simplex") return;
      applySimplexResult(response.result, updateResult);
    },
  },
  {
    mode: "pdhg",
    buttonId: "pdhgButton",
    settingsPanelId: "pdhgSettings",
    buildRequest: (state, settings) => {
      const base = createBaseRequest(state);
      if (!base) return null;
      return {
        solver: "pdhg",
        lines: base.lines,
        objective: base.objective,
        ineq: settings["pdhgIneqMode"].checked,
        maxit: Math.max(1, parseInt(settings["maxitInputPDHG"].value, 10) || 1),
        eta: parseNumber(settings["pdhgEtaSlider"].value),
        tau: parseNumber(settings["pdhgTauSlider"].value),
      };
    },
    applyResult: (response, _settings, updateResult) => {
      if (response.solver !== "pdhg") return;
      applyPDHGResult(response.result, updateResult);
    },
  },
];

