import { Lines, VecN, Vertices } from "../types/arrays";
import type { CentralPathResult, IPMResult, PDHGResult, SimplexResult } from "./solverService";

export type SolverModeWorker = "central" | "ipm" | "simplex" | "pdhg";

export type SolverWorkerPayload =
  | {
      solver: "ipm";
      lines: Lines;
      objective: VecN;
      alphaMax: number;
      maxit: number;
    }
  | {
      solver: "simplex";
      lines: Lines;
      objective: VecN;
    }
  | {
      solver: "pdhg";
      lines: Lines;
      objective: VecN;
      ineq: boolean;
      maxit: number;
      eta: number;
      tau: number;
    }
  | {
      solver: "central";
      vertices: Vertices;
      lines: Lines;
      objective: VecN;
      niter: number;
    };

export type SolverWorkerRequest = SolverWorkerPayload & { id: number };

export type SolverWorkerSuccessResponse =
  | {
      id: number;
      solver: "ipm";
      success: true;
      result: IPMResult;
    }
  | {
      id: number;
      solver: "simplex";
      success: true;
      result: SimplexResult;
    }
  | {
      id: number;
      solver: "pdhg";
      success: true;
      result: PDHGResult;
    }
  | {
      id: number;
      solver: "central";
      success: true;
      result: CentralPathResult;
    };

export type SolverWorkerErrorResponse = {
  id: number;
  success: false;
  error: string;
};

export type SolverWorkerResponse = SolverWorkerSuccessResponse | SolverWorkerErrorResponse;
