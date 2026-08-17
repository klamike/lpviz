import { describe, expect, test } from "bun:test";
import { centralPath } from "../src/centralPath";
import { ellipsoid } from "../src/ellipsoid";
import { ipm } from "../src/ipm";
import { pdhg } from "../src/pdhg";
import { simplex } from "../src/simplex";

// square around (-5,-5): x <= -4, x >= -6, y <= -4, y >= -6
const SQUARE = [
  [1, 0, -4],
  [-1, 0, 6],
  [0, 1, -4],
  [0, -1, 6],
] as [number, number, number][];
const SQUARE_VERTICES = [
  [-6, -6],
  [-4, -6],
  [-4, -4],
  [-6, -4],
] as [number, number][];

const pdhgDefaults = {
  halpern: false,
  maxit: 2000,
  eta: 0.25,
  tau: 0.25,
  tol: 1e-4,
  verbose: false,
  colorByBasis: false,
};

describe("pdhg", () => {
  test("eq-mode rows report the recovered (x, y), not the split variable", () => {
    const r = pdhg(SQUARE, Float64Array.of(1, 1), { ...pdhgDefaults, ineq: false });
    const lastRow = r.rows[r.rows.length - 1]!;
    const lastIterate = r.iterations[r.iterations.length - 1]!;
    expect(lastRow.x).toBeCloseTo(lastIterate[0]!, 8);
    expect(lastRow.y).toBeCloseTo(lastIterate[1]!, 8);
    expect(lastRow.x).toBeCloseTo(-4, 2);
    expect(lastRow.y).toBeCloseTo(-4, 2);
  });

  test("ineq mode records the converged iterate", () => {
    const r = pdhg(SQUARE, Float64Array.of(1, 1), { ...pdhgDefaults, ineq: true });
    expect(r.footer.startsWith("Converged")).toBe(true);
    const lastRow = r.rows[r.rows.length - 1]!;
    expect(lastRow.epsilon).toBeLessThanOrEqual(1e-4);
    expect(r.iterations.length).toBe(r.rows.length);
    expect(r.iterations.length).toBe(r.eps.length);
  });

  test("eq mode stops at the last finite iterate on divergence", () => {
    const r = pdhg(SQUARE, Float64Array.of(1, 1), {
      ...pdhgDefaults,
      ineq: false,
      eta: 0.75,
      tau: 0.75,
    });
    expect(r.footer.startsWith("Did not converge")).toBe(true);
    const last = r.iterations[r.iterations.length - 1]!;
    expect(Number.isFinite(last[0]!)).toBe(true);
    expect(Number.isFinite(last[1]!)).toBe(true);
    // the path must not silently collapse to the origin
    expect(Math.hypot(last[0]!, last[1]!)).toBeGreaterThan(1);
  });
});

