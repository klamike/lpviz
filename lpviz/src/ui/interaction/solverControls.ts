import type { SolverWorkerPayload, SolverWorkerSuccessResponse } from "../../solvers/worker/solverWorker";
import {
  applyCentralPathResult,
  applyIPMResult,
  applyPDHGResult,
  applySimplexResult,
  type ResultRenderPayload,
} from "../../solvers/worker/solverService";
import { hasPolytopeLines } from "../../solvers/utils/polytopeTypes";
import type { ShareSettings } from "../sharedState";
import type { ResultTextBlock } from "../resultPayload";
import { getState, type SolverMode, type State } from "../../state/store";
import type { SolverSettingUpdater } from "./runtimeTypes";

export type SolverControl = {
  mode: SolverMode;
  isSelectable: (state: State) => boolean;
  getRunBlock: (state: State) => ResultRenderPayload | null;
  collectShareSettings: () => ShareSettings;
  applySharedSettings: (settings: ShareSettings) => void;
  buildRequest: (state: State) => SolverWorkerPayload | null;
  applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => void;
};

export function createSolverControls({
  updateSolverSetting,
  hasUnboundedObjectiveDirection,
}: {
  updateSolverSetting: SolverSettingUpdater;
  hasUnboundedObjectiveDirection: (state: State) => boolean;
}): SolverControl[] {
  const createResultBlock = (className: ResultTextBlock["className"], text: string, index?: number): ResultTextBlock => ({
    className,
    text,
    index,
  });
  const createMessageResult = (header: string, message: string): ResultRenderPayload => ({
    type: "blocks",
    blocks: [
      createResultBlock("iterate-header", header),
      createResultBlock("iterate-item-nohover", message),
    ],
  });

  return [
    {
      mode: "central",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) &&
        (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded") &&
        !hasUnboundedObjectiveDirection(state),
      getRunBlock: (state: State): ResultRenderPayload | null => {
        const { polytope } = state;
        if (!hasPolytopeLines(polytope)) return null;
        if (polytope.kind === "empty") {
          return createMessageResult("No valid region", "Central Path requires a feasible region.");
        }
        if (hasUnboundedObjectiveDirection(state)) {
          return createMessageResult(
            "Solver unavailable",
            "Central Path is disabled when the objective points in an unbounded direction.",
          );
        }
        return null;
      },
      collectShareSettings: (): ShareSettings => ({
        centralPathIter: getState().solverSettings.centralPathIter,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.centralPathIter !== undefined) {
          updateSolverSetting("centralPathIter", settings.centralPathIter);
        }
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope) || !state.polytope) {
          return null;
        }
        return {
          solver: "central",
          vertices: state.polytope.vertices,
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          niter: Math.max(1, state.solverSettings.centralPathIter || 1),
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyCentralPathResult(response.result, updateResult);
      },
    },
    {
      mode: "ipm",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (state: State): ResultRenderPayload | null =>
        hasPolytopeLines(state.polytope) && state.polytope.kind === "empty"
          ? createMessageResult("No valid region", "IPM requires a feasible region.")
          : null,
      collectShareSettings: (): ShareSettings => {
        const s = getState().solverSettings;
        return {
          alphaMax: s.alphaMax,
          correctorThreshold: s.correctorThreshold,
          maxitIPM: s.maxitIPM,
          ipmColorByPhase: s.ipmColorByPhase,
        };
      },
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.alphaMax !== undefined) updateSolverSetting("alphaMax", settings.alphaMax);
        if (settings.correctorThreshold !== undefined) updateSolverSetting("correctorThreshold", settings.correctorThreshold);
        if (settings.maxitIPM !== undefined) updateSolverSetting("maxitIPM", settings.maxitIPM);
        if (settings.ipmColorByPhase !== undefined) updateSolverSetting("ipmColorByPhase", settings.ipmColorByPhase);
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        const s = state.solverSettings;
        return {
          solver: "ipm",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          alphaMax: s.alphaMax,
          correctorThreshold: s.correctorThreshold,
          maxit: Math.max(1, s.maxitIPM || 1),
          colorByPhase: s.ipmColorByPhase,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyIPMResult(response.result, updateResult);
      },
    },
    {
      mode: "simplex",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (state: State): ResultRenderPayload | null =>
        hasPolytopeLines(state.polytope) && state.polytope.kind === "empty"
          ? createMessageResult("No valid region", "Simplex requires a valid feasible region.")
          : null,
      collectShareSettings: (): ShareSettings => ({
        simplexDualMode: getState().solverSettings.simplexDualMode,
      }),
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.simplexDualMode !== undefined) updateSolverSetting("simplexDualMode", settings.simplexDualMode);
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        return {
          solver: "simplex",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          dual: state.solverSettings.simplexDualMode,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applySimplexResult(response.result, updateResult);
      },
    },
    {
      mode: "pdhg",
      isSelectable: (state: State) =>
        hasPolytopeLines(state.polytope) && (state.polytope.kind === "bounded" || state.polytope.kind === "unbounded"),
      getRunBlock: (): ResultRenderPayload | null => null,
      collectShareSettings: (): ShareSettings => {
        const s = getState().solverSettings;
        return {
          pdhgEta: s.pdhgEta,
          pdhgTau: s.pdhgTau,
          maxitPDHG: s.maxitPDHG,
          pdhgIneqMode: s.pdhgIneqMode,
          pdhgHalpernMode: s.pdhgHalpernMode,
          pdhgColorByBasis: s.pdhgColorByBasis,
        };
      },
      applySharedSettings: (settings: ShareSettings) => {
        if (settings.pdhgEta !== undefined) updateSolverSetting("pdhgEta", settings.pdhgEta);
        if (settings.pdhgTau !== undefined) updateSolverSetting("pdhgTau", settings.pdhgTau);
        if (settings.maxitPDHG !== undefined) updateSolverSetting("maxitPDHG", settings.maxitPDHG);
        if (settings.pdhgIneqMode !== undefined) updateSolverSetting("pdhgIneqMode", settings.pdhgIneqMode);
        if (settings.pdhgHalpernMode !== undefined) updateSolverSetting("pdhgHalpernMode", settings.pdhgHalpernMode);
        if (settings.pdhgColorByBasis !== undefined) updateSolverSetting("pdhgColorByBasis", settings.pdhgColorByBasis);
      },
      buildRequest: (state: State) => {
        if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) {
          return null;
        }
        const s = state.solverSettings;
        return {
          solver: "pdhg",
          lines: state.polytope.lines,
          objective: [state.objectiveVector.x, state.objectiveVector.y],
          ineq: s.pdhgIneqMode,
          halpern: s.pdhgHalpernMode,
          maxit: Math.max(1, s.maxitPDHG || 1),
          eta: s.pdhgEta,
          tau: s.pdhgTau,
          colorByBasis: s.pdhgColorByBasis,
        };
      },
      applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => {
        applyPDHGResult(response.result, updateResult);
      },
    },
  ];
}
