import type { Lines, PointXY, Vertices } from "./types";

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function isConvexChain(
  points: ReadonlyArray<PointXY>,
  tol = 1e-9,
): boolean {
  if (points.length < 3) return true;

  let prevCross = 0;
  for (let i = 0; i < points.length - 2; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const p2 = points[i + 2];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (Math.abs(cross) <= tol) continue;
    if (prevCross === 0) {
      prevCross = cross;
      continue;
    }
    if (Math.sign(cross) !== Math.sign(prevCross)) {
      return false;
    }
  }

  return true;
}

export function centroid(vertices: Vertices) {
  if (vertices.length === 0) throw new Error("No intersections found");
  let sumX = 0;
  let sumY = 0;
  for (const p of vertices) {
    sumX += p[0];
    sumY += p[1];
  }
  return [sumX / vertices.length, sumY / vertices.length];
}

export function signedArea(
  points: ReadonlyArray<PointXY>,
  tol = 1e-12,
): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  const normalizedArea = area / 2;
  return Math.abs(normalizedArea) <= tol ? 0 : normalizedArea;
}

export class VRep {
  private constructor(private readonly points: ReadonlyArray<PointXY>) {}

  static fromPoints(points: ReadonlyArray<PointXY>): VRep {
    return new VRep(points);
  }

  static distance(p1: PointXY, p2: PointXY): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  static isValid(points: ReadonlyArray<PointXY>): boolean {
    return (
      points.length > 0 &&
      points.every(
        (pt) => pt != null && Number.isFinite(pt.x) && Number.isFinite(pt.y),
      )
    );
  }

  get vertexCount(): number {
    return this.points.length;
  }

  centroidPoint(): PointXY {
    if (this.points.length === 0) {
      throw new Error("Cannot compute centroid of empty polytope");
    }

    let sumX = 0;
    let sumY = 0;
    for (const pt of this.points) {
      sumX += pt.x;
      sumY += pt.y;
    }
    return {
      x: sumX / this.points.length,
      y: sumY / this.points.length,
    };
  }