describe("simplex", () => {
  const opts = (dual: boolean) => ({ tol: 1e-9, verbose: false, dual });

  test("primal and dual agree on the square optimum", () => {
    for (const dual of [false, true]) {
      const r = simplex(SQUARE, Float64Array.of(1, 1), opts(dual));
      expect(r.status).toBe("optimal");
      const last = r.iterations[r.iterations.length - 1]!;
      expect(last[0]!).toBeCloseTo(-4, 6);
      expect(last[1]!).toBeCloseTo(-4, 6);
    }
  });

  test("dual mode handles redundant zero rows (vertical strip)", () => {
    // x in [-1, 2], maximize x: the y-column of the dual system is all zeros
    const strip = [
      [1, 0, 2],
      [-1, 0, 1],
    ] as [number, number, number][];
    const r = simplex(strip, Float64Array.of(1, 0), opts(true));
    expect(r.status).toBe("optimal");
  });

  test("dual mode reports an infeasible primal as infeasible, not unbounded", () => {
    // x <= 1 and x >= 2: empty region
    const empty = [
      [1, 0, 1],
      [-1, 0, -2],
      [0, 1, 1],
      [0, -1, -2],
    ] as [number, number, number][];
    const r = simplex(empty, Float64Array.of(1, 1), opts(true));
    expect(r.status).toBe("infeasible");
  });

  test("primal mode throws on an infeasible region", () => {
    const empty = [
      [1, 0, 1],
      [-1, 0, -2],
    ] as [number, number, number][];
    expect(() => simplex(empty, Float64Array.of(1, 0), opts(false))).toThrow(/infeasible/i);
  });

  test("unbounded LP is reported as unbounded in primal mode", () => {
    const strip = [
      [1, 0, 2],
      [-1, 0, 1],
    ] as [number, number, number][];
    const r = simplex(strip, Float64Array.of(0, 1), opts(false));
    expect(r.status).toBe("unbounded");
  });

  test("random polygons: primal and dual match the brute-force optimum", () => {
    let seed = 7;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let runs = 0;
    for (let t = 0; t < 60 && runs < 25; t++) {
      const cnt = 3 + Math.floor(rand() * 5);
      const cx = rand() * 16 - 8;
      const cy = rand() * 16 - 8;
      const angles = Array.from({ length: cnt }, () => rand() * 2 * Math.PI).sort(
        (a, b) => a - b,
      );
      if (angles.some((a, i) => i > 0 && a - angles[i - 1]! < 0.2)) continue;
      const R = 1 + rand() * 8;
      const hull = angles.map(
        (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number],
      );
      const centX = hull.reduce((s, v) => s + v[0], 0) / hull.length;
      const centY = hull.reduce((s, v) => s + v[1], 0) / hull.length;
      const lines = hull.map((start, i) => {
        const end = hull[(i + 1) % hull.length]!;
        let A = end[1] - start[1];
        let B = -(end[0] - start[0]);
        const n = Math.hypot(A, B);
        A /= n;
        B /= n;
        let C = A * start[0] + B * start[1];
        if (A * centX + B * centY > C) {
          A = -A;
          B = -B;
          C = -C;
        }
        return [A, B, C] as [number, number, number];
      });
      const obj = Float64Array.of(rand() * 4 - 2, rand() * 4 - 2);
      if (Math.abs(obj[0]!) + Math.abs(obj[1]!) < 0.1) continue;
      const expected = Math.max(
        ...hull.map((v) => obj[0]! * v[0] + obj[1]! * v[1]),
      );
      runs++;
      for (const dual of [false, true]) {
        const r = simplex(lines, obj, opts(dual));
        const last = r.iterations[r.iterations.length - 1]!;
        const got = obj[0]! * last[0]! + obj[1]! * last[1]!;
        expect(r.status).toBe("optimal");
        expect(got).toBeCloseTo(expected, 5);
      }
    }
    expect(runs).toBeGreaterThan(10);
  });
});

describe("ipm", () => {
  const opts = (alphaMax: number) => ({
    eps_p: 1e-6,
    eps_d: 1e-6,
    eps_opt: 1e-6,
    maxit: 200,
    alphaMax,
    correctorThreshold: 0.9,
    verbose: false,
  });

  test("converges to the square optimum", () => {
    const r = ipm(SQUARE, Float64Array.of(1, 1), opts(0.9));
    const sol = r.iterates.solution;
    expect(sol.footer!.startsWith("Converged")).toBe(true);
    const last = sol.x[sol.x.length - 1]!;
    expect(last[0]!).toBeCloseTo(-4, 3);
    expect(last[1]!).toBeCloseTo(-4, 3);
  });

  test("alphaMax = 1 never produces NaN rows", () => {
    let seed = 3;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let t = 0; t < 100; t++) {
      const obj = Float64Array.of(rand() * 4 - 2, rand() * 4 - 2);
      const r = ipm(SQUARE, obj, opts(1));
      for (const row of r.iterates.solution.rows) {
        expect(Number.isFinite(row.x)).toBe(true);
        expect(Number.isFinite(row.y)).toBe(true);
        expect(Number.isFinite(row.mu)).toBe(true);
        expect(Number.isFinite(row.objective)).toBe(true);
      }
    }
  });
});

