import { describe, expect, test } from "bun:test";
import { solveDenseSystem } from "../src/lapack";

const solve = (matrix: number[], rhs: number[]) => {
  const size = Math.sqrt(matrix.length);
  return Array.from(
    solveDenseSystem(
      Float64Array.from(matrix),
      size,
      Float64Array.from(rhs),
      new Float64Array(size),
    ),
  );
};

describe("solveDenseSystem", () => {
  test("solves a well-conditioned system", () => {
    const [x, y] = solve([2, 1, 1, 3], [3, 5]);
    expect(x).toBeCloseTo(0.8, 12);
    expect(y).toBeCloseTo(1.4, 12);
  });

  test("pivots when the diagonal is zero", () => {
    expect(solve([0, 1, 1, 0], [2, 3])).toEqual([3, 2]);
  });

  test("throws on a singular system", () => {
    expect(() => solve([1, 2, 2, 4], [1, 2])).toThrow("Singular linear system");
  });

  test("throws when NaN sits in a pivot position", () => {
    expect(() => solve([NaN, 1, 0, 1], [1, 1])).toThrow(
      "Singular linear system",
    );
  });

  test("throws when NaN sits off-pivot with finite pivots", () => {
    expect(() => solve([1, NaN, 0, 1], [1, 1])).toThrow(
      "Singular linear system",
    );
  });
});
