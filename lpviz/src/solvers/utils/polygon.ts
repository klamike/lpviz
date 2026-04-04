import type { PointXY, Vertices } from "./blas";

interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function isConvexChain(points: ReadonlyArray<PointXY>, tol = 1e-9): boolean {
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

export function signedArea(points: ReadonlyArray<PointXY>, tol = 1e-12): number {
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

  boundingBox(): BoundingBox | null {
    if (this.points.length === 0) {
      return null;
    }
    let minX = this.points[0].x;
    let maxX = this.points[0].x;
    let minY = this.points[0].y;
    let maxY = this.points[0].y;
    for (let i = 1; i < this.points.length; i++) {
      const point = this.points[i];
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return { minX, maxX, minY, maxY };
  }

  isConvex(): boolean {
    if (this.points.length < 3) return true;
    let prevCross = 0;
    for (let i = 0, n = this.points.length; i < n; i++) {
      const p0 = this.points[i];
      const p1 = this.points[(i + 1) % n];
      const p2 = this.points[(i + 2) % n];
      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
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
    for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
      const xi = this.points[i].x;
      const yi = this.points[i].y;
      const xj = this.points[j].x;
      const yj = this.points[j].y;
      if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
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

    const sorted = [...this.points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

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

    const cross = (o: PointXY, a: PointXY, b: PointXY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower: PointXY[] = [];
    for (const pt of uniqueSorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) {
        lower.pop();
      }
      lower.push({ x: pt.x, y: pt.y });
    }

    const upper: PointXY[] = [];
    for (let i = uniqueSorted.length - 1; i >= 0; i--) {
      const pt = uniqueSorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) {
        upper.pop();
      }
      upper.push({ x: pt.x, y: pt.y });
    }

    lower.pop();
    upper.pop();

    const hull = lower.concat(upper);
    return hull.length > 0 ? hull : uniqueSorted.map((pt) => ({ x: pt.x, y: pt.y }));
  }

  toVertices(): Vertices {
    return this.points.map((pt) => [pt.x, pt.y]);
  }
}