  isConvex(): boolean {
    if (this.points.length < 3) return true;
    let prevCross = 0;
    for (let i = 0, n = this.points.length; i < n; i++) {
      const p0 = this.points[i];
      const p1 = this.points[(i + 1) % n];
      const p2 = this.points[(i + 2) % n];
      const cross =
        (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (cross !== 0) {
        if (prevCross === 0) prevCross = cross;
        else if (Math.sign(cross) !== Math.sign(prevCross)) return false;
      }
    }
    return true;
  }

  contains(point: PointXY): boolean {
    if (this.points.length < 3) return false;
    let inside = false;
    for (
      let i = 0, j = this.points.length - 1;
      i < this.points.length;
      j = i++
    ) {
      const xi = this.points[i].x;
      const yi = this.points[i].y;
      const xj = this.points[j].x;
      const yj = this.points[j].y;
      if (
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  isPointNearEdge(point: PointXY, edgeIndex: number, tolerance = 0.5): boolean {
    if (this.points.length < 2) return false;
    const start = this.points[edgeIndex];
    const end = this.points[(edgeIndex + 1) % this.points.length];
    if (!start || !end) return false;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;

    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2;
    if (t < 0 || t > 1) return false;

    const proj = { x: start.x + t * dx, y: start.y + t * dy };
    return VRep.distance(point, proj) < tolerance;
  }

  findEdgeNearPoint(point: PointXY, tolerance = 0.5): number | null {
    for (let i = 0; i < this.points.length; i++) {
      if (this.isPointNearEdge(point, i, tolerance)) {
        return i;
      }
    }
    return null;
  }

  computeConvexHull(): PointXY[] {
    if (this.points.length <= 1) {
      return this.points.map((pt) => ({ x: pt.x, y: pt.y }));
    }

    const sorted = [...this.points].sort((a, b) =>
      a.x === b.x ? a.y - b.y : a.x - b.x,
    );

    const uniqueSorted: PointXY[] = [];
    for (const pt of sorted) {
      const last = uniqueSorted[uniqueSorted.length - 1];
      if (!last || last.x !== pt.x || last.y !== pt.y) {
        uniqueSorted.push({ x: pt.x, y: pt.y });
      }
    }

    if (uniqueSorted.length <= 2) {
      return uniqueSorted.map((pt) => ({ x: pt.x, y: pt.y }));
    }

    const cross = (o: PointXY, a: PointXY, b: PointXY) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower: PointXY[] = [];
    for (const pt of uniqueSorted) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0
      ) {
        lower.pop();
      }
      lower.push({ x: pt.x, y: pt.y });
    }

    const upper: PointXY[] = [];
    for (let i = uniqueSorted.length - 1; i >= 0; i--) {
      const pt = uniqueSorted[i];
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0
      ) {
        upper.pop();
      }
      upper.push({ x: pt.x, y: pt.y });
    }

    lower.pop();
    upper.pop();

    const hull = lower.concat(upper);
    return hull.length > 0
      ? hull
      : uniqueSorted.map((pt) => ({ x: pt.x, y: pt.y }));
  }

  toVertices(): Vertices {
    return this.points.map((pt) => [pt.x, pt.y]);
  }
}

export type RegionKind = "bounded" | "unbounded" | "empty" | "degenerate";

export function satisfiesLines(
  point: [number, number],
  lines: Lines,
  tol = 1e-6,
): boolean {
  return lines.every(([A, B, C]) => A * point[0] + B * point[1] <= C + tol);
}

export function findFeasiblePoint(
  lines: Lines,
  tol = 1e-6,
): [number, number] | null {
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

export function findStrictFeasiblePoint(
  lines: Lines,
  tol = 1e-6,
): [number, number] | null {
  const feasiblePoint = findFeasiblePoint(lines, tol);
  if (!feasiblePoint) {
    return null;
  }
  if (
    lines.every(
      ([A, B, C]) => A * feasiblePoint[0] + B * feasiblePoint[1] < C - tol,
    )
  ) {
    return feasiblePoint;
  }

  const radii = [0.01, 0.1, 1, 10];
  const directions = 32;
  for (const radius of radii) {
    for (let i = 0; i < directions; i++) {
      const angle = (2 * Math.PI * i) / directions;
      const candidate: [number, number] = [
        feasiblePoint[0] + radius * Math.cos(angle),
        feasiblePoint[1] + radius * Math.sin(angle),
      ];
      if (
        lines.every(
          ([A, B, C]) => A * candidate[0] + B * candidate[1] < C - tol,
        )
      ) {
        return candidate;
      }
    }
  }

  return null;
}

export function classifyRegion(
  lines: Lines,
  vertices: Vertices,
  closed: boolean,
): RegionKind {
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

export function verticesFromLines(lines: Lines, tol = 1e-6): Vertices {
  const intersections: Vertices = [];
  const n = lines.length;

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const [A1, B1, C1] = lines[i];
      const [A2, B2, C2] = lines[j];
      const det = A1 * B2 - A2 * B1;
      if (Math.abs(det) < tol) continue;

      const x = (C1 * B2 - C2 * B1) / det;
      const y = (A1 * C2 - A2 * C1) / det;

      const satisfiesAll = lines.every(([A, B, C]) => A * x + B * y <= C + tol);
      if (satisfiesAll) {
        intersections.push([x, y]);
      }
    }
  }

  if (intersections.length === 0) return [];

  const unique: Vertices = [];
  intersections.forEach(([x, y]) => {
    const existing = unique.find(
      ([ux, uy]) => Math.hypot(ux - x, uy - y) < tol,
    );
    if (!existing) unique.push([x, y]);
  });

  if (unique.length <= 2) {
    return unique.map(([x, y]) => [
      parseFloat(x.toFixed(2)),
      parseFloat(y.toFixed(2)),
    ]);
  }

  const center = centroid(unique);
  return unique
    .map(([x, y]) => ({
      angle: Math.atan2(y - center[1], x - center[0]),
      point: [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))] as [
        number,
        number,
      ],
    }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ point }) => point);
}

export interface BoundaryRay {
  start: [number, number];
  direction: [number, number];
}

export function buildOpenBoundaryRays(points: Vertices): BoundaryRay[] {
  if (points.length < 2) {
    return [];
  }

  const first = points[0];
  const second = points[1];
  const penultimate = points[points.length - 2];
  const last = points[points.length - 1];

  return [
    {
      start: [first[0], first[1]],
      direction: [first[0] - second[0], first[1] - second[1]],
    },
    {
      start: [last[0], last[1]],
      direction: [last[0] - penultimate[0], last[1] - penultimate[1]],
    },
  ];
}