describe("ellipsoid", () => {
  const opts = (o: Partial<Parameters<typeof ellipsoid>[3]> = {}) => ({
    maxit: 500,
    tol: 1e-6,
    deepCuts: true,
    parallelCuts: false,
    rayShoot: true,
    initialScale: 1.5,
    verbose: false,
    ...o,
  });

  test("converges to the square optimum under every cut combination", () => {
    for (const deepCuts of [true, false]) {
      for (const rayShoot of [true, false]) {
        const r = ellipsoid(
          SQUARE_VERTICES,
          SQUARE,
          Float64Array.of(1, 1),
          opts({ deepCuts, rayShoot }),
        );
        expect(r.footer.startsWith("Converged")).toBe(true);
        const last = r.iterations[r.iterations.length - 1]!;
        expect(last[0]!).toBeCloseTo(-4, 3);
        expect(last[1]!).toBeCloseTo(-4, 3);
      }
    }
  });

  test("the ray shoot reaches the same optimum in fewer iterations", () => {
    for (const objective of [
      Float64Array.of(1, 1),
      Float64Array.of(-1, 2),
      Float64Array.of(0.3, -1),
    ]) {
      const off = ellipsoid(SQUARE_VERTICES, SQUARE, objective, opts({ rayShoot: false }));
      const on = ellipsoid(SQUARE_VERTICES, SQUARE, objective, opts({ rayShoot: true }));
      expect(on.iterations.length).toBeLessThan(off.iterations.length);
      const a = off.iterations[off.iterations.length - 1]!;
      const b = on.iterations[on.iterations.length - 1]!;
      const value = (p: Float64Array) => objective[0]! * p[0]! + objective[1]! * p[1]!;
      expect(value(b)).toBeCloseTo(value(a), 4);
    }
  });

  test("the final iterate is feasible however termination is reached", () => {
    // the gap stop can close while the ellipsoid is still wide, so it must
    // still hold the center inside the region before calling it converged
    let seed = 5;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let t = 0; t < 40; t++) {
      const objective = Float64Array.of(rand() * 4 - 2, rand() * 4 - 2);
      const r = ellipsoid(SQUARE_VERTICES, SQUARE, objective, opts());
      const last = r.iterations[r.iterations.length - 1]!;
      for (const [a1, a2, rhs] of SQUARE) {
        expect(a1 * last[0]! + a2 * last[1]!).toBeLessThanOrEqual(rhs + 1e-9);
      }
    }
  });

  test("the converged iterate is feasible, not just close", () => {
    const r = ellipsoid(SQUARE_VERTICES, SQUARE, Float64Array.of(1, 2), opts());
    const last = r.iterations[r.iterations.length - 1]!;
    for (const [a1, a2, rhs] of SQUARE) {
      expect(a1 * last[0]! + a2 * last[1]!).toBeLessThanOrEqual(rhs + 1e-9);
    }
  });

  // The run ends by appending the incumbent as a final iterate — it is what the
  // method returns, and it is not in general the last point queried. That entry
  // reuses the previous iterate's ellipse, so the per-iterate invariants below
  // hold over everything before it.
  const queriedCount = (r: ReturnType<typeof ellipsoid>) =>
    r.iterations.length - 1;

  test("iterations, rows, rho and ellipsoids stay in lockstep", () => {
    const r = ellipsoid(SQUARE_VERTICES, SQUARE, Float64Array.of(1, 1), opts({ maxit: 40 }));
    expect(r.rows.length).toBe(r.iterations.length);
    expect(r.rho.length).toBe(r.iterations.length);
    expect(r.ellipsoids.length).toBe(r.iterations.length * 5);
    for (let i = 0; i < queriedCount(r); i++) {
      expect(r.ellipsoids[i * 5]!).toBe(r.iterations[i]![0]!);
      expect(r.ellipsoids[i * 5 + 1]!).toBe(r.iterations[i]![1]!);
      expect(r.rows[i]!.rho).toBe(r.rho[i]!);
    }
  });

  test("the run ends on the incumbent, which is the optimum", () => {
    const objective = Float64Array.of(1, 2);
    const r = ellipsoid(SQUARE_VERTICES, SQUARE, objective, opts());
    const last = r.iterations[r.iterations.length - 1]!;
    const lastRow = r.rows[r.rows.length - 1]!;
    const expected = Math.max(
      ...SQUARE_VERTICES.map((v) => objective[0]! * v[0] + objective[1]! * v[1]),
    );
    const got = objective[0]! * last[0]! + objective[1]! * last[1]!;
    // the incumbent is feasible, so it can never beat the optimum, and the gap
    // stop certifies it to within the relative tolerance it was asked for
    expect(got).toBeLessThanOrEqual(expected + 1e-9);
    expect(expected - got).toBeLessThanOrEqual(1e-6 * (1 + Math.abs(expected)));
    expect(lastRow.infeasibility).toBe(0);
    expect(lastRow.x).toBe(last[0]!);
    expect(lastRow.y).toBe(last[1]!);
  });

  test("every ellipsoid is positive definite and shrinks", () => {
    const r = ellipsoid(SQUARE_VERTICES, SQUARE, Float64Array.of(-1, 2), opts({ maxit: 60 }));
    let previousDet = Infinity;
    for (let i = 0; i < queriedCount(r); i++) {
      const p11 = r.ellipsoids[i * 5 + 2]!;
      const p12 = r.ellipsoids[i * 5 + 3]!;
      const p22 = r.ellipsoids[i * 5 + 4]!;
      const det = p11 * p22 - p12 * p12;
      expect(p11).toBeGreaterThan(0);
      expect(p22).toBeGreaterThan(0);
      expect(det).toBeGreaterThan(0);
      expect(det).toBeLessThan(previousDet);
      previousDet = det;
    }
  });

  test("the first ellipsoid contains every vertex of the region", () => {
    const r = ellipsoid(SQUARE_VERTICES, SQUARE, Float64Array.of(1, 1), opts({ maxit: 1 }));
    const [cx, cy, p11, p12, p22] = [...r.ellipsoids.slice(0, 5)] as number[];
    const det = p11! * p22! - p12! * p12!;
    for (const [vx, vy] of SQUARE_VERTICES) {
      const dx = vx - cx!;
      const dy = vy - cy!;
      // (v - c)' P^-1 (v - c) <= 1
      const quadratic = (p22! * dx * dx - 2 * p12! * dx * dy + p11! * dy * dy) / det;
      expect(quadratic).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test("random polygons match the brute-force optimum", () => {
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let runs = 0;
    for (let t = 0; t < 60 && runs < 15; t++) {
      const cnt = 3 + Math.floor(rand() * 5);
      const cx = rand() * 16 - 8;
      const cy = rand() * 16 - 8;
      const angles = Array.from({ length: cnt }, () => rand() * 2 * Math.PI).sort(
        (a, b) => a - b,
      );
      if (angles.some((a, i) => i > 0 && a - angles[i - 1]! < 0.2)) continue;
      const R = 1 + rand() * 8;
      const hull = angles.map(
        (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number],
      );
      const centX = hull.reduce((s, v) => s + v[0], 0) / hull.length;
      const centY = hull.reduce((s, v) => s + v[1], 0) / hull.length;
      const lines = hull.map((start, i) => {
        const end = hull[(i + 1) % hull.length]!;
        let A = end[1] - start[1];
        let B = -(end[0] - start[0]);
        const n = Math.hypot(A, B);
        A /= n;
        B /= n;
        let C = A * start[0] + B * start[1];
        if (A * centX + B * centY > C) {
          A = -A;
          B = -B;
          C = -C;
        }
        return [A, B, C] as [number, number, number];
      });
      const obj = Float64Array.of(rand() * 4 - 2, rand() * 4 - 2);
      if (Math.abs(obj[0]!) + Math.abs(obj[1]!) < 0.1) continue;
      const expected = Math.max(
        ...hull.map((v) => obj[0]! * v[0] + obj[1]! * v[1]),
      );
      runs++;
      const r = ellipsoid(hull, lines, obj, opts());
      const last = r.iterations[r.iterations.length - 1]!;
      expect(r.footer.startsWith("Converged")).toBe(true);
      expect(obj[0]! * last[0]! + obj[1]! * last[1]!).toBeCloseTo(expected, 4);
    }
    expect(runs).toBeGreaterThan(8);
  });

  test("reports an unbounded objective instead of claiming optimality", () => {
    // x in [-1, 2], maximize y: the optimum is only bounded by the initial
    // ellipsoid, never by a constraint
    const strip = [
      [1, 0, 2],
      [-1, 0, 1],
    ] as [number, number, number][];
    const r = ellipsoid(
      [
        [-1, -5],
        [2, -5],
        [2, 5],
        [-1, 5],
      ],
      strip,
      Float64Array.of(0, 1),
      opts(),
    );
    expect(r.footer.startsWith("Stopped on the initial ellipsoid boundary")).toBe(true);
    expect(r.footer).toContain("unbounded");
  });

  test("stops instead of spinning when the region is empty", () => {
    const empty = [
      [1, 0, 1],
      [-1, 0, -2],
      [0, 1, 1],
      [0, -1, 1],
    ] as [number, number, number][];
    const r = ellipsoid(
      [
        [1, 1],
        [2, 1],
        [2, -1],
        [1, -1],
      ],
      empty,
      Float64Array.of(1, 1),
      opts(),
    );
    expect(r.iterations.length).toBeLessThan(500);
    expect(r.footer.startsWith("Converged")).toBe(false);
  });
});

describe("centralPath", () => {
  test("emits one log row per traced point plus a header, no footer", () => {
    const r = centralPath(SQUARE_VERTICES, SQUARE, Float64Array.of(1, 1), {
      niter: 10,
      verbose: false,
    });
    expect(r.iterations.length).toBe(10);
    expect(r.logs.length).toBe(11);
    const last = r.iterations[r.iterations.length - 1]!;
    expect(last[0]!).toBeCloseTo(-4, 2);
    expect(last[1]!).toBeCloseTo(-4, 2);
  });

  test("stays finite on a sliver region", () => {
    const sliverLines = [
      [1, 0, -4],
      [-1, 0, 4.001],
      [0, 1, -4],
      [0, -1, 6],
    ] as [number, number, number][];
    const sliverVertices = [
      [-4.001, -6],
      [-4, -6],
      [-4, -4],
      [-4.001, -4],
    ] as [number, number][];
    const r = centralPath(sliverVertices, sliverLines, Float64Array.of(1, 1), {
      niter: 20,
      verbose: false,
    });
    expect(r.iterations.length).toBeGreaterThan(0);
    for (const p of r.iterations) {
      expect(Number.isFinite(p[0]!)).toBe(true);
      expect(Number.isFinite(p[1]!)).toBe(true);
      expect(Number.isFinite(p[2]!)).toBe(true);
    }
  });
});

describe("draggable start point", () => {
  const ipmOpts = (startPoint?: number[]) => ({
    eps_p: 1e-6,
    eps_d: 1e-6,
    eps_opt: 1e-6,
    maxit: 500,
    alphaMax: 0.9,
    correctorThreshold: 0.9,
    verbose: false,
    startPoint,
  });

  test("ipm starts at the given point and still converges", () => {
    for (const start of [
      [-5.5, -4.5], // interior
      [3, 7], // far outside (infeasible start)
    ]) {
      const r = ipm(SQUARE, Float64Array.of(1, 1), ipmOpts(start));
      const sol = r.iterates.solution;
      expect(sol.x[0]![0]!).toBeCloseTo(start[0]!, 12);
      expect(sol.x[0]![1]!).toBeCloseTo(start[1]!, 12);
      expect(sol.footer!.startsWith("Converged")).toBe(true);
      const last = sol.x[sol.x.length - 1]!;
      expect(last[0]!).toBeCloseTo(-4, 3);
      expect(last[1]!).toBeCloseTo(-4, 3);
    }
  });

  test("a start at the default origin reproduces the cold trajectory", () => {
    // The marker relocates only the primal start; every other initialization
    // matches the cold start, so startPoint [0,0] must be bitwise identical
    // to passing no start point at all.
    const coldIpm = ipm(SQUARE, Float64Array.of(1, 1), ipmOpts(undefined));
    const warmIpm = ipm(SQUARE, Float64Array.of(1, 1), ipmOpts([0, 0]));
    expect(warmIpm.iterates.solution.x).toEqual(coldIpm.iterates.solution.x);
    expect(warmIpm.iterates.solution.s).toEqual(coldIpm.iterates.solution.s);
    expect(warmIpm.iterates.solution.y).toEqual(coldIpm.iterates.solution.y);

    for (const ineq of [true, false]) {
      const cold = pdhg(SQUARE, Float64Array.of(1, 1), {
        ...pdhgDefaults,
        ineq,
      });
      const warm = pdhg(SQUARE, Float64Array.of(1, 1), {
        ...pdhgDefaults,
        ineq,
        startPoint: [0, 0],
      });
      expect(warm.iterations).toEqual(cold.iterations);
    }
  });

  test("pdhg ineq mode starts at the given point and converges", () => {
    for (const start of [
      [-5, -5],
      [2, 2], // outside (the dual keeps the cold start's y = 1)
    ]) {
      const r = pdhg(SQUARE, Float64Array.of(1, 1), {
        ...pdhgDefaults,
        ineq: true,
        startPoint: start,
      });
      expect(r.iterations[0]![0]!).toBeCloseTo(start[0]!, 12);
      expect(r.iterations[0]![1]!).toBeCloseTo(start[1]!, 12);
      expect(r.footer.startsWith("Converged")).toBe(true);
      const last = r.iterations[r.iterations.length - 1]!;
      expect(last[0]!).toBeCloseTo(-4, 2);
      expect(last[1]!).toBeCloseTo(-4, 2);
    }
  });

  test("pdhg eq mode maps a negative start through the split exactly", () => {
    const r = pdhg(SQUARE, Float64Array.of(1, 1), {
      ...pdhgDefaults,
      ineq: false,
      startPoint: [-5.5, -4.5],
    });
    expect(r.iterations[0]![0]!).toBeCloseTo(-5.5, 12);
    expect(r.iterations[0]![1]!).toBeCloseTo(-4.5, 12);
    expect(r.footer.startsWith("Converged")).toBe(true);
    const last = r.iterations[r.iterations.length - 1]!;
    expect(last[0]!).toBeCloseTo(-4, 2);
    expect(last[1]!).toBeCloseTo(-4, 2);
  });

  test("pdhg halpern accepts a warm start", () => {
    const r = pdhg(SQUARE, Float64Array.of(1, 1), {
      ...pdhgDefaults,
      ineq: true,
      halpern: true,
      startPoint: [-5, -5],
    });
    expect(r.iterations[0]![0]!).toBeCloseTo(-5, 12);
    expect(r.footer.startsWith("Converged")).toBe(true);
  });

  test("simplex warm starts from a vertex and skips Phase 1", () => {
    const r = simplex(SQUARE, Float64Array.of(1, 1), {
      tol: 1e-9,
      verbose: false,
      dual: false,
      startVertex: [-6, -6],
    });
    expect(r.status).toBe("optimal");
    expect(r.phase1Iterations!.length).toBe(0);
    expect(r.logs[0]![0]!).toContain("warm start");
    const first = r.iterations[0]!;
    expect(first[0]!).toBeCloseTo(-6, 6);
    expect(first[1]!).toBeCloseTo(-6, 6);
    const last = r.iterations[r.iterations.length - 1]!;
    expect(last[0]!).toBeCloseTo(-4, 6);
    expect(last[1]!).toBeCloseTo(-4, 6);
  });

  test("simplex falls back to Phase 1 when the start is not a vertex", () => {
    for (const start of [
      [-5, -5], // interior
      [0, 0], // infeasible
      [-4, -5], // on a facet but not a corner
    ]) {
      const r = simplex(SQUARE, Float64Array.of(1, 1), {
        tol: 1e-9,
        verbose: false,
        dual: false,
        startVertex: start,
      });
      expect(r.status).toBe("optimal");
      expect(r.phase1Iterations!.length).toBeGreaterThan(0);
      const last = r.iterations[r.iterations.length - 1]!;
      expect(last[0]!).toBeCloseTo(-4, 6);
      expect(last[1]!).toBeCloseTo(-4, 6);
    }
  });
});
