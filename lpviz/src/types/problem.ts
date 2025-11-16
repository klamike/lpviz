import type { Lines, Vertices } from "./arrays";

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

export function hasPolytopeLines(polytope: PolytopeRepresentation | null | undefined): polytope is PolytopeRepresentation & { lines: NonEmptyLines } {
  return Boolean(polytope && polytope.lines.length > 0);
}

export function hasPolytopeVertices(polytope: PolytopeRepresentation | null | undefined): polytope is PolytopeRepresentation & { vertices: NonEmptyVertices } {
  return Boolean(polytope && polytope.vertices.length > 0);
}
