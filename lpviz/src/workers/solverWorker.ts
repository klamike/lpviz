import { fetchCentralPath, fetchIPM, fetchPDHG, fetchSimplex } from "../services/apiClient";
import { SolverWorkerRequest, SolverWorkerResponse, SolverWorkerSuccessResponse } from "./solverWorkerTypes";

const ctx = self as unknown as Worker;

async function executeSolver(data: SolverWorkerRequest): Promise<SolverWorkerSuccessResponse> {
  switch (data.solver) {
    case "ipm": {
      const result = await fetchIPM(data.lines, data.objective, data.alphaMax, data.maxit);
      return { id: data.id, solver: "ipm", success: true, result };
    }
    case "simplex": {
      const result = await fetchSimplex(data.lines, data.objective);
      return { id: data.id, solver: "simplex", success: true, result };
    }
    case "pdhg": {
      const result = await fetchPDHG(data.lines, data.objective, data.ineq, data.maxit, data.eta, data.tau);
      return { id: data.id, solver: "pdhg", success: true, result };
    }
    case "central": {
      const result = await fetchCentralPath(data.vertices, data.lines, data.objective, data.niter);
      return { id: data.id, solver: "central", success: true, result };
    }
    default: {
      const exhaustive: never = data;
      throw new Error(`Unsupported solver: ${JSON.stringify(exhaustive)}`);
    }
  }
}

ctx.addEventListener("message", async (event: MessageEvent<SolverWorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  try {
    const response = await executeSolver(data);
    ctx.postMessage(response);
  } catch (error) {
    const response: SolverWorkerResponse = {
      id: data.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(response);
  }
});
