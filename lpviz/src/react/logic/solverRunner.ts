import { useCallback, useState } from "react";
import {
  hasPolytopeLines,
  hasPolytopeVertices,
} from "../../solvers/utils/polytope";
import { runSolverWorker } from "../../solvers/worker/client";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";
import {
  applyCentralPathResult,
  applyIPMResult,
  applyPDHGResult,
  applySimplexResult,
} from "../../solvers/worker/solverService";
import type {
  SolverWorkerPayload,
  SolverWorkerSuccessResponse,
} from "../../solvers/worker/solverWorker";
import type { SolverMode, State } from "../../state/store";
import { getState, mutate } from "../../state/store";

function buildRequest(
  mode: SolverMode,
  state: State
): SolverWorkerPayload | null {
  if (!state.objectiveVector || !hasPolytopeLines(state.polytope)) return null;
  const base = {
    objective: [state.objectiveVector.x, state.objectiveVector.y] as [
      number,
      number,
    ],
    lines: state.polytope.lines,
  };

  if (mode === "ipm") {
    return {
      solver: "ipm",
      lines: base.lines,
      objective: base.objective,
      alphaMax: state.ipmAlphaMax,
      maxit: state.ipmMaxIterations,
    };
  }

  if (mode === "simplex") {
    return { solver: "simplex", lines: base.lines, objective: base.objective };
  }

  if (mode === "pdhg") {
    return {
      solver: "pdhg",
      lines: base.lines,
      objective: base.objective,
      ineq: state.pdhgIneqMode,
      maxit: state.pdhgMaxIterations,
      eta: state.pdhgEta,
      tau: state.pdhgTau,
    };
  }

  if (mode === "central") {
    if (!hasPolytopeVertices(state.polytope)) return null;
    return {
      solver: "central",
      vertices: state.polytope.vertices,
      lines: base.lines,
      objective: base.objective,
      niter: state.centralPathSteps,
    };
  }

  return null;
}

function applyResult(
  response: SolverWorkerSuccessResponse,
  updateResult: (payload: ResultRenderPayload) => void,
  state: State
) {
  if (response.solver === "ipm")
    return applyIPMResult(response.result, updateResult);
  if (response.solver === "simplex")
    return applySimplexResult(response.result, updateResult);
  if (response.solver === "pdhg")
    return applyPDHGResult(response.result, updateResult);
  if (response.solver === "central")
    return applyCentralPathResult(
      response.result,
      state.objectiveAngleStep,
      updateResult
    );
}

export function useSolverRunner(
  updateResult: (payload: ResultRenderPayload) => void
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    (mode?: SolverMode) => {
      const state = getState();
      const solverMode = mode ?? state.solverMode;
      const payload = buildRequest(solverMode, state);
      if (!payload) {
        setError(
          "Missing objective or constraints; draw a polygon and objective first."
        );
        return;
      }

      setLoading(true);
      setError(null);

      runSolverWorker(payload)
        .then((response) => {
          applyResult(response, updateResult, state);
          mutate((draft) => {
            draft.highlightIteratePathIndex = null;
          });
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : String(err))
        )
        .finally(() => setLoading(false));
    },
    [updateResult]
  );

  const handleHover = useCallback((index: number | null) => {
    mutate((draft) => {
      draft.highlightIteratePathIndex = index;
    });
  }, []);

  return { run, loading, error, handleHover };
}
