import type { Lines, Vertices } from "@lpviz/math/types";
import type { BoundaryRay, RegionKind } from "@lpviz/math/geometry";

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
