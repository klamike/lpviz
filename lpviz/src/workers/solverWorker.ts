import { fetchCentralPath, fetchIPM, fetchPDHG, fetchSimplex } from "../services/apiClient";
import { SolverWorkerRequest, SolverWorkerResponse } from "./solverWorkerTypes";

const ctx: any = self;

ctx.addEventListener("message", async (event: MessageEvent<SolverWorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  try {
    let result: any;
    switch (data.solver) {
      case "ipm":
        result = await fetchIPM(data.lines, data.objective, data.alphaMax, data.maxit);
        break;
      case "simplex":
        result = await fetchSimplex(data.lines, data.objective);
        break;
      case "pdhg":
        result = await fetchPDHG(data.lines, data.objective, data.ineq, data.maxit, data.eta, data.tau);
        break;
      case "central":
        result = await fetchCentralPath(data.vertices, data.lines, data.objective, data.niter);
        break;
      default:
        throw new Error(`Unsupported solver: ${data}`);
    }
    const response: SolverWorkerResponse = {
      id: data.id,
      solver: data.solver,
      success: true,
      result,
    };
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
