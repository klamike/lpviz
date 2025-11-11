import { CanvasTexture, Group, Sprite, Vector2, Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { PointXY } from "../../types/arrays";

export interface CanvasGroups {
  grid: Group;
  polygonFill: Group;
  polygonOutline: Group;
  polygonVertices: Group;
  constraint: Group;
  objective: Group;
  trace: Group;
  iterate: Group;
  overlay: Group;
}

export interface ThickLineOptions {
  color: number;
  width: number;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  renderOrder?: number;
}

export interface CanvasRenderHelpers {
  clearGroup(group: Group): void;
  createThickLine(positions: number[], options: ThickLineOptions): Line2;
  createCircleSpriteWithPixelSize(position: Vector3, color: number, pixelSize: number): Sprite;
  createCircleSprite(position: Vector3, color: number, size: number): Sprite;
  createStarSprite(position: Vector3, color: number): Sprite;
  buildPositionArray(path: number[][], planarOffset?: number): Float32Array;
  buildPositionVector(entry: number[], planarOffset?: number): Vector3;
  getWorldSizeFromPixels(pixels: number, worldPosition?: Vector3): number;
  getCircleTexture(): CanvasTexture;
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
  getVertexZ(x: number, y: number, extra?: number): number;
}

export interface CanvasLayerRenderer {
  render(context: CanvasRenderContext): void;
}
