import { centroid } from "@lpviz/math/geometry";
import type { Lines, Vertices } from "@lpviz/math/types";

export interface ConstraintRep {
  inequalities: string[];
  lines: Lines;
}

export function formatConstraintNumber(value: number): number {
  return value === Math.floor(value) ? value : parseFloat(value.toFixed(3));
}

export function formatConstraint(A: number, B: number, C: number): string {
  const normalizedA = formatConstraintNumber(A);
  const normalizedB = formatConstraintNumber(B);
  const normalizedC = formatConstraintNumber(C);

  const inequalitySign = "≤";

  let xTerm = "";
  if (normalizedA === 1) xTerm = "x";
  else if (normalizedA === -1) xTerm = "-x";
  else if (normalizedA !== 0) xTerm = `${normalizedA}x`;

  let yTerm = "";
  if (normalizedB !== 0) {
    const absoluteB = Math.abs(normalizedB);
    const yMagnitude = absoluteB === 1 ? "y" : `${absoluteB}y`;

    if (normalizedA === 0) {
      yTerm = normalizedB < 0 ? `-${yMagnitude}` : yMagnitude;
    } else {
      yTerm = normalizedB < 0 ? ` - ${yMagnitude}` : ` + ${yMagnitude}`;
    }
  }

  if (xTerm === "" && yTerm === "") {
    return `0 ${inequalitySign} ${normalizedC}`;
  }

  return `${xTerm}${yTerm} ${inequalitySign} ${normalizedC}`.trim();
}

export function buildConstraintRep(
  points: Vertices,
  closed: boolean,
  tol = 1e-6,
): ConstraintRep {
  const inequalities: string[] = [];
  const lines: Lines = [];
  const pointCount = points.length;
  if (pointCount < 2) {
    return { inequalities, lines };
  }

  const interiorPoint = closed || pointCount >= 3 ? centroid(points) : null;
  const edgeCount = closed ? pointCount : pointCount - 1;

  for (let index = 0; index < edgeCount; index++) {
    const start = points[index];
    const end = points[(index + 1) % pointCount];

    const A = end[1] - start[1];
    const B = -(end[0] - start[0]);
    const normalLength = Math.hypot(A, B);
    if (normalLength < tol) {
      continue;
    }

    let normalizedA = A / normalLength;
    let normalizedB = B / normalLength;
    let normalizedC = normalizedA * start[0] + normalizedB * start[1];

    if (
      interiorPoint &&
      normalizedA * interiorPoint[0] + normalizedB * interiorPoint[1] >
        normalizedC + tol
    ) {
      normalizedA = -normalizedA;
      normalizedB = -normalizedB;
      normalizedC = -normalizedC;
    } else if (!interiorPoint) {
      normalizedA = -normalizedA;
      normalizedB = -normalizedB;
      normalizedC = -normalizedC;
    }

    inequalities.push(formatConstraint(normalizedA, normalizedB, normalizedC));
    lines.push([normalizedA, normalizedB, normalizedC]);
  }

  return { inequalities, lines };
}
