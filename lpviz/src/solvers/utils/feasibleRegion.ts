import type { Lines, Vertices } from "./blas";

export type RegionKind = "bounded" | "unbounded" | "empty" | "degenerate";

export function satisfiesLines(point: [number, number], lines: Lines, tol = 1e-6): boolean {
  return lines.every(([A, B, C]) => A * point[0] + B * point[1] <= C + tol);
}

export function findFeasiblePoint(lines: Lines, tol = 1e-6): [number, number] | null {
  if (lines.length === 0) {
    return null;
  }

  const candidates: Array<[number, number]> = [[0, 0]];

  for (let i = 0; i < lines.length; i++) {
    const [A, B, C] = lines[i];
    const basePoint: [number, number] = [A * C, B * C];
    const inwardSteps = [1, 10, 100];
    candidates.push(basePoint);
    inwardSteps.forEach((step) => {
      candidates.push([basePoint[0] - A * step, basePoint[1] - B * step]);
    });

    for (let j = i + 1; j < lines.length; j++) {
      const [A2, B2, C2] = lines[j];
      const det = A * B2 - A2 * B;
      if (Math.abs(det) < tol) continue;
      const x = (C * B2 - C2 * B) / det;
      const y = (A * C2 - A2 * C) / det;
      candidates.push([x, y]);
    }
  }

  for (const candidate of candidates) {
    if (satisfiesLines(candidate, lines, tol)) {
      return candidate;
    }
  }

  return null;
}

export function findStrictFeasiblePoint(lines: Lines, tol = 1e-6): [number, number] | null {
  const feasiblePoint = findFeasiblePoint(lines, tol);
  if (!feasiblePoint) {
    return null;
  }
  if (lines.every(([A, B, C]) => A * feasiblePoint[0] + B * feasiblePoint[1] < C - tol)) {
    return feasiblePoint;
  }

  const radii = [0.01, 0.1, 1, 10];
  const directions = 32;
  for (const radius of radii) {
    for (let i = 0; i < directions; i++) {
      const angle = (2 * Math.PI * i) / directions;
      const candidate: [number, number] = [feasiblePoint[0] + radius * Math.cos(angle), feasiblePoint[1] + radius * Math.sin(angle)];
      if (lines.every(([A, B, C]) => A * candidate[0] + B * candidate[1] < C - tol)) {
        return candidate;
      }
    }
  }

  return null;
}

export function classifyRegion(lines: Lines, vertices: Vertices, closed: boolean): RegionKind {
  if (lines.length === 0) {
    return "degenerate";
  }

  if (vertices.length >= 3) {
    return "bounded";
  }

  const feasiblePoint = findFeasiblePoint(lines);
  if (!feasiblePoint) {
    return "empty";
  }

  const strictFeasiblePoint = findStrictFeasiblePoint(lines);
  if (!strictFeasiblePoint || closed) {
    return "degenerate";
  }

  return "unbounded";
}
