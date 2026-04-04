import type { Lines, Vertices } from "./blas";
import type { RegionKind } from "./feasibleRegion";
import type { BoundaryRay } from "./openRegionBoundary";

type NonEmptyArray<T> = [T, ...T[]];
type NonEmptyLines = NonEmptyArray<Lines[number]>;
type NonEmptyVertices = NonEmptyArray<Vertices[number]>;

export interface PolytopeRepresentation {
  kind: RegionKind;
  inequalities: string[];
  lines: Lines;
  vertices: Vertices;
  boundaryRays: BoundaryRay[];
}

export function hasPolytopeLines(
  polytope: PolytopeRepresentation | null | undefined,
): polytope is PolytopeRepresentation & { lines: NonEmptyLines } {
  return Boolean(polytope && polytope.lines.length > 0);
}

export function hasPolytopeVertices(
  polytope: PolytopeRepresentation | null | undefined,
): polytope is PolytopeRepresentation & { vertices: NonEmptyVertices } {
  return Boolean(polytope && polytope.vertices.length > 0);
}
