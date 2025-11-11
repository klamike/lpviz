import type { PointXY, Vertices, Lines } from "../../types/arrays";

export interface GeometrySlice {
  vertices: PointXY[];
  currentMouse: PointXY | null;
  polygonComplete: boolean;
  interiorPoint: PointXY | null;
  computedVertices: Vertices;
  computedLines: Lines;
  analyticCenter: PointXY | null;
}

export const createGeometrySlice = (): GeometrySlice => ({
  vertices: [],
  currentMouse: null,
  polygonComplete: false,
  interiorPoint: null,
  computedVertices: [],
  computedLines: [],
  analyticCenter: null,
});
