import { WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Group, Vector3, Vector2, Sprite, SpriteMaterial, CanvasTexture, Euler, NearestFilter, PointsMaterial, Material, LineBasicMaterial, MOUSE } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { AlwaysVisibleLineGeometry } from "./rendering/three/AlwaysVisibleLineGeometry";
import { UndashedLine2 } from "./rendering/three/UndashedLine2";
import { getState, setState } from "../state/store";
import type { PointXY, PointXYZ } from "../solvers/utils/blas";
import { transform2DTo3DAndProject, inverseTransform2DProjection } from "./rendering/math3d";
import { CanvasRenderContext, CanvasRenderHelpers, LineBasicMaterialOptions, PointMaterialOptions, ThickLineOptions } from "./rendering/types";
import { CanvasRenderPipeline } from "./rendering/pipeline";
import { RENDER_LAYERS, STAR_POINT_PIXEL_SIZE } from "./rendering/constants";
import type { Tour } from "./tour/tour";

export class ViewportManager {
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
  private traceScene: Scene;
  private overlayScene: Scene;
  private orthoCamera: OrthographicCamera;
  private perspectiveCamera: PerspectiveCamera;
  private activeCamera: PerspectiveCamera | OrthographicCamera;
  private gridGroup: Group;
  private polytopeFillGroup: Group;
  private polytopeOutlineGroup: Group;
  private polytopeVertexGroup: Group;
  private constraintGroup: Group;
  private objectiveGroup: Group;
  private traceGroup: Group;
  private iterateGroup: Group;
  private overlayGroup: Group;
  private renderScheduled = false;
  private tour: Tour | null = null;
  private initialized = false;
  private starTextures = new Map<number, CanvasTexture>();
  private circleTextures = new Map<string, CanvasTexture>();
  private lineMaterialCache = new Map<string, LineMaterial>();
  private lineBasicMaterialCache = new Map<string, LineBasicMaterial>();
  private pointsMaterialCache = new Map<string, PointsMaterial>();
  private spriteMaterialCache = new Map<string, SpriteMaterial>();
  private cachedMaterials = new Set<Material>();
  private lineResolution = new Vector2(window.innerWidth, window.innerHeight);
  private currentPixelRatio = window.devicePixelRatio || 1;
  private screenToPlaneVec = new Vector2();
  private planeToScreenVec = new Vector2();
  private renderPipeline = new CanvasRenderPipeline();
  private orbitControls: OrbitControls;
  private orbitControlsActive = false;

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
    this.traceScene = new Scene();
    this.overlayScene = new Scene();
    this.gridGroup = new Group();
    this.polytopeFillGroup = new Group();
    this.polytopeOutlineGroup = new Group();
    this.polytopeVertexGroup = new Group();
    this.constraintGroup = new Group();
    this.objectiveGroup = new Group();
    this.traceGroup = new Group();
    this.iterateGroup = new Group();
    this.overlayGroup = new Group();

    this.backgroundScene.add(this.gridGroup);
    this.transparentScene.add(this.polytopeFillGroup);
    this.foregroundScene.add(this.polytopeOutlineGroup);
    this.foregroundScene.add(this.constraintGroup);
    this.foregroundScene.add(this.objectiveGroup);
    this.vertexScene.add(this.polytopeVertexGroup);
    this.traceScene.add(this.traceGroup);
    this.traceScene.add(this.iterateGroup);
    this.overlayScene.add(this.overlayGroup);

    this.orthoCamera = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.perspectiveCamera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.activeCamera = this.orthoCamera;
    this.orbitControls = new OrbitControls(this.perspectiveCamera, this.canvas);
    this.orbitControls.enabled = false;
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.enableRotate = false;
    this.orbitControls.addEventListener("change", () => this.draw());

