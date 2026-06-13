// Worker-side free-list of result-column ArrayBuffers handed back by the main
// thread once it has finished displaying a solve's packed rows. During
// objective rotation a solve completes ~30x per second, and the row columns
// (x / y / objective / infeasibility / extra / restart) are the bulk of the
// per-solve allocation. Reusing the same buffers across solves removes those
// allocations here and, more importantly, removes the matching ~120MB/s of
// born-this-frame-die-next-frame GC churn on the main thread that was stalling
// Firefox mid-rotation.
//
// Only the row columns cycle through this pool. The packed `iterations` buffer
// is retained by the main thread's trace ring for the whole rotation (a chunk
// is evicted only after maxTraceCount steps), so it is never returned and is
// always allocated fresh — keeping a trace-held buffer out of the pool also
// guarantees a pooled buffer can never be silently parked in the ring.
//
// This module lives in the worker bundle; its free list is per-bundle, so the
// (separate) main-thread copy is simply never exercised.

// Steady-state rotation returns ~7 buffers per solve (6 row columns + the
// iterations buffer, the latter lagged by the trace ring) and consumes the
// same, so the free list stays near-empty between solves; the cap only backs
// out transient build-ups and a few distinct sizes.
const POOL_LIMIT = 32;
const free: ArrayBuffer[] = [];

export function recycleResultBuffers(buffers: ArrayBuffer[]): void {
  for (const buffer of buffers) {
    if (free.length >= POOL_LIMIT) break;
    free.push(buffer);
  }
}

// Exactly `length` Float64s, backed by a recycled buffer when one is large
// enough (the view is sized to the need, so the buffer's tail is simply never
// read). Falls back to a fresh allocation when nothing fits.
export function takeFloat64(length: number): Float64Array {
  const buffer = takeBuffer(length * Float64Array.BYTES_PER_ELEMENT);
  return buffer
    ? new Float64Array(buffer, 0, length)
    : new Float64Array(length);
}

export function takeUint8(length: number): Uint8Array {
  const buffer = takeBuffer(length);
  return buffer ? new Uint8Array(buffer, 0, length) : new Uint8Array(length);
}

function takeBuffer(byteLength: number): ArrayBuffer | null {
  // smallest buffer that fits, so a 2MB return doesn't get spent backing a
  // 1KB column while a future large column has to allocate
  let bestIndex = -1;
  let bestSize = Infinity;
  for (let i = 0; i < free.length; i++) {
    const size = free[i]!.byteLength;
    if (size >= byteLength && size < bestSize) {
      bestSize = size;
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return null;
  const buffer = free[bestIndex]!;
  free[bestIndex] = free[free.length - 1]!;
  free.pop();
  return buffer;
}
