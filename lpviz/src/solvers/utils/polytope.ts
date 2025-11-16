import type { PointXY, Lines, Vertices } from "./blas";

type NonEmptyArray<T> = [T, ...T[]];

export interface PolytopeRepresentation {
  inequalities: string[];
  lines: Lines;
  vertices: Vertices;
}

export type NonEmptyLines = NonEmptyArray<Lines[number]>;
export type NonEmptyVertices = NonEmptyArray<Vertices[number]>;

export const EMPTY_POLYTOPE: PolytopeRepresentation = {
  inequalities: [],
  lines: [],
  vertices: [],
};

export function hasPolytopeLines(polytope: PolytopeRepresentation | null | undefined): polytope is PolytopeRepresentation & {
  lines: NonEmptyLines;
} {
  return Boolean(polytope && polytope.lines.length > 0);
}

export function hasPolytopeVertices(polytope: PolytopeRepresentation | null | undefined): polytope is PolytopeRepresentation & {
  vertices: NonEmptyVertices;
} {
  return Boolean(polytope && polytope.vertices.length > 0);
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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

  toPolytopeRepresentation(): PolytopeRepresentation {
    return polytope(this.toVertices());
  }
}

export function centroid(vertices: Vertices) {
  if (vertices.length === 0) throw new Error("No intersections found");
  let sumX = 0, sumY = 0;
  for (const p of vertices) {
    sumX += p[0];
    sumY += p[1];
  }
  return [sumX / vertices.length, sumY / vertices.length];
}

const polytope_format_float = (x: number) => x === Math.floor(x) ? x : parseFloat(x.toFixed(3));

function polytope_format(A: number, B: number, C: number) {
  let A_disp = polytope_format_float(A);
  let B_disp = polytope_format_float(B);
  let C_disp = polytope_format_float(C);

  const ineq_sign = "≤";

  let Ax_str = "";
  if (A_disp === 1) Ax_str = "x";
  else if (A_disp === -1) Ax_str = "-x";
  else if (A_disp !== 0) Ax_str = `${A_disp}x`;

  let By_str = "";
  if (B_disp !== 0) {
    const B_abs_val = Math.abs(B_disp);
    const B_term_val = B_abs_val === 1 ? "y" : `${B_abs_val}y`;

    if (A_disp === 0) {
      By_str = B_disp < 0 ? `-${B_term_val}` : B_term_val;
    } else {
      By_str = B_disp < 0 ? ` - ${B_term_val}` : ` + ${B_term_val}`;
    }
  }

  if (Ax_str === "" && By_str === "") {
    return `0 ${ineq_sign} ${C_disp}`;
  }

  return `${Ax_str}${By_str} ${ineq_sign} ${C_disp}`.trim();
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

  // Deduplicate close points
  const unique: Vertices = [];
  intersections.forEach(([x, y]) => {
    const existing = unique.find(([ux, uy]) => Math.hypot(ux - x, uy - y) < tol);
    if (!existing) unique.push([x, y]);
  });

  if (unique.length <= 2) {
    return unique.map(([x, y]) => [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))]);
      }

  const center = centroid(unique);
  return unique
    .map(([x, y]) => ({
      angle: Math.atan2(y - center[1], x - center[0]),
      point: [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))] as [number, number],
    }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ point }) => point);
}

type PolytopeEdges = Pick<PolytopeRepresentation, "inequalities" | "lines">;

function polytope_edges(points: Vertices, tol = 1e-6): PolytopeEdges {
  // Walk the points and form lines between them.
  // NOTE: This function is written as if the `points` always represent a closed polytope.
  //       While the user is still drawing, the frontend will not display the last line.
  const inequalities: string[] = [];
  const lines: Lines = [];
  const n = points.length;
  if (n < 2) return { inequalities, lines };

  const interior = centroid(points);

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];

    const A = p2[1] - p1[1];
    const B = -(p2[0] - p1[0]);
    const normAB = Math.sqrt(A * A + B * B);
    if (normAB < tol) continue;

    let Anorm = A / normAB;
    let Bnorm = B / normAB;
    let Cnorm = Anorm * p1[0] + Bnorm * p1[1];

    if (Anorm * interior[0] + Bnorm * interior[1] > Cnorm + tol) {
      Anorm = -Anorm;
      Bnorm = -Bnorm;
      Cnorm = -Cnorm;
    }
    inequalities.push(polytope_format(Anorm, Bnorm, Cnorm));
    lines.push([Anorm, Bnorm, Cnorm]);
  }

  return { inequalities, lines };
}

export function polytope(points: Vertices): PolytopeRepresentation {
  if (points.length > 256) {
    throw new Error("points.length > 256 not allowed");
  }

  const { inequalities, lines } = polytope_edges(points);
  const vertices = verticesFromLines(lines);

  return {
    inequalities,
    vertices,
    lines,
  };
}
