import type { Lines, Vertices } from "@lpviz/math/types";
import { deriveRegionFromPoints } from "@lpviz/polytope/regionAssembly";

const CONSTRAINT_COUNT = 20;

function createRegularPolygonVertices(count: number, radius: number): Vertices {
  return Array.from({ length: count }, (_, index) => {
    const theta = (2 * Math.PI * index) / count;
    return [radius * Math.cos(theta), radius * Math.sin(theta)];
  });
}

const polytope = deriveRegionFromPoints(
  createRegularPolygonVertices(CONSTRAINT_COUNT, 6),
  "closed",
);

if (polytope.kind !== "bounded") {
  throw new Error(
    `20-constraint benchmark fixture must be bounded, got ${polytope.kind}`,
  );
}

if (polytope.lines.length !== CONSTRAINT_COUNT) {
  throw new Error(
    `20-constraint benchmark fixture built ${polytope.lines.length} constraints`,
  );
}

export const problem20 = {
  name: "regular-20-gon",
  lines: polytope.lines as Lines,
  vertices: polytope.vertices,
  objective: Float64Array.of(1.25, 0.75),
} as const;
