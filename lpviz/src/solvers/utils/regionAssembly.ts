import type { Vertices } from "./blas";
import { buildConstraintDerivation } from "./constraintDerivation";
import { classifyRegion, findFeasiblePoint } from "./feasibleRegion";
import { verticesFromLines } from "./halfPlaneIntersection";
import { buildOpenBoundaryRays, hasOpenBoundaryClosure } from "./openRegionBoundary";
import type { PolytopeRepresentation } from "./polytopeTypes";

export function deriveRegionFromPoints(points: Vertices, completionMode: "closed" | "open"): PolytopeRepresentation {
  if (points.length > 256) {
    throw new Error("points.length > 256 not allowed");
  }

  const closed = completionMode === "closed";
  const { inequalities, lines } = buildConstraintDerivation(points, closed);

  if (!closed) {
    const allVertices = verticesFromLines(lines);
    const boundaryRays = buildOpenBoundaryRays(points);
    const feasiblePoint = findFeasiblePoint(lines);
    const hasClosure = hasOpenBoundaryClosure(points, lines);
    const kind: PolytopeRepresentation["kind"] =
      hasClosure && allVertices.length >= 3 ? "bounded" : feasiblePoint ? "unbounded" : "empty";
    const vertices = hasClosure && allVertices.length >= 3 ? allVertices : [];

    return {
      kind,
      inequalities,
      vertices,
      lines,
      boundaryRays: kind === "unbounded" ? boundaryRays : [],
    };
  }

  const vertices = verticesFromLines(lines);
  const kind = classifyRegion(lines, vertices, true);

  return {
    kind,
    inequalities,
    vertices,
    lines,
    boundaryRays: [],
  };
}
