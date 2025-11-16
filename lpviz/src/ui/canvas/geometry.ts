import { PointXY, Line } from "../../types/arrays";

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const EPS = 1e-10;
const ARROW_HALF_ANGLE = Math.PI / 6;

export function clipLineToBounds(line: Line, bounds: Bounds): [PointXY, PointXY] | null {
  const [A, B, C] = line;
  if (Math.abs(A) < EPS && Math.abs(B) < EPS) return null;

  if (Math.abs(B) > Math.abs(A)) {
    return [
      { x: bounds.minX, y: (C - A * bounds.minX) / B },
      { x: bounds.maxX, y: (C - A * bounds.maxX) / B },
    ];
  }
  return [
    { y: bounds.minY, x: (C - B * bounds.minY) / A },
    { y: bounds.maxY, x: (C - B * bounds.maxY) / A },
  ];
}

export function buildArrowHeadSegments(tip: PointXY, angle: number, length: number): Array<[number, number, number, number]> {
  return [ARROW_HALF_ANGLE, -ARROW_HALF_ANGLE].map((offset) => {
    const targetAngle = angle + offset;
    const x2 = tip.x - length * Math.cos(targetAngle);
    const y2 = tip.y - length * Math.sin(targetAngle);
    return [tip.x, tip.y, x2, y2];
  });
}
