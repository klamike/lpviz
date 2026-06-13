import { describe, expect, test } from "bun:test";
import {
  recycleResultBuffers,
  takeFloat64,
  takeUint8,
} from "./resultBufferPool";

// The pool is module-global; each test recycles only buffers it created and
// drains what it takes, so ordering between tests stays independent in spirit.

// TypedArray.buffer is typed ArrayBufferLike; in this (non-shared) context it
// is always an ArrayBuffer.
const ab = (view: { buffer: ArrayBufferLike }): ArrayBuffer =>
  view.buffer as ArrayBuffer;

describe("resultBufferPool", () => {
  test("allocates fresh when nothing is pooled", () => {
    const a = takeFloat64(7);
    expect(a.length).toBe(7);
    expect(a.byteOffset).toBe(0);
    expect(ab(a).byteLength).toBe(7 * 8);
  });

  test("reuses a recycled buffer for an equal-size request", () => {
    const first = takeFloat64(64);
    const buffer = ab(first);
    recycleResultBuffers([buffer]);
    const second = takeFloat64(64);
    expect(second.buffer).toBe(buffer); // same backing store, no allocation
    expect(second.length).toBe(64);
  });

  test("backs a smaller request with a larger recycled buffer, exact length", () => {
    const big = takeFloat64(128);
    const buffer = ab(big);
    recycleResultBuffers([buffer]);
    const small = takeFloat64(10);
    expect(small.buffer).toBe(buffer);
    expect(small.length).toBe(10); // view sized to need
    expect(small.byteLength).toBe(10 * 8); // tail of the buffer is unused
    expect(buffer.byteLength).toBe(128 * 8);
  });

  test("a fresh write never exposes stale data from the prior tenant", () => {
    // Solve A fills its column, then hands the buffer back.
    const a = takeFloat64(32);
    a.fill(9);
    recycleResultBuffers([ab(a)]);
    // Solve B reuses it for fewer rows and writes every element it exposes.
    const b = takeFloat64(20);
    expect(b.buffer).toBe(ab(a));
    for (let i = 0; i < b.length; i++) b[i] = i;
    // The view only spans what B wrote; nothing reads A's leftover 9s.
    expect(b.length).toBe(20);
    expect([...b]).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  test("a Float64 request can reuse a recycled Uint8 buffer when it fits", () => {
    const bytes = takeUint8(2048); // 2048 bytes
    const buffer = ab(bytes);
    recycleResultBuffers([buffer]);
    const floats = takeFloat64(8); // needs 64 bytes
    expect(floats.buffer).toBe(buffer);
    expect(floats.length).toBe(8);
  });

  test("a too-small recycled buffer is not used for a larger request", () => {
    const small = takeUint8(4);
    const smallBuffer = ab(small);
    recycleResultBuffers([smallBuffer]);
    const floats = takeFloat64(100); // needs 800 bytes, won't fit in 4
    expect(floats.buffer).not.toBe(smallBuffer);
    // drain the small buffer back out so it doesn't leak into later tests
    const reclaimed = takeUint8(4);
    expect(reclaimed.buffer).toBe(smallBuffer);
  });

  test("drops returns past the pool cap instead of growing unbounded", () => {
    // Return far more buffers than the cap; only up to POOL_LIMIT are kept.
    const POOL_LIMIT = 32;
    const sizes = Array.from({ length: 64 }, (_, i) => 4096 + i);
    const buffers = sizes.map((n) => new ArrayBuffer(n));
    recycleResultBuffers(buffers);
    // Pull buffers of a size only these returns can satisfy and count reuses.
    let reused = 0;
    const seen = new Set<ArrayBuffer>();
    for (let i = 0; i < 64; i++) {
      const view = takeUint8(4096);
      if (buffers.includes(ab(view)) && !seen.has(ab(view))) {
        seen.add(ab(view));
        reused++;
      }
    }
    expect(reused).toBeLessThanOrEqual(POOL_LIMIT);
    expect(reused).toBeGreaterThan(0);
  });
});
