import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  Group,
  Vector3,
  Vector2,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Euler,
  NearestFilter,
} from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { getObjectiveState, getViewState, getInteractionState } from "../state/state";
import { PointXY } from "../types/arrays";
import { transform2DTo3DAndProject, inverseTransform2DProjection } from "../utils/math3d";
import { CanvasRenderContext, CanvasRenderHelpers } from "./canvas/types";
import {
  GridRenderer,
  PolygonRenderer,
  ConstraintRenderer,
  ObjectiveRenderer,
  TraceRenderer,
  IterateRenderer,
} from "./canvas/renderers";
import { RENDER_LAYERS, STAR_POINT_PIXEL_SIZE } from "./canvas/constants";
import type { GuidedTour } from "./guidedTour";

export class CanvasManager {
  canvas: HTMLCanvasElement;
  gridSpacing = 20;
  scaleFactor = 1;
  offset = { x: 0, y: 0 };
  centerX = window.innerWidth / 2;
  centerY = window.innerHeight / 2;

  private renderer: WebGLRenderer;
  private backgroundScene: Scene;
  private transparentScene: Scene;
  private foregroundScene: Scene;
  private vertexScene: Scene;
  private overlayScene: Scene;
  private orthoCamera: OrthographicCamera;
  private perspectiveCamera: PerspectiveCamera;
  private activeCamera: PerspectiveCamera | OrthographicCamera;
  private gridGroup: Group;
  private polygonFillGroup: Group;
  private polygonOutlineGroup: Group;
  private polygonVertexGroup: Group;
  private constraintGroup: Group;
  private objectiveGroup: Group;
  private traceGroup: Group;
  private iterateGroup: Group;
  private overlayGroup: Group;
  private renderScheduled = false;
  private guidedTour: GuidedTour | null = null;
  private initialized = false;
  private starTextures = new Map<number, CanvasTexture>();
  private circleTextures = new Map<string, CanvasTexture>();
  private lineResolution = new Vector2(window.innerWidth, window.innerHeight);
  private currentPixelRatio = window.devicePixelRatio || 1;
  private screenToPlaneVec = new Vector2();
  private planeToScreenVec = new Vector2();
  private gridRenderer = new GridRenderer();
  private polygonRenderer = new PolygonRenderer();
  private constraintRenderer = new ConstraintRenderer();
  private objectiveRenderer = new ObjectiveRenderer();
  private traceRenderer = new TraceRenderer();
  private iterateRenderer = new IterateRenderer();

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.currentPixelRatio = this.getDynamicPixelRatio();
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x000000, 0);

    this.backgroundScene = new Scene();
    this.transparentScene = new Scene();
    this.foregroundScene = new Scene();
    this.vertexScene = new Scene();
    this.overlayScene = new Scene();
    this.vertexScene = new Scene();
    this.gridGroup = new Group();
    this.polygonFillGroup = new Group();
    this.polygonOutlineGroup = new Group();
    this.polygonVertexGroup = new Group();
    this.constraintGroup = new Group();
    this.objectiveGroup = new Group();
    this.traceGroup = new Group();
    this.iterateGroup = new Group();
    this.overlayGroup = new Group();

    this.backgroundScene.add(this.gridGroup);
    this.transparentScene.add(this.polygonFillGroup);
    this.foregroundScene.add(this.polygonOutlineGroup);
    this.foregroundScene.add(this.constraintGroup);
    this.foregroundScene.add(this.objectiveGroup);
    this.foregroundScene.add(this.traceGroup);
    this.foregroundScene.add(this.iterateGroup);
    this.vertexScene.add(this.polygonVertexGroup);
    this.overlayScene.add(this.overlayGroup);

    this.orthoCamera = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.perspectiveCamera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.activeCamera = this.orthoCamera;

    this.initialized = true;
    this.updateDimensions();
    this.draw();
    window.addEventListener("resize", this.handleResize);
  }

  static async create(canvas: HTMLCanvasElement) {
    return new CanvasManager(canvas);
  }

  setTourComponents(guidedTour: GuidedTour) {
    this.guidedTour = guidedTour;
  }

  private shouldSkipPreviewDrawing(): boolean {
    return this.guidedTour?.isTouring() ?? false;
  }

  private handleResize = () => {
    this.updateDimensions();
  };

  updateDimensions() {
    if (!this.initialized) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.syncRendererPixelRatio(width, height);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.lineResolution.set(width, height);

    const sidebarWidth = document.getElementById("sidebar")?.offsetWidth || 0;
    this.centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    this.centerY = window.innerHeight / 2;
  }

  draw() {
    if (!this.initialized || this.renderScheduled) {
      return;
    }

    this.syncRendererPixelRatio();

    this.renderScheduled = true;
    window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.renderFrame();
    });
  }

  private renderFrame() {
    if (!this.initialized) return;
    const viewState = getViewState();
    const is3D = viewState.is3DMode || viewState.isTransitioning3D;
    this.updateCamera();
    const context = this.buildRenderContext(is3D);
    this.gridRenderer.render(context);
    this.polygonRenderer.render(context);
    this.constraintRenderer.render(context);
    this.objectiveRenderer.render(context);
    this.traceRenderer.render(context);
    this.iterateRenderer.render(context);

    this.renderer.autoClear = true;
    this.renderer.render(this.backgroundScene, this.activeCamera);
    this.renderer.autoClear = false;
    this.renderer.render(this.transparentScene, this.activeCamera);
    this.renderer.render(this.foregroundScene, this.activeCamera);
    this.renderer.render(this.vertexScene, this.activeCamera);
    this.renderer.render(this.overlayScene, this.activeCamera);
    this.renderer.autoClear = true;
  }

  private buildRenderContext(is3D: boolean): CanvasRenderContext {
    return {
      is3D,
      groups: {
        grid: this.gridGroup,
        polygonFill: this.polygonFillGroup,
        polygonOutline: this.polygonOutlineGroup,
        polygonVertices: this.polygonVertexGroup,
        overlay: this.overlayGroup,
        constraint: this.constraintGroup,
        objective: this.objectiveGroup,
        trace: this.traceGroup,
        iterate: this.iterateGroup,
      },
      gridSpacing: this.gridSpacing,
      scaleFactor: this.scaleFactor,
      offset: this.offset,
      centerX: this.centerX,
      centerY: this.centerY,
      lineResolution: this.lineResolution,
      skipPreviewDrawing: this.shouldSkipPreviewDrawing(),
      helpers: this.getRenderHelpers(),
      toLogicalCoords: this.toLogicalCoords.bind(this),
      computeObjectiveValue: this.computeObjectiveValue.bind(this),
      scaleZValue: this.scaleZValue.bind(this),
      getPlanarOffset: this.getPlanarOffset.bind(this),
      getVertexZ: this.getVertexZ.bind(this),
    };
  }

  private getRenderHelpers(): CanvasRenderHelpers {
    return {
      clearGroup: this.clearGroup.bind(this),
      createThickLine: this.createThickLine.bind(this),
      createCircleSpriteWithPixelSize: this.createCircleSpriteWithPixelSize.bind(this),
      createCircleSprite: this.createCircleSprite.bind(this),
      createStarSprite: this.createStarSprite.bind(this),
      buildPositionArray: this.buildPositionArray.bind(this),
      buildPositionVector: this.buildPositionVector.bind(this),
      getWorldSizeFromPixels: this.getWorldSizeFromPixels.bind(this),
      getCircleTexture: this.getCircleTexture.bind(this),
    };
  }

  private updateCamera() {
    const viewState = getViewState();
    const is3D = viewState.is3DMode || viewState.isTransitioning3D;
    this.activeCamera = is3D ? this.perspectiveCamera : this.orthoCamera;

    const unitsPerPixel = this.getUnitsPerPixel();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const halfWidth = (width * unitsPerPixel) / 2;
    const halfHeight = (height * unitsPerPixel) / 2;

    const pixelOffsetX = this.centerX - width / 2;
    const pixelOffsetY = this.centerY - height / 2;
    const centerShiftX = pixelOffsetX * unitsPerPixel;
    const centerShiftY = pixelOffsetY * unitsPerPixel;

    const targetX = -this.offset.x - centerShiftX;
    const targetY = -this.offset.y + centerShiftY;

    if (!is3D) {
      this.orthoCamera.left = -halfWidth;
      this.orthoCamera.right = halfWidth;
      this.orthoCamera.top = halfHeight;
      this.orthoCamera.bottom = -halfHeight;
      this.orthoCamera.position.set(targetX, targetY, 10);
      this.orthoCamera.lookAt(new Vector3(targetX, targetY, 0));
      this.orthoCamera.updateProjectionMatrix();
    } else {
      this.perspectiveCamera.aspect = width / height;
      this.perspectiveCamera.updateProjectionMatrix();

      const target = new Vector3(targetX, targetY, 0);
      const desiredWorldHeight = height * unitsPerPixel;
      const fov = this.perspectiveCamera.fov * (Math.PI / 180);
      const baseDistance = Math.max(10, desiredWorldHeight / (2 * Math.tan(fov / 2)));
      const camEuler = new Euler(-viewState.viewAngle.x, -viewState.viewAngle.y, -viewState.viewAngle.z, "XYZ");
      const direction = new Vector3(0, 0, 1).applyEuler(camEuler).normalize();
      const position = target.clone().add(direction.multiplyScalar(baseDistance));
      this.perspectiveCamera.position.copy(position);
      const up = new Vector3(0, 1, 0).applyEuler(camEuler).normalize();
      this.perspectiveCamera.up.copy(up);
      this.perspectiveCamera.lookAt(target);
    }
  }

  toLogicalCoords(x: number, y: number): PointXY {
    const planeCoords = this.screenToPlane(x, y);
    const viewState = getViewState();
    if (viewState.is3DMode || viewState.isTransitioning3D) {
      const logical = inverseTransform2DProjection(
        { x: planeCoords.x, y: planeCoords.y },
        viewState.viewAngle,
      );
      return this.snapPoint(logical);
    }

    return this.snapPoint(this.toPoint(planeCoords));
  }

  toCanvasCoords(x: number, y: number, z?: number) {
    const viewState = getViewState();
    if (viewState.is3DMode || viewState.isTransitioning3D) {
      const zValue = z ?? this.computeObjectiveValue(x, y);
      const projected = transform2DTo3DAndProject(
        { x, y, z: this.scaleZValue(zValue) },
        viewState.viewAngle,
        viewState.focalDistance
      );
      return this.toPoint(this.planeToScreen(projected.x, projected.y));
    }

    return this.toPoint(this.planeToScreen(x, y));
  }

  private buildPositionArray(path: number[][], planarOffset = 0) {
    const arr = new Float32Array(path.length * 3);
    for (let i = 0; i < path.length; i++) {
      const vec = this.buildPositionVector(path[i], planarOffset);
      arr[i * 3] = vec.x;
      arr[i * 3 + 1] = vec.y;
      arr[i * 3 + 2] = vec.z;
    }
    return arr;
  }

  private buildPositionVector(entry: number[], planarOffset = 0) {
    const zValue =
      entry[2] !== undefined
        ? entry[2]
        : this.computeObjectiveValue(entry[0], entry[1]);
    const z = this.scaleZValue(zValue) + this.getPlanarOffset(planarOffset);
    return new Vector3(entry[0], entry[1], z);
  }

  private createStarSprite(position: Vector3, color: number) {
    const texture = this.getStarTexture(color);
    const material = new SpriteMaterial({
      map: texture,
      transparent: false,
      alphaTest: 0.5,
      depthTest: false,
      depthWrite: false,
    });
    material.color.set(color);
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    const starSize = this.getWorldSizeFromPixels(STAR_POINT_PIXEL_SIZE, position);
    sprite.scale.set(starSize, starSize, starSize);
    sprite.renderOrder = RENDER_LAYERS.iterateStar;
    return sprite;
  }

  private createCircleSprite(position: Vector3, color: number, size: number) {
    const material = new SpriteMaterial({
      map: this.getCircleTexture(),
      transparent: false,
      alphaTest: 0.5,
      depthTest: false,
      depthWrite: false,
    });
    material.color.set(color);
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(size, size, size);
    return sprite;
  }

  private createCircleSpriteWithPixelSize(position: Vector3, color: number, pixelSize: number) {
    const worldSize = this.getWorldSizeFromPixels(pixelSize, position);
    return this.createCircleSprite(position, color, worldSize);
  }

  private getStarTexture(color: number) {
    let texture = this.starTextures.get(color);
    if (texture) return texture;

    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();
    const spikes = 5;
    const outerRadius = size / 2;
    const innerRadius = size / 4;
    let rot = (Math.PI / 2) * 3;
    let x = size / 2;
    let y = size / 2;
    const step = Math.PI / spikes;

    ctx.moveTo(size / 2, size / 2 - outerRadius / 1.5);
    for (let i = 0; i < spikes; i++) {
      x = size / 2 + Math.cos(rot) * outerRadius;
      y = size / 2 + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = size / 2 + Math.cos(rot) * innerRadius;
      y = size / 2 + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(size / 2, size / 2 - outerRadius / 1.5);
    ctx.fill();

    texture = new CanvasTexture(canvas);
    this.starTextures.set(color, texture);
    return texture;
  }

  private getWorldSizeFromPixels(pixels: number, worldPosition?: Vector3) {
    if (this.activeCamera instanceof PerspectiveCamera && worldPosition) {
      const camera = this.perspectiveCamera;
      const distance = camera.position.distanceTo(worldPosition);
      const vFov = (camera.fov * Math.PI) / 180;
      const viewportHeight = 2 * Math.tan(vFov / 2) * distance;
      const worldPerPixel = viewportHeight / this.lineResolution.y;
      return pixels * worldPerPixel;
    }
    return pixels / this.getPixelsPerUnit();
  }

  getPixelsPerUnit(scale = this.scaleFactor) {
    return this.gridSpacing * scale || 1;
  }

  getUnitsPerPixel(scale = this.scaleFactor) {
    return 1 / this.getPixelsPerUnit(scale);
  }

  private screenToPlane(screenX: number, screenY: number) {
    const unitsPerPixel = this.getUnitsPerPixel();
    this.screenToPlaneVec
      .set(screenX - this.centerX, this.centerY - screenY)
      .multiplyScalar(unitsPerPixel);
    this.screenToPlaneVec.x -= this.offset.x;
    this.screenToPlaneVec.y -= this.offset.y;
    return this.screenToPlaneVec;
  }

  private planeToScreen(worldX: number, worldY: number) {
    const pixelsPerUnit = this.getPixelsPerUnit();
    this.planeToScreenVec.set(worldX + this.offset.x, worldY + this.offset.y).multiplyScalar(pixelsPerUnit);
    this.planeToScreenVec.set(
      this.centerX + this.planeToScreenVec.x,
      this.centerY - this.planeToScreenVec.y
    );
    return this.planeToScreenVec;
  }

  private toPoint(vec: Vector2): PointXY {
    return { x: vec.x, y: vec.y };
  }

  private snapPoint(point: PointXY) {
    if (getInteractionState().snapToGrid) {
      point.x = Math.round(point.x);
      point.y = Math.round(point.y);
    }
    return point;
  }

  setOffsetForAnchor(screenX: number, screenY: number, logicalPoint: PointXY, scale = this.scaleFactor) {
    const unitsPerPixel = this.getUnitsPerPixel(scale);
    this.offset.x = (screenX - this.centerX) * unitsPerPixel - logicalPoint.x;
    this.offset.y = (this.centerY - screenY) * unitsPerPixel - logicalPoint.y;
  }

  panByScreenDelta(deltaX: number, deltaY: number) {
    const unitsPerPixel = this.getUnitsPerPixel();
    this.offset.x += deltaX * unitsPerPixel;
    this.offset.y -= deltaY * unitsPerPixel;
  }

  private getDynamicPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1;
    const zoomFactor = Math.min(4, Math.max(1, this.scaleFactor));
    return Math.min(4, deviceRatio * zoomFactor);
  }

  private syncRendererPixelRatio(width?: number, height?: number) {
    const ratio = this.getDynamicPixelRatio();
    if (ratio === this.currentPixelRatio) {
      return;
    }
    this.currentPixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    const targetWidth = width ?? window.innerWidth;
    const targetHeight = height ?? window.innerHeight;
    this.renderer.setSize(targetWidth, targetHeight, false);
  }

  private clearGroup(group: Group) {
    group.children.forEach((child) => {
      const mesh = child as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
      const geometry = mesh.geometry;
      if (geometry && typeof geometry.dispose === "function") {
        geometry.dispose();
      }
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((mat) => mat?.dispose?.());
      } else if (material && typeof material.dispose === "function") {
        material.dispose();
      }
    });
    group.clear();
  }

  private computeObjectiveValue(x: number, y: number) {
    const objective = getObjectiveState();
    if (!objective.objectiveVector) return 0;
    return objective.objectiveVector.x * x + objective.objectiveVector.y * y;
  }

  private scaleZValue(value: number) {
    return (value * getViewState().zScale) / 100;
  }

  private getPlanarOffset(offset: number) {
    const viewState = getViewState();
    return viewState.is3DMode || viewState.isTransitioning3D ? 0 : offset;
  }

  private getVertexZ(x: number, y: number, extra = 0) {
    const base = this.scaleZValue(this.computeObjectiveValue(x, y));
    return base + this.getPlanarOffset(extra);
  }

  private createThickLine(
    positions: number[],
    {
      color,
      width,
      depthTest = true,
      depthWrite = true,
      renderOrder = 0,
    }: {
      color: number;
      width: number;
      depthTest?: boolean;
      depthWrite?: boolean;
      renderOrder?: number;
    }
  ) {
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color,
      linewidth: width,
      transparent: false,
      opacity: 1,
      depthTest,
      depthWrite,
    });
    material.resolution.copy(this.lineResolution);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.renderOrder = renderOrder;
    return line;
  }

  private getCircleTexture() {
    const deviceRatio = Math.max(1, Math.round((window.devicePixelRatio || 1)));
    const scaleBucket = Math.min(4, Math.max(1, Math.round(this.scaleFactor)));
    const cacheKey = `circle-${deviceRatio}-${scaleBucket}`;
    let texture = this.circleTextures.get(cacheKey);
    if (texture) return texture;
    const size = 64 * deviceRatio * scaleBucket;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();
    const radius = size / 2;
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();
    texture = new CanvasTexture(canvas);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.needsUpdate = true;
    this.circleTextures.set(cacheKey, texture);
    return texture;
  }

}