function intersectOpenBoundaryRays(
  rays: BoundaryRay[],
  lines: Lines,
  tol = 1e-6,
): [number, number] | null {
  if (rays.length !== 2) return null;
  const [r1, r2] = rays;
  const [x1, y1] = r1.start;
  const [dx1, dy1] = r1.direction;
  const [x2, y2] = r2.start;
  const [dx2, dy2] = r2.direction;

  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < tol) return null;

  const tx = x2 - x1;
  const ty = y2 - y1;
  const t1 = (tx * dy2 - ty * dx2) / det;
  const t2 = (tx * dy1 - ty * dx1) / det;
  if (t1 < -tol || t2 < -tol) return null;

  const point: [number, number] = [x1 + t1 * dx1, y1 + t1 * dy1];
  return satisfiesLines(point, lines, tol) ? point : null;
}

function intersectRayWithSegment(
  ray: BoundaryRay,
  segStart: Vertices[number],
  segEnd: Vertices[number],
  tol = 1e-6,
): [number, number] | null {
  const [rx, ry] = ray.start;
  const [rdx, rdy] = ray.direction;
  const [sx, sy] = segStart;
  const sdx = segEnd[0] - segStart[0];
  const sdy = segEnd[1] - segStart[1];

  const det = rdx * sdy - rdy * sdx;
  if (Math.abs(det) < tol) return null;

  const dx = sx - rx;
  const dy = sy - ry;
  const tRay = (dx * sdy - dy * sdx) / det;
  const tSeg = (dx * rdy - dy * rdx) / det;
  if (tRay < -tol || tSeg < -tol || tSeg > 1 + tol) return null;

  return [rx + tRay * rdx, ry + tRay * rdy];
}

function intersectSegmentWithLine(
  segStart: Vertices[number],
  segEnd: Vertices[number],
  line: Lines[number],
  tol = 1e-6,
): [number, number] | null {
  const [sx, sy] = segStart;
  const sdx = segEnd[0] - segStart[0];
  const sdy = segEnd[1] - segStart[1];
  const [A, B, C] = line;

  const denom = A * sdx + B * sdy;
  if (Math.abs(denom) < tol) return null;

  const t = (C - A * sx - B * sy) / denom;
  if (t <= tol || t >= 1 - tol) return null;

  return [sx + t * sdx, sy + t * sdy];
}

function terminalSegmentClosesAgainstNonAdjacentConstraint(
  points: Vertices,
  terminalSegmentIndex: number,
  lines: Lines,
  tol = 1e-6,
): boolean {
  const segStart = points[terminalSegmentIndex];
  const segEnd = points[terminalSegmentIndex + 1];

  for (let i = 0; i < lines.length; i++) {
    if (Math.abs(i - terminalSegmentIndex) <= 1) continue;
    const intersection = intersectSegmentWithLine(
      segStart,
      segEnd,
      lines[i],
      tol,
    );
    if (intersection && satisfiesLines(intersection, lines, tol)) {
      return true;
    }
  }

  return false;
}

export function hasOpenBoundaryClosure(
  points: Vertices,
  lines: Lines,
  tol = 1e-6,
): boolean {
  const rays = buildOpenBoundaryRays(points);
  if (intersectOpenBoundaryRays(rays, lines, tol)) return true;
  if (points.length < 4) return false;

  const [startRay, endRay] = rays;
  for (let i = 1; i < points.length - 2; i++) {
    if (intersectRayWithSegment(startRay, points[i], points[i + 1], tol))
      return true;
  }
  for (let i = 0; i < points.length - 3; i++) {
    if (intersectRayWithSegment(endRay, points[i], points[i + 1], tol))
      return true;
  }

  if (terminalSegmentClosesAgainstNonAdjacentConstraint(points, 0, lines, tol))
    return true;
  if (
    terminalSegmentClosesAgainstNonAdjacentConstraint(
      points,
      points.length - 2,
      lines,
      tol,
    )
  )
    return true;

  return false;
}

export function isObjectiveDirectionUnbounded(
  lines: Lines,
  objective: [number, number],
  tol = 1e-6,
): boolean {
  if (lines.length === 0) {
    return false;
  }

  const [cx, cy] = objective;
  const objectiveNorm = Math.hypot(cx, cy);
  if (objectiveNorm <= tol) {
    return false;
  }

  const candidateDirections: [number, number][] = [];
  for (const [A, B] of lines) {
    const dx = -B;
    const dy = A;
    const norm = Math.hypot(dx, dy);
    if (norm <= tol) {
      continue;
    }
    candidateDirections.push([dx / norm, dy / norm], [-dx / norm, -dy / norm]);
  }
  candidateDirections.push([cx / objectiveNorm, cy / objectiveNorm]);

  return candidateDirections.some(([dx, dy]) => {
    if (cx * dx + cy * dy <= tol) {
      return false;
    }
    return lines.every(([A, B]) => A * dx + B * dy <= tol);
  });
}
