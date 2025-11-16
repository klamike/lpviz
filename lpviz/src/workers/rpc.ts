type PendingResolver<Response> = {
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Creates a typed RPC helper for communicating with a Web Worker using incremental message IDs.
 */
export function createWorkerRPC<Request extends { id: number }, Response extends { id: number }>(
  url: URL,
  options?: WorkerOptions,
) {
  const worker = new Worker(url, { type: "module", ...options });
  const pending = new Map<number, PendingResolver<Response>>();
  let nextId = 0;

  worker.addEventListener("message", (event: MessageEvent<Response>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    entry.resolve(event.data);
  });

  worker.addEventListener("error", (event) => {
    pending.forEach(({ reject }) => reject(event));
    pending.clear();
  });

  return (payload: Omit<Request, "id">): Promise<Response> =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...(payload as Record<string, unknown>) });
    });
}

