import { PointXY } from "../types/arrays";

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
