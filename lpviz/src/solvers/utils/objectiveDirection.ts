import type { Lines, PointXY } from "./blas";
import { hasPolytopeLines, type PolytopeRepresentation } from "./polytopeTypes";

export interface ObjectiveRotationStep {
  nextObjective: PointXY;
  nextDirection: 1 | -1;
}

export function isObjectiveDirectionUnbounded(lines: Lines, objective: [number, number], tol = 1e-6): boolean {
  if (lines.length === 0) {
    return false;
  }

  const [cx, cy] = objective;
  const objectiveNorm = Math.hypot(cx, cy);
  if (objectiveNorm <= tol) {
    return false;
  }

  const candidateDirections: [number, number][] = [];
  for (const [A, B] of lines) {
    const dx = -B;
    const dy = A;
    const norm = Math.hypot(dx, dy);
    if (norm <= tol) {
      continue;
    }
    candidateDirections.push([dx / norm, dy / norm], [-dx / norm, -dy / norm]);
  }
  candidateDirections.push([cx / objectiveNorm, cy / objectiveNorm]);

  return candidateDirections.some(([dx, dy]) => {
    if (cx * dx + cy * dy <= tol) {
      return false;
    }
    return lines.every(([A, B]) => A * dx + B * dy <= tol);
  });
}

export function computeObjectiveRotationStep({
  objectiveVector,
  angleStep,
  rotationDirection,
  polytope,
}: {
  objectiveVector: PointXY;
  angleStep: number;
  rotationDirection: 1 | -1;
  polytope: PolytopeRepresentation | null;
}): ObjectiveRotationStep {
  const angle = Math.atan2(objectiveVector.y, objectiveVector.x);
  const magnitude = Math.hypot(objectiveVector.x, objectiveVector.y);

  let nextDirection: 1 | -1 = rotationDirection;
  let nextAngle = angle + angleStep * nextDirection;

  if (hasPolytopeLines(polytope) && polytope.kind === "unbounded") {
    const candidateDirections: Array<1 | -1> = [rotationDirection, rotationDirection === 1 ? -1 : 1];
    const allowedDirection = candidateDirections.find((direction) => {
      const candidateAngle = angle + angleStep * direction;
      const candidateObjective: [number, number] = [magnitude * Math.cos(candidateAngle), magnitude * Math.sin(candidateAngle)];
      return !isObjectiveDirectionUnbounded(polytope.lines, candidateObjective);
    });

    if (allowedDirection !== undefined) {
      nextDirection = allowedDirection;
      nextAngle = angle + angleStep * nextDirection;
    }
  }

  return {
    nextObjective: {
      x: magnitude * Math.cos(nextAngle),
      y: magnitude * Math.sin(nextAngle),
    },
    nextDirection,
  };
}
