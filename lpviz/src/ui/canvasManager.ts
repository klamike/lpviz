import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  Group,
  LineBasicMaterial,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Mesh,
  Shape,
  ShapeGeometry,
  Vector3,
  Vector2,
  Line,
  DoubleSide,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Color,
  Euler,
  Points,
  PointsMaterial,
} from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { state } from "../state/state";
import { PointXY } from "../types/arrays";
import { transform2DTo3DAndProject, inverseTransform2DProjection } from "../utils/math3d";

const COLORS = {
  grid: 0xe0e0e0,
  axis: 0x707070,
  polygonFill: 0xe6e6e6,
  polygonHighlight: 0xff0000,
  vertex: 0xff0000,
  objective: 0x008000,
  iteratePath: 0x800080,
  iterateHighlight: 0x008000,
  trace: 0xffa500,
};

const GRID_MARGIN = 100;
const TRACE_OPACITY = 1;
const TRACE_Z_OFFSET = 0.02;
const ITERATE_Z_OFFSET = 0.03;
const EDGE_Z_OFFSET = 0.002;
const VERTEX_Z_OFFSET = 0.004;
const OBJECTIVE_Z_OFFSET = 0.015;
const MAX_TRACE_POINT_SPRITES = 1200;
const TRACE_POINT_PIXEL_SIZE = 6;
const ITERATE_POINT_PIXEL_SIZE = 8;
const POLY_LINE_THICKNESS = 2;
const TRACE_LINE_THICKNESS = 2;
const ITERATE_LINE_THICKNESS = 3;

export class CanvasManager {
  canvas: HTMLCanvasElement;
  gridSpacing = 20;
  scaleFactor = 1;
  offset = { x: 0, y: 0 };
  centerX = window.innerWidth / 2;
  centerY = window.innerHeight / 2;

  private renderer: WebGLRenderer;
  private scene: Scene;
  private orthoCamera: OrthographicCamera;
  private perspectiveCamera: PerspectiveCamera;
  private activeCamera: PerspectiveCamera | OrthographicCamera;
  private gridGroup: Group;
  private polygonGroup: Group;
  private constraintGroup: Group;
  private objectiveGroup: Group;
  private traceGroup: Group;
  private iterateGroup: Group;
  private renderScheduled = false;
  private renderHandle: number | null = null;
  private guidedTour: any = null;
  private initialized = false;
  private starTextures = new Map<number, CanvasTexture>();
  private circleTextures = new Map<number, CanvasTexture>();
  private lineResolution = new Vector2(window.innerWidth, window.innerHeight);

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new Scene();
    this.gridGroup = new Group();
    this.polygonGroup = new Group();
    this.constraintGroup = new Group();
    this.objectiveGroup = new Group();
    this.traceGroup = new Group();
    this.iterateGroup = new Group();

    this.scene.add(this.gridGroup);
    this.scene.add(this.polygonGroup);
    this.scene.add(this.constraintGroup);
    this.scene.add(this.objectiveGroup);
    this.scene.add(this.traceGroup);
    this.scene.add(this.iterateGroup);

    this.orthoCamera = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.perspectiveCamera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.activeCamera = this.orthoCamera;

