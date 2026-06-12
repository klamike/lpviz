import { describe, expect, test } from "bun:test";
import { deriveRegionFromPoints } from "../src/regionAssembly";
import type { Vertices } from "@lpviz/math/types";

describe("deriveRegionFromPoints", () => {
  test("closed convex polygons are bounded", () => {
    const square: Vertices = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(deriveRegionFromPoints(square, "closed").kind).toBe("bounded");
  });

  test("an unconstrained open region is degenerate, not empty", () => {
    expect(deriveRegionFromPoints([[1, 1]], "open").kind).toBe("degenerate");
    expect(
      deriveRegionFromPoints(
        [
          [1, 1],
          [1, 1],
        ],
        "open",
      ).kind,
    ).toBe("degenerate");
  });

  test("a single open half-plane is unbounded", () => {
    expect(
      deriveRegionFromPoints(
        [
          [0, 0],
          [2, 0],
        ],
        "open",
      ).kind,
    ).toBe("unbounded");
  });

  test("an open chain that closes onto itself is bounded", () => {
    const chain: Vertices = [
      [0, 0],
      [1, 0],
      [1, 1],
      [-3, 1],
      [-3, -1],
    ];
    expect(deriveRegionFromPoints(chain, "open").kind).toBe("bounded");
  });
});
