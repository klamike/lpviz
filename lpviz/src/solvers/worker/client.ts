import SolverWorker from "./solverWorker?worker";
import type { SolverWorkerPayload, SolverWorkerResponse, SolverWorkerSuccessResponse } from "./solverWorker";

type PendingResolver = {
  resolve: (value: SolverWorkerResponse) => void;
  reject: (reason?: unknown) => void;
};

const worker = new SolverWorker();
const pending = new Map<number, PendingResolver>();
let nextRequestId = 0;

worker.addEventListener("message", (event: MessageEvent<SolverWorkerResponse>) => {
  const entry = pending.get(event.data.id);
  if (!entry) return;
  pending.delete(event.data.id);
  entry.resolve(event.data);
});

worker.addEventListener("error", (event) => {
  const reason = event.error ?? event.message ?? event;
  pending.forEach(({ reject }) => reject(reason));
  pending.clear();
});

export async function runSolverWorker(payload: SolverWorkerPayload): Promise<SolverWorkerSuccessResponse> {
  const id = ++nextRequestId;
  const response = await new Promise<SolverWorkerResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...payload });
  });

  if (!response.success) {
    throw new Error(response.error);
  }
  return response;
}
