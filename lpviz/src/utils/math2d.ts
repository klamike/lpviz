import { PointXY, Lines, Vertices } from "../types/arrays";

export const distance = (p1: PointXY, p2: PointXY) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
export const pointCentroid = (pts: PointXY[]) => ({
  x: pts.reduce((s: number, pt: PointXY) => s + pt.x, 0) / pts.length,
  y: pts.reduce((s: number, pt: PointXY) => s + pt.y, 0) / pts.length,
});
export const isPolygonConvex = (pts: PointXY[]) => {
  if (pts.length < 3) return true;
  let prevCross = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    const p2 = pts[(i + 2) % n];
    const cross =
      (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (cross !== 0) {
      if (prevCross === 0) prevCross = cross;
      else if (Math.sign(cross) !== Math.sign(prevCross)) return false;
    }
  }
  return true;
};
export const isPointInsidePolygon = (point: PointXY, poly: PointXY[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    if (
      (yi > point.y) !== (yj > point.y) &&
      point.x <
        ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};
export const isPointNearSegment = (point: PointXY, v1: PointXY, v2: PointXY) => {
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const len2 = dx * dx + dy * dy;
  const t =
    ((point.x - v1.x) * dx + (point.y - v1.y) * dy) / len2;
  if (t < 0 || t > 1) return false;
  const proj = { x: v1.x + t * dx, y: v1.y + t * dy };
  const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
  return dist < 0.5;
};

export function centroid(vertices: Vertices) {
    const n = vertices.length;
    if (n === 0) {
        throw new Error("No intersections found");
    }

    let sumX = 0;
    let sumY = 0;
    for (const p of vertices) {
        sumX += p[0];
        sumY += p[1];
    }
    return [sumX / n, sumY / n];
}

function polytope_format_float(x: number) {
    return x === Math.floor(x) ? x : parseFloat(x.toFixed(3));
}

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

function polytope_points(lines: Lines, tol = 1e-6) {
    const poly_vertices: Vertices = [];
    const n = lines.length;

    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            const [A1, B1, C1] = lines[i];
            const [A2, B2, C2] = lines[j];
            const det = A1 * B2 - A2 * B1;

            if (Math.abs(det) < tol) continue;

            const x = (C1 * B2 - C2 * B1) / det;
            const y = (A1 * C2 - A2 * C1) / det;

            let all_lines_satisfied = true;
            for (const line of lines) {
                const [A, B, C] = line;
                if (A * x + B * y > C + tol) {
                    all_lines_satisfied = false;
                    break;
                }
            }

            if (all_lines_satisfied) {
                poly_vertices.push([parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))]);
            }
        }
    }

    return poly_vertices;
}

function polytope_edges(points: Vertices, tol = 1e-6) {
    // Walk the points and form lines between them.
    // NOTE: This function is written as if the `points` always represent a closed polygon.
    //       While the user is still drawing, the frontend will not display the last line.
    const inequalities: string[] = [];
    const lines: Lines = [];
    const n = points.length;
    if (n < 2) return { inequalities, lines }; 

    const interior = centroid(points);

    for (let i = 0; i < n; i++) {
        const p1 = points[i];
        const p2 = points[i === n - 1 ? 0 : i + 1];

        const A = p2[1] - p1[1];
        const B = -(p2[0] - p1[0]);
        const C_original = A * p1[0] + B * p1[1]; // Used for formatting

        const normAB = Math.sqrt(A * A + B * B);
        if (normAB < tol) continue;

        let Anorm = A / normAB;
        let Bnorm = B / normAB;
        let Cnorm = Anorm * p1[0] + Bnorm * p1[1]; // C for the normalized equation Ax + By = C

        if (Anorm * interior[0] + Bnorm * interior[1] > Cnorm + tol) {
            Anorm = -Anorm;
            Bnorm = -Bnorm;
            Cnorm = -Cnorm;
        }
        inequalities.push(polytope_format(A, B, C_original));
        lines.push([Anorm, Bnorm, Cnorm]);
    }

    return { inequalities, lines };
}

export function polytope(points: Vertices) {
    if (points.length > 256) {
        throw new Error("points.length > 256 not allowed");
    }

    const { inequalities, lines } = polytope_edges(points);
    const vertices = polytope_points(lines);

    return {
        "inequalities": inequalities,
        "vertices": vertices,
        "lines": lines
    };
}