    this.initialized = true;
    this.updateDimensions();
    this.draw();
    window.addEventListener("resize", this.handleResize);
  }

  static async create(canvas: HTMLCanvasElement) {
    return new ViewportManager(canvas);
  }

  attachTour(tour: Tour) {
    this.tour = tour;
  }

  private shouldSkipPreviewDrawing(): boolean {
    return this.tour?.isTouring() ?? false;
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
    this.centerX = sidebarWidth + (width - sidebarWidth) / 2;
    this.centerY = height / 2;
  }

  draw() {
    if (!this.initialized || this.renderScheduled) return;

    this.syncRendererPixelRatio();
    this.renderScheduled = true;
    window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.renderFrame();
    });
  }

  private renderFrame() {
    if (!this.initialized) return;
    const { is3DMode, isTransitioning3D } = getState();
    const is3D = is3DMode || isTransitioning3D;
    if (this.orbitControlsActive) {
      this.orbitControls.update();
    }
    this.updateCamera();
    const context = this.buildRenderContext(is3D);
    this.renderPipeline.render(context);

    this.renderer.autoClear = true;
    this.renderer.render(this.backgroundScene, this.activeCamera);
    this.renderer.autoClear = false;
    [this.transparentScene, this.foregroundScene, this.vertexScene, this.traceScene, this.overlayScene].forEach((scene) => this.renderer.render(scene, this.activeCamera));
    this.renderer.autoClear = true;
  }

  private buildRenderContext(is3D: boolean): CanvasRenderContext {
    return {
      is3D,
      groups: {
        grid: this.gridGroup,
        polytopeFill: this.polytopeFillGroup,
        polytopeOutline: this.polytopeOutlineGroup,
        polytopeVertices: this.polytopeVertexGroup,
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
      getPointMaterial: this.getPointMaterial.bind(this),
      getLineBasicMaterial: this.getLineBasicMaterial.bind(this),
    };
  }

  private updateCamera() {
    const state = getState();
    const transitioning = state.isTransitioning3D;
    const is3D = state.is3DMode || transitioning;
    if (!is3D) {
      this.deactivateOrbitControls();
      this.activeCamera = this.orthoCamera;

      const unitsPerPixel = this.getUnitsPerPixel();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const halfWidth = (width * unitsPerPixel) / 2;
      const halfHeight = (height * unitsPerPixel) / 2;

      const centerShiftX = (this.centerX - width / 2) * unitsPerPixel;
      const centerShiftY = (this.centerY - height / 2) * unitsPerPixel;

      const targetX = -this.offset.x - centerShiftX;
      const targetY = -this.offset.y + centerShiftY;

      this.orthoCamera.left = -halfWidth;
      this.orthoCamera.right = halfWidth;
      this.orthoCamera.top = halfHeight;
      this.orthoCamera.bottom = -halfHeight;
      this.orthoCamera.position.set(targetX, targetY, 10);
      this.orthoCamera.lookAt(new Vector3(targetX, targetY, 0));
      this.orthoCamera.updateProjectionMatrix();
      return;
    }

    this.activeCamera = this.perspectiveCamera;
    this.perspectiveCamera.aspect = window.innerWidth / window.innerHeight;
    this.perspectiveCamera.updateProjectionMatrix();

    if (transitioning) {
      this.deactivateOrbitControls();
      this.positionPerspectiveCamera(state.viewAngle);
      return;
    }

    if (!this.orbitControlsActive) {
      this.activateOrbitControls();
    }
  }

  toLogicalCoords(x: number, y: number): PointXY {
    const planeCoords = this.screenToPlane(x, y);
    const { is3DMode, isTransitioning3D } = getState();
    if (is3DMode || isTransitioning3D) {
      const angles = this.getRenderViewAngles();
      return this.snapPoint(inverseTransform2DProjection({ x: planeCoords.x, y: planeCoords.y }, angles));
    }
    return this.snapPoint(this.toPoint(planeCoords));
  }

  toCanvasCoords(x: number, y: number, z?: number) {
    const { is3DMode, isTransitioning3D, focalDistance } = getState();
    if (is3DMode || isTransitioning3D) {
      const zValue = z ?? this.computeObjectiveValue(x, y);
      const projected = transform2DTo3DAndProject({ x, y, z: this.scaleZValue(zValue) }, this.getRenderViewAngles(), focalDistance);
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
    const zValue = entry[2] !== undefined ? entry[2] : this.computeObjectiveValue(entry[0], entry[1]);
    const z = this.scaleZValue(zValue) + this.getPlanarOffset(planarOffset);
    return new Vector3(entry[0], entry[1], z);
  }

  private createStarSprite(position: Vector3, color: number) {
    const material = this.getSpriteMaterial("star", color);
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    const starSize = this.getWorldSizeFromPixels(STAR_POINT_PIXEL_SIZE, position);
    sprite.scale.set(starSize, starSize, starSize);
    sprite.renderOrder = RENDER_LAYERS.iterateStar;
    return sprite;
  }

  private createCircleSprite(position: Vector3, color: number, size: number) {
    const material = this.getSpriteMaterial("circle", color);
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
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();

    const center = size / 2;
    const [outer, inner, spikes] = [size / 2, size / 4, 5];
    const step = Math.PI / spikes;
    let angle = (Math.PI / 2) * 3;

    ctx.moveTo(center, center - outer / 1.5);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer);
      angle += step;
      ctx.lineTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
      angle += step;
    }
    ctx.closePath();
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
    this.screenToPlaneVec.set(screenX - this.centerX, this.centerY - screenY).multiplyScalar(unitsPerPixel);
    this.screenToPlaneVec.x -= this.offset.x;
    this.screenToPlaneVec.y -= this.offset.y;
    return this.screenToPlaneVec;
  }

  private planeToScreen(worldX: number, worldY: number) {
    const pixelsPerUnit = this.getPixelsPerUnit();
    this.planeToScreenVec.set(worldX + this.offset.x, worldY + this.offset.y).multiplyScalar(pixelsPerUnit);
    this.planeToScreenVec.set(this.centerX + this.planeToScreenVec.x, this.centerY - this.planeToScreenVec.y);
    return this.planeToScreenVec;
  }

  private toPoint(vec: Vector2): PointXY {
    return { x: vec.x, y: vec.y };
  }

  private snapPoint(point: PointXY) {
    const { snapToGrid } = getState();
    if (snapToGrid) {
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

  private getViewportTarget(unitsPerPixel = this.getUnitsPerPixel()) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerShiftX = (this.centerX - width / 2) * unitsPerPixel;
    const centerShiftY = (this.centerY - height / 2) * unitsPerPixel;
    return new Vector3(-this.offset.x - centerShiftX, -this.offset.y + centerShiftY, 0);
  }

  private getPerspectiveDistance(unitsPerPixel: number, height: number) {
    const fov = this.perspectiveCamera.fov * (Math.PI / 180);
    return Math.max(10, (height * unitsPerPixel) / (2 * Math.tan(fov / 2)));
  }

  private positionPerspectiveCamera(viewAngle: PointXYZ, unitsPerPixel = this.getUnitsPerPixel()) {
    const target = this.getViewportTarget(unitsPerPixel);
    const distance = this.getPerspectiveDistance(unitsPerPixel, window.innerHeight);
    const euler = new Euler(-viewAngle.x, -viewAngle.y, -viewAngle.z, "XYZ");
    const direction = new Vector3(0, 0, 1).applyEuler(euler).normalize();
    this.perspectiveCamera.position.copy(target.clone().add(direction.multiplyScalar(distance)));
    this.perspectiveCamera.up.copy(new Vector3(0, 1, 0).applyEuler(euler).normalize());
    this.perspectiveCamera.lookAt(target);
    return target;
  }

  private getOrbitViewAngles() {
    const { x, y, z } = this.perspectiveCamera.rotation;
    return { x: -x, y: -y, z: -z };
  }

  private getRenderViewAngles() {
    return this.orbitControlsActive ? this.getOrbitViewAngles() : getState().viewAngle;
  }

  private syncViewAngleToState() {
    if (!this.orbitControlsActive) return;
    setState({ viewAngle: this.getOrbitViewAngles() });
  }

  private activateOrbitControls() {
    const target = this.positionPerspectiveCamera(getState().viewAngle);
    this.orbitControls.target.copy(target);
    this.orbitControls.enabled = true;
    this.orbitControlsActive = true;
    this.applyOrbitDragMode();
    this.orbitControls.update();
  }

  private deactivateOrbitControls() {
    if (!this.orbitControlsActive) return;
    this.orbitControls.enabled = false;
    this.orbitControlsActive = false;
    this.syncViewAngleToState();
  }

  prepareFor3DTransition(targetMode: boolean) {
    if (!this.orbitControlsActive) return;
    if (!targetMode) {
      this.deactivateOrbitControls();
    } else {
      this.syncViewAngleToState();
    }
  }

  private applyOrbitDragMode() {
    this.orbitControls.enableRotate = true;
    this.orbitControls.enablePan = true;
    this.orbitControls.mouseButtons.LEFT = MOUSE.PAN;
    this.orbitControls.mouseButtons.RIGHT = MOUSE.ROTATE;
    this.orbitControls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    this.orbitControls.update();
  }

  private getDynamicPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1;
    const zoomFactor = Math.min(4, Math.max(1, this.scaleFactor));
    return Math.min(4, deviceRatio * zoomFactor);
  }

  private syncRendererPixelRatio(width?: number, height?: number) {
    const ratio = this.getDynamicPixelRatio();
    if (ratio === this.currentPixelRatio) return;
    this.currentPixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width ?? window.innerWidth, height ?? window.innerHeight, false);
  }

  private clearGroup(group: Group) {
    group.children.forEach((child) => {
      const mesh = child as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
      if (mesh.geometry?.dispose) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => this.disposeMaterial(mat));
      } else {
        this.disposeMaterial(mesh.material);
      }
    });
    group.clear();
  }

  private disposeMaterial(material?: { dispose?: () => void }) {
    if (material?.dispose && !this.cachedMaterials.has(material as Material)) {
      material.dispose();
    }
  }

  private computeObjectiveValue(x: number, y: number) {
    const { objectiveVector } = getState();
    if (!objectiveVector) return 0;
    return objectiveVector.x * x + objectiveVector.y * y;
  }

  private scaleZValue(value: number) {
    return (value * getState().zScale) / 100;
  }

  private getPlanarOffset(offset: number) {
    const { is3DMode, isTransitioning3D } = getState();
    return is3DMode || isTransitioning3D ? 0 : offset;
  }

  private getVertexZ(x: number, y: number, extra = 0) {
    const base = this.scaleZValue(this.computeObjectiveValue(x, y));
    return base + this.getPlanarOffset(extra);
  }

  private registerCachedMaterial(material: Material) {
    this.cachedMaterials.add(material);
  }

  private getLineMaterial(options: Omit<ThickLineOptions, "renderOrder">) {
    const key = `${options.color}:${options.width}:${options.depthTest ?? true}:${options.depthWrite ?? true}`;
    let material = this.lineMaterialCache.get(key);
    if (!material) {
      material = new LineMaterial({
        color: options.color,
        linewidth: options.width,
        transparent: false,
        opacity: 1,
        depthTest: options.depthTest ?? true,
        depthWrite: options.depthWrite ?? true,
      });
      this.lineMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    }
    material.depthTest = options.depthTest ?? true;
    material.depthWrite = options.depthWrite ?? true;
    material.resolution.copy(this.lineResolution);
    return material;
  }

  private getLineBasicMaterial(options: LineBasicMaterialOptions) {
    const key = `${options.color}:${options.transparent ?? false}:${options.opacity ?? 1}:${options.depthTest ?? true}:${options.depthWrite ?? true}`;
    let material = this.lineBasicMaterialCache.get(key);
    if (!material) {
      material = new LineBasicMaterial({
        color: options.color,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        depthTest: options.depthTest ?? true,
        depthWrite: options.depthWrite ?? true,
      });
      this.lineBasicMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    } else {
      material.color.set(options.color);
      material.transparent = options.transparent ?? false;
      material.opacity = options.opacity ?? 1;
      material.depthTest = options.depthTest ?? true;
      material.depthWrite = options.depthWrite ?? true;
    }
    return material;
  }

  private getPointMaterial(options: PointMaterialOptions) {
    const key = [options.color, options.size, options.sizeAttenuation, options.depthTest, options.depthWrite, options.transparent ?? false, options.opacity ?? 1, options.alphaTest ?? 0].join(":");
    let material = this.pointsMaterialCache.get(key);
    const texture = this.getCircleTexture();
    if (!material) {
      material = new PointsMaterial({
        color: options.color,
        size: options.size,
        sizeAttenuation: options.sizeAttenuation,
        depthTest: options.depthTest,
        depthWrite: options.depthWrite,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        alphaTest: options.alphaTest ?? 0,
        map: texture,
      });
      material.needsUpdate = true;
      this.pointsMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    } else if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
    return material;
  }

  private getSpriteMaterial(type: "circle" | "star", color: number) {
    const key = `${type}:${color}`;
    let material = this.spriteMaterialCache.get(key);
    const texture = type === "star" ? this.getStarTexture(color) : this.getCircleTexture();
    if (!material) {
      material = new SpriteMaterial({
        map: texture,
        transparent: false,
        alphaTest: 0.5,
        depthTest: false,
        depthWrite: false,
      });
      material.color.set(color);
      this.spriteMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    } else if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
    return material;
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
    },
  ) {
    const geometry = new AlwaysVisibleLineGeometry();
    geometry.setPositions(positions);
    const material = this.getLineMaterial({
      color,
      width,
      depthTest,
      depthWrite,
    });
    const line = new UndashedLine2(geometry, material);
    line.renderOrder = renderOrder;
    line.frustumCulled = false;
    return line;
  }

  private getCircleTexture() {
    const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const scaleBucket = Math.min(4, Math.max(1, Math.round(this.scaleFactor)));
    const cacheKey = `circle-${deviceRatio}-${scaleBucket}`;
    let texture = this.circleTextures.get(cacheKey);
    if (texture) return texture;

    const size = 64 * deviceRatio * scaleBucket;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const radius = size / 2;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();

    texture = new CanvasTexture(canvas);
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.needsUpdate = true;
    this.circleTextures.set(cacheKey, texture);
    return texture;
  }
}
