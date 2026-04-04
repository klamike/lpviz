import type { Lines, Vertices } from "./blas";
import { centroid } from "./polygon";

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
