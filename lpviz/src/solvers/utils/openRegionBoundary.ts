import type { Lines, Vertices } from "./blas";
import { satisfiesLines } from "./feasibleRegion";

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

function intersectOpenBoundaryRays(rays: BoundaryRay[], lines: Lines, tol = 1e-6): [number, number] | null {
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

function intersectRayWithSegment(ray: BoundaryRay, segStart: [number, number], segEnd: [number, number], tol = 1e-6): [number, number] | null {
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
  segStart: [number, number],
  segEnd: [number, number],
  line: Lines[number],
  tol = 1e-6
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
  tol = 1e-6
): boolean {
  const segStart = points[terminalSegmentIndex];
  const segEnd = points[terminalSegmentIndex + 1];

  for (let i = 0; i < lines.length; i++) {
    if (Math.abs(i - terminalSegmentIndex) <= 1) continue;
    const intersection = intersectSegmentWithLine(segStart, segEnd, lines[i], tol);
    if (intersection && satisfiesLines(intersection, lines, tol)) {
      return true;
    }
  }

  return false;
}

export function hasOpenBoundaryClosure(points: Vertices, lines: Lines, tol = 1e-6): boolean {
  const rays = buildOpenBoundaryRays(points);
  if (intersectOpenBoundaryRays(rays, lines, tol)) return true;
  if (points.length < 4) return false;

  const [startRay, endRay] = rays;
  for (let i = 1; i < points.length - 2; i++) {
    if (intersectRayWithSegment(startRay, points[i], points[i + 1], tol)) return true;
  }
  for (let i = 0; i < points.length - 3; i++) {
    if (intersectRayWithSegment(endRay, points[i], points[i + 1], tol)) return true;
  }

  if (terminalSegmentClosesAgainstNonAdjacentConstraint(points, 0, lines, tol)) return true;
  if (terminalSegmentClosesAgainstNonAdjacentConstraint(points, points.length - 2, lines, tol)) return true;

  return false;
}
