import {
  CanvasTexture,
  Group,
  LineBasicMaterial,
  PointsMaterial,
  Sprite,
  Vector2,
  Vector3,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import type { PointXY } from "../../solvers/utils/blas";

interface CanvasGroups {
  grid: Group;
  polytopeFill: Group;
  polytopeOutline: Group;
  polytopeVertices: Group;
  constraint: Group;
  objective: Group;
  traceLines: Group;
  trace: Group;
  iterate: Group;
  overlay: Group;
}

export interface ThickLineOptions {
  color: number;
  width: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  renderOrder?: number;
  transparent?: boolean;
  opacity?: number;
  dashed?: boolean;
  dashScale?: number;
  dashSize?: number;
  gapSize?: number;
}

export interface CanvasRenderHelpers {
  clearGroup(group: Group): void;
  createThickLine(positions: number[], options: ThickLineOptions): Line2;
  createCircleSpriteWithPixelSize(
    position: Vector3,
    color: number,
    pixelSize: number
  ): Sprite;
  createCircleSprite(position: Vector3, color: number, size: number): Sprite;
  createStarSprite(position: Vector3, color: number): Sprite;
  buildPositionArray(path: number[][], planarOffset?: number): Float32Array;
  buildPositionVector(entry: number[], planarOffset?: number): Vector3;
  getWorldSizeFromPixels(pixels: number, worldPosition?: Vector3): number;
  getCircleTexture(): CanvasTexture;
  getPointMaterial(options: PointMaterialOptions): PointsMaterial;
  getLineBasicMaterial(options: LineBasicMaterialOptions): LineBasicMaterial;
}

export interface PointMaterialOptions {
  color: number;
  size: number;
  sizeAttenuation: boolean;
  depthTest: boolean;
  depthWrite: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
}

export interface LineBasicMaterialOptions {
  color: number;
  transparent?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
}

export interface CanvasRenderContext {
  is3D: boolean;
  groups: CanvasGroups;
  gridSpacing: number;
  scaleFactor: number;
  offset: { x: number; y: number };
  centerX: number;
  centerY: number;
  lineResolution: Vector2;
  skipPreviewDrawing: boolean;
  helpers: CanvasRenderHelpers;
  toLogicalCoords(screenX: number, screenY: number): PointXY;
  computeObjectiveValue(x: number, y: number): number;
  scaleZValue(value: number): number;
  getPlanarOffset(offset: number): number;
  flattenTo2DProgress: number;
  getFinalPlanarOffset(offset: number): number;
  getVertexZ(x: number, y: number, extra?: number): number;
}