    this.initialized = true;
    this.updateDimensions();
    this.draw();
  }

  static async create(canvas: HTMLCanvasElement) {
    return new CanvasManager(canvas);
  }

  setTourComponents(guidedTour: any) {
    this.guidedTour = guidedTour;
  }

  private shouldSkipPreviewDrawing(): boolean {
    return this.guidedTour?.isTouring();
  }

  updateDimensions() {
    if (!this.initialized) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
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

    this.renderScheduled = true;
    this.renderHandle = window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.renderHandle = null;
      this.renderFrame();
    });
  }

  private renderFrame() {
    if (!this.initialized) return;
    const is3D = state.is3DMode || state.isTransitioning3D;
    this.updateCamera();
    this.drawGrid(is3D);
    if (is3D) {
      this.drawPolygonGeometry((x, y) => this.scaleZValue(this.computeObjectiveValue(x, y)), true);
    } else {
      this.drawPolygonGeometry((x, y) => this.getVertexZ(x, y), false);
    }
    this.drawConstraintLines(is3D);
    this.drawObjective(is3D);
    this.drawTraces(is3D);
    this.drawIteratePath(is3D);

    this.renderer.render(this.scene, this.activeCamera);
  }

  private updateCamera() {
    const is3D = state.is3DMode || state.isTransitioning3D;
    this.activeCamera = is3D ? this.perspectiveCamera : this.orthoCamera;

    const pixelsPerUnit = this.gridSpacing * this.scaleFactor || 1;
    const unitsPerPixel = 1 / pixelsPerUnit;
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
      const camEuler = new Euler(-state.viewAngle.x, -state.viewAngle.y, -state.viewAngle.z, "XYZ");
      const direction = new Vector3(0, 0, 1).applyEuler(camEuler).normalize();
      const position = target.clone().add(direction.multiplyScalar(baseDistance));
      this.perspectiveCamera.position.copy(position);
      const up = new Vector3(0, 1, 0).applyEuler(camEuler).normalize();
      this.perspectiveCamera.up.copy(up);
      this.perspectiveCamera.lookAt(target);
    }
  }

  toLogicalCoords(x: number, y: number) {
    if (state.is3DMode || state.isTransitioning3D) {
      const projected2D = {
        x: (x - this.centerX) / (this.gridSpacing * this.scaleFactor) - this.offset.x,
        y: (this.centerY - y) / (this.gridSpacing * this.scaleFactor) - this.offset.y,
      };

      const logical = inverseTransform2DProjection(projected2D, state.viewAngle, state.focalDistance);

      if (state.snapToGrid) {
        logical.x = Math.round(logical.x);
        logical.y = Math.round(logical.y);
      }
      return logical;
    }

    const logical = {
      x: (x - this.centerX) / (this.gridSpacing * this.scaleFactor) - this.offset.x,
      y: (this.centerY - y) / (this.gridSpacing * this.scaleFactor) - this.offset.y,
    };
    if (state.snapToGrid) {
      logical.x = Math.round(logical.x);
      logical.y = Math.round(logical.y);
    }
    return logical;
  }

  toCanvasCoords(x: number, y: number, z?: number) {
    if (state.is3DMode || state.isTransitioning3D) {
      let actualZ = z;
      if (actualZ === undefined && state.objectiveVector) {
        actualZ = state.objectiveVector.x * x + state.objectiveVector.y * y;
      } else if (actualZ === undefined) {
        actualZ = 0;
      }
      const scaledZ = (actualZ * state.zScale) / 100;
      const projected = transform2DTo3DAndProject({ x, y, z: scaledZ }, state.viewAngle, state.focalDistance);
      return {
        x: this.centerX + (projected.x + this.offset.x) * this.gridSpacing * this.scaleFactor,
        y: this.centerY - (projected.y + this.offset.y) * this.gridSpacing * this.scaleFactor,
      };
    }

    return {
      x: this.centerX + (x + this.offset.x) * this.gridSpacing * this.scaleFactor,
      y: this.centerY - (y + this.offset.y) * this.gridSpacing * this.scaleFactor,
    };
  }

  private drawGrid(is3D: boolean) {
    this.clearGroup(this.gridGroup);
    let minX: number;
    let maxX: number;
    let minY: number;
    let maxY: number;

    if (is3D) {
      const extent = Math.max(200, 200 / this.scaleFactor);
      minX = -extent;
      maxX = extent;
      minY = -extent;
      maxY = extent;
    } else {
      const tl = this.toLogicalCoords(-GRID_MARGIN, -GRID_MARGIN);
      const br = this.toLogicalCoords(window.innerWidth + GRID_MARGIN, window.innerHeight + GRID_MARGIN);
      minX = Math.min(tl.x, br.x) - 5;
      maxX = Math.max(tl.x, br.x) + 5;
      minY = Math.min(tl.y, br.y) - 5;
      maxY = Math.max(tl.y, br.y) + 5;
    }

    const gridPositions: number[] = [];
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      gridPositions.push(x, minY, 0, x, maxY, 0);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      gridPositions.push(minX, y, 0, maxX, y, 0);
    }
    if (gridPositions.length) {
      const geom = new BufferGeometry();
      geom.setAttribute("position", new Float32BufferAttribute(gridPositions, 3));
      const material = new LineBasicMaterial({
        color: COLORS.grid,
        transparent: true,
        opacity: 0.5,
        depthTest: is3D,
        depthWrite: is3D,
      });
      this.gridGroup.add(new LineSegments(geom, material));
    }

    const axisPositions = new Float32Array([
      0, minY, 0, 0, maxY, 0,
      minX, 0, 0, maxX, 0, 0,
    ]);
    const axisGeom = new BufferGeometry();
    axisGeom.setAttribute("position", new Float32BufferAttribute(axisPositions, 3));
    const axisMaterial = new LineBasicMaterial({
      color: COLORS.axis,
      depthTest: is3D,
      depthWrite: is3D,
    });
    this.gridGroup.add(new LineSegments(axisGeom, axisMaterial));
  }

  private drawPolygonGeometry(zFn: (x: number, y: number) => number, useDepth: boolean) {
    this.clearGroup(this.polygonGroup);
    if (state.vertices.length === 0) return;
    const vertices = state.vertices;

    if (state.polygonComplete && vertices.length >= 3 && state.inputMode !== "manual") {
      const material = new MeshBasicMaterial({
        color: COLORS.polygonFill,
        transparent: true,
        opacity: 0.3,
        side: DoubleSide,
        depthWrite: useDepth,
        depthTest: useDepth,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

      let mesh: Mesh;
      if (useDepth) {
        const positions: number[] = [];
        vertices.forEach((v) => {
          const z = zFn(v.x, v.y);
          positions.push(v.x, v.y, z);
        });
        const indices: number[] = [];
        for (let i = 1; i < vertices.length - 1; i++) {
          indices.push(0, i, i + 1);
        }
        const geom = new BufferGeometry();
        geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        mesh = new Mesh(geom, material);
      } else {
        const shape = new Shape();
        shape.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          shape.lineTo(vertices[i].x, vertices[i].y);
        }
        shape.closePath();
        const geom = new ShapeGeometry(shape);
        mesh = new Mesh(geom, material);
        mesh.position.z = this.getPlanarOffset(VERTEX_Z_OFFSET / 2);
      }
      this.polygonGroup.add(mesh);
    }

    const edgeCount = state.polygonComplete ? vertices.length : Math.max(0, vertices.length - 1);
    for (let i = 0; i < edgeCount; i++) {
      const nextIndex = (i + 1) % vertices.length;
      if (!state.polygonComplete && nextIndex >= vertices.length) break;
      const v = vertices[i];
      const next = vertices[nextIndex];
      const z1 = zFn(v.x, v.y) + EDGE_Z_OFFSET;
      const z2 = zFn(next.x, next.y) + EDGE_Z_OFFSET;
      const edgeGeom = new BufferGeometry();
      edgeGeom.setAttribute(
        "position",
        new Float32BufferAttribute([v.x, v.y, z1, next.x, next.y, z2], 3)
      );
      const highlight = state.inputMode !== "manual" && state.highlightIndex === i;
      const edgeLine = this.createThickLine([v.x, v.y, z1, next.x, next.y, z2], {
        color: highlight ? COLORS.polygonHighlight : 0x000000,
        width: POLY_LINE_THICKNESS,
        opacity: highlight ? 1 : 0.85,
        depthTest: useDepth,
        depthWrite: useDepth,
      });
      this.polygonGroup.add(edgeLine);
    }

    const vertexSize = this.getWorldSizeFromPixels(10);
    vertices.forEach((v) => {
      const position = new Vector3(v.x, v.y, zFn(v.x, v.y) + VERTEX_Z_OFFSET);
      this.polygonGroup.add(this.createCircleSprite(position, COLORS.vertex, vertexSize));
    });

    if (!this.isPolygonConvex(vertices)) {
      const shape = new Shape();
      shape.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].y);
      }
      shape.closePath();
      const geometry = new ShapeGeometry(shape);
      const material = new MeshBasicMaterial({
        color: COLORS.polygonHighlight,
        transparent: true,
        opacity: 0.3,
        side: DoubleSide,
      });
      this.polygonGroup.add(new Mesh(geometry, material));
    }

    if (!state.polygonComplete && vertices.length >= 2 && state.currentMouse && !this.shouldSkipPreviewDrawing()) {
      const previewGeom = new BufferGeometry();
      const last = vertices[vertices.length - 1];
      const lastZ = this.getVertexZ(last.x, last.y, EDGE_Z_OFFSET);
      const previewZ = this.getVertexZ(state.currentMouse.x, state.currentMouse.y, EDGE_Z_OFFSET);
      const previewPositions = [
        last.x,
        last.y,
        lastZ,
        state.currentMouse.x,
        state.currentMouse.y,
        previewZ,
      ];
      previewGeom.setAttribute("position", new Float32BufferAttribute(previewPositions, 3));
      const previewLine = this.createThickLine(previewPositions, {
        color: 0x000000,
        width: POLY_LINE_THICKNESS,
        opacity: 0.7,
        depthTest: useDepth,
        depthWrite: useDepth,
      });
      this.polygonGroup.add(previewLine);
    }
  }

  private drawConstraintLines(is3D: boolean) {
    this.clearGroup(this.constraintGroup);
    if (state.inputMode !== "manual" || !state.computedLines || state.computedLines.length === 0) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const margin = 50;
    const topLeft = this.toLogicalCoords(-margin, -margin);
    const bottomRight = this.toLogicalCoords(width + margin, height + margin);
    const minX = Math.min(topLeft.x, bottomRight.x) - margin;
    const maxX = Math.max(topLeft.x, bottomRight.x) + margin;
    const minY = Math.min(topLeft.y, bottomRight.y) - margin;
    const maxY = Math.max(topLeft.y, bottomRight.y) + margin;

    state.computedLines.forEach((line, index) => {
      const [A, B, C] = line;
      if (Math.abs(A) < 1e-10 && Math.abs(B) < 1e-10) return;

      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;

      if (Math.abs(B) > Math.abs(A)) {
        x1 = minX;
        y1 = (C - A * x1) / B;
        x2 = maxX;
        y2 = (C - A * x2) / B;
      } else {
        y1 = minY;
        x1 = (C - B * y1) / A;
        y2 = maxY;
        x2 = (C - B * y2) / A;
      }

      const highlighted = state.highlightIndex === index;
      const lineObj = this.createThickLine(
        [x1, y1, 0, x2, y2, 0],
        {
          color: highlighted ? COLORS.polygonHighlight : 0x646464,
          width: POLY_LINE_THICKNESS,
          opacity: 1,
          depthTest: is3D,
          depthWrite: is3D,
        }
      );
      this.constraintGroup.add(lineObj);
    });
  }

  private drawObjective(is3D: boolean) {
    this.clearGroup(this.objectiveGroup);
    const target =
      state.objectiveVector ||
      (state.polygonComplete && state.currentObjective && !this.shouldSkipPreviewDrawing()
        ? state.currentObjective
        : null);

    if (!target) return;

    const length = Math.hypot(target.x, target.y);
    if (length < 1e-3) return;
    const angle = Math.atan2(target.y, target.x);
    const width = Math.max(this.getWorldSizeFromPixels(12), 0.02);

    const baseZ = this.getPlanarOffset(OBJECTIVE_Z_OFFSET) + (is3D ? this.scaleZValue(this.computeObjectiveValue(target.x, target.y)) : 0);
    const arrowColor = COLORS.objective;
    const shaftLine = this.createThickLine(
      [0, 0, baseZ, target.x, target.y, baseZ],
      {
        color: arrowColor,
        width: ITERATE_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
      }
    );
    shaftLine.renderOrder = 5;
    this.objectiveGroup.add(shaftLine);

    const headLength = Math.max(this.getWorldSizeFromPixels(20), length * 0.2);
    const head1 = this.createThickLine(
      [
        target.x,
        target.y,
        baseZ,
        target.x - headLength * Math.cos(angle + Math.PI / 6),
        target.y - headLength * Math.sin(angle + Math.PI / 6),
        baseZ,
      ],
      { color: arrowColor, width: ITERATE_LINE_THICKNESS, depthTest: is3D, depthWrite: is3D, renderOrder: 6 }
    );
    const head2 = this.createThickLine(
      [
        target.x,
        target.y,
        baseZ,
        target.x - headLength * Math.cos(angle - Math.PI / 6),
        target.y - headLength * Math.sin(angle - Math.PI / 6),
        baseZ,
      ],
      { color: arrowColor, width: ITERATE_LINE_THICKNESS, depthTest: is3D, depthWrite: is3D, renderOrder: 6 }
    );
    this.objectiveGroup.add(head1);
    this.objectiveGroup.add(head2);
  }

  private drawTraces(is3D: boolean) {
    this.clearGroup(this.traceGroup);
    if (!state.traceEnabled || !state.traceBuffer || state.traceBuffer.length === 0) {
      return;
    }

    const pointSize = TRACE_POINT_PIXEL_SIZE;
    const pointGeometry = new BufferGeometry();
    const sampledPositions: number[] = [];
    state.traceBuffer.forEach((traceEntry) => {
      const path = traceEntry.path;
      if (!path || path.length === 0) return;
      const positions = this.buildPositionArray(path, TRACE_Z_OFFSET);
      const line = this.createThickLine(Array.from(positions), {
        color: COLORS.trace,
        width: TRACE_LINE_THICKNESS,
        opacity: TRACE_OPACITY,
        depthTest: is3D,
        depthWrite: is3D,
      });
      line.renderOrder = 0;
      this.traceGroup.add(line);

      const step = Math.max(1, Math.ceil(path.length / MAX_TRACE_POINT_SPRITES));
      for (let i = 0; i < path.length; i += step) {
        const vec = this.buildPositionVector(path[i], TRACE_Z_OFFSET);
        sampledPositions.push(vec.x, vec.y, vec.z);
      }
      const lastIdx = path.length - 1;
      if (lastIdx % step !== 0) {
        const vec = this.buildPositionVector(path[lastIdx], TRACE_Z_OFFSET);
        sampledPositions.push(vec.x, vec.y, vec.z);
      }
    });

    if (sampledPositions.length) {
      pointGeometry.setAttribute("position", new Float32BufferAttribute(sampledPositions, 3));
      const material = new PointsMaterial({
        color: COLORS.trace,
        size: pointSize,
        sizeAttenuation: false,
        depthWrite: false,
        depthTest: false,
        transparent: true,
        opacity: 1,
        map: this.getCircleTexture(COLORS.trace),
        alphaTest: 0.2,
      });
      const pointMesh = new Points(pointGeometry, material);
      pointMesh.renderOrder = 10;
      this.traceGroup.add(pointMesh);
    }
  }

  private drawIteratePath(is3D: boolean) {
    this.clearGroup(this.iterateGroup);
    if (!state.iteratePath || state.iteratePath.length === 0) {
      return;
    }

    const positions = this.buildPositionArray(state.iteratePath, ITERATE_Z_OFFSET);
    const iterateLine = this.createThickLine(Array.from(positions), {
      color: COLORS.iteratePath,
      width: ITERATE_LINE_THICKNESS,
      depthTest: is3D,
      depthWrite: is3D,
    });
    iterateLine.renderOrder = 0;
    this.iterateGroup.add(iterateLine);

    const iteratePointSizeWorld = this.getWorldSizeFromPixels(ITERATE_POINT_PIXEL_SIZE);
    const iteratePointSizePx = ITERATE_POINT_PIXEL_SIZE;
    const pointsGeometry = new BufferGeometry();
    pointsGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: COLORS.iteratePath,
      size: iteratePointSizePx,
      sizeAttenuation: false,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      opacity: 1,
      map: this.getCircleTexture(COLORS.iteratePath),
      alphaTest: 0.2,
    });
    const iteratePoints = new Points(pointsGeometry, material);
    iteratePoints.renderOrder = 10;
    this.iterateGroup.add(iteratePoints);

    if (state.highlightIteratePathIndex !== null && state.highlightIteratePathIndex < state.iteratePath.length) {
      const highlightPos = this.buildPositionVector(state.iteratePath[state.highlightIteratePathIndex], ITERATE_Z_OFFSET);
      this.iterateGroup.add(
        this.createCircleSprite(highlightPos, COLORS.iterateHighlight, iteratePointSizeWorld * 1.3)
      );
    }

    const lastPos = this.buildPositionVector(state.iteratePath[state.iteratePath.length - 1], ITERATE_Z_OFFSET);
    const star = this.createStarSprite(lastPos, COLORS.iterateHighlight);
    this.iterateGroup.add(star);
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
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    const starSize = this.getWorldSizeFromPixels(18);
    sprite.scale.set(starSize, starSize, starSize);
    return sprite;
  }

  private createCircleSprite(position: Vector3, color: number, size: number) {
    const material = new SpriteMaterial({
      map: this.getCircleTexture(color),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(size, size, size);
    return sprite;
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

  private getWorldSizeFromPixels(pixels: number) {
    return pixels / (this.gridSpacing * this.scaleFactor || 1);
  }

  private hexToRgb(hex: number) {
    const color = new Color(hex);
    return {
      r: Math.round(color.r * 255),
      g: Math.round(color.g * 255),
      b: Math.round(color.b * 255),
    };
  }

  private clearGroup(group: Group) {
    group.children.forEach((child) => {
      const obj: any = child;
      const geometry = obj.geometry;
      if (geometry && typeof geometry.dispose === "function") {
        geometry.dispose();
      }
      const material = obj.material;
      if (material) {
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.());
        } else if (typeof material.dispose === "function") {
          material.dispose();
        }
      }
    });
    group.clear();
  }

  private computeObjectiveValue(x: number, y: number) {
    if (!state.objectiveVector) return 0;
    return state.objectiveVector.x * x + state.objectiveVector.y * y;
  }

  private scaleZValue(value: number) {
    return (value * state.zScale) / 100;
  }

  private getPlanarOffset(offset: number) {
    return state.is3DMode || state.isTransitioning3D ? 0 : offset;
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
      opacity = 1,
      depthTest = true,
      depthWrite = true,
      renderOrder = 0,
    }: {
      color: number;
      width: number;
      opacity?: number;
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
      transparent: opacity < 1,
      opacity,
      depthTest,
      depthWrite,
    });
    material.resolution.copy(this.lineResolution);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.renderOrder = renderOrder;
    return line;
  }

  private getCircleTexture(color: number) {
    let texture = this.circleTextures.get(color);
    if (texture) return texture;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const { r, g, b } = this.hexToRgb(color);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    texture = new CanvasTexture(canvas);
    this.circleTextures.set(color, texture);
    return texture;
  }

  private isPolygonConvex(points: PointXY[]) {
    if (points.length < 3) return true;
    let prevCross = 0;
    for (let i = 0, n = points.length; i < n; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % n];
      const p2 = points[(i + 2) % n];
      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (cross !== 0) {
        if (prevCross === 0) prevCross = cross;
        else if (Math.sign(cross) !== Math.sign(prevCross)) return false;
      }
    }
    return true;
  }

}
