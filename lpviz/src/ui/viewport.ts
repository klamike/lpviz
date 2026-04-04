import { WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Group, Vector3, Vector2, Sprite, SpriteMaterial, CanvasTexture, PointsMaterial, Material, LineBasicMaterial, Plane, Raycaster, MOUSE, BufferGeometry, Float32BufferAttribute, LineSegments, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Points, DoubleSide, Euler, Matrix4, Box3, Sphere, Color, type Vector3 as ThreeVector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { Line, PointXY, PointXYZ } from "../solvers/utils/blas";
import { isObjectiveDirectionUnbounded } from "../solvers/utils/objectiveDirection";
import { VRep } from "../solvers/utils/polygon";
import { hasPolytopeLines } from "../solvers/utils/polytopeTypes";
import { DEFAULT_VIEW_ANGLE, MAX_TRACE_POINT_SPRITES, getDisplayedIterateZ, getState, mutate, setState, subscribe, type State, type ViewportDirtyFlags } from "../state/store";

const DEFAULT_BOUNDING_EXTENT = 1e9;
const OBJECTIVE_Z_OFFSET = 0.015;
const ORTHO_MIN_SCALE_FACTOR = 0.05;
const ORTHO_MAX_SCALE_FACTOR = 400;
const MAX_3D_DRAG_BOUND = 5000;
const VIEW_DRAG_BOUND_MULTIPLIER = 6;
const MAX_3D_PLANE_SLOPE = 2;
const VIEWPORT_NAVIGATION_IDLE_MS = 100;

class AlwaysVisibleLineGeometry extends LineGeometry {
  override computeBoundingBox() {
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }
    this.boundingBox.min.setScalar(-DEFAULT_BOUNDING_EXTENT);
    this.boundingBox.max.setScalar(DEFAULT_BOUNDING_EXTENT);
  }

  override computeBoundingSphere() {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }
    this.boundingSphere.center.set(0, 0, 0);
    this.boundingSphere.radius = DEFAULT_BOUNDING_EXTENT;
  }
}

class UndashedLine2 extends Line2 {
  override computeLineDistances() {
    return this;
  }
}

const COLORS = {
  grid: 0xe0e0e0,
  axis: 0x707070,
  polytopeFill: 0xe6e6e6,
  polytopeHighlight: 0xff0000,
  vertex: 0xff0000,
  objective: 0x008000,
  iteratePath: 0x800080,
  iterateHighlight: 0x008000,
  trace: 0xffa500,
};
const PHASE_COLORS = [0xe41a1c, 0x377eb8, 0x4daf4a, 0x984ea3, 0xff7f00, 0xffff33, 0xa65628, 0xf781bf, 0x999999, 0x17becf];

const GRID_MARGIN = 100;
const TRACE_Z_OFFSET = 0.02;
const ITERATE_Z_OFFSET = 0.03;
const EDGE_Z_OFFSET = 0.002;
const VERTEX_Z_OFFSET = 0.004;
const TRACE_POINT_PIXEL_SIZE = 6;
const ITERATE_POINT_PIXEL_SIZE = 8;
const STAR_POINT_PIXEL_SIZE = 18;
const VERTEX_POINT_PIXEL_SIZE = 10;
const POLY_LINE_THICKNESS = 2;
const TRACE_LINE_THICKNESS = 2;
const TRACE_LINE_OPACITY = 0.4;
const ITERATE_LINE_THICKNESS = 3;
const RENDER_LAYERS = {
  grid: 0,
  polyEdges: 3,
  objective: 4,
  traceLine: 5,
  constraintLines: 6,
  polytopeVertices: 12,
  tracePoints: 14,
  iterateLine: 20,
  iteratePoints: 22,
  iterateRestartPoints: 23,
  iterateStar: 24,
  iterateHighlight: 26,
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;
const EPS = 1e-10;
const ARROW_HALF_ANGLE = Math.PI / 6;

export class ViewportManager {
  canvas: HTMLCanvasElement;
  private viewState: {
    gridSpacing: number;
    scaleFactor: number;
    offset: { x: number; y: number };
    centerX: number;
    centerY: number;
  } = {
    gridSpacing: 20,
    scaleFactor: 1,
    offset: { x: 0, y: 0 },
    centerX: window.innerWidth / 2,
    centerY: window.innerHeight / 2,
  };

  private renderer: WebGLRenderer;
  private scenes: {
    background: Scene;
    transparent: Scene;
    foreground: Scene;
    vertices: Scene;
    traceLines: Scene;
    trace: Scene;
    overlay: Scene;
  };
  private cameras: {
    ortho: OrthographicCamera;
    perspective: PerspectiveCamera;
    active: PerspectiveCamera | OrthographicCamera;
  };
  private groups: {
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
  };
  private sidebarWidth = 0;
  private renderScheduled = false;
  private initialized = false;
  private renderResources: {
    starTextures: Map<number, CanvasTexture>;
    circleTextures: Map<string, CanvasTexture>;
    squareTextures: Map<string, CanvasTexture>;
    lineMaterialCache: Map<string, LineMaterial>;
    lineBasicMaterialCache: Map<string, LineBasicMaterial>;
    pointsMaterialCache: Map<string, PointsMaterial>;
    spriteMaterialCache: Map<string, SpriteMaterial>;
    cachedMaterials: Set<Material>;
    currentPixelRatio: number;
  } = {
    starTextures: new Map<number, CanvasTexture>(),
    circleTextures: new Map<string, CanvasTexture>(),
    squareTextures: new Map<string, CanvasTexture>(),
    lineMaterialCache: new Map<string, LineMaterial>(),
    lineBasicMaterialCache: new Map<string, LineBasicMaterial>(),
    pointsMaterialCache: new Map<string, PointsMaterial>(),
    spriteMaterialCache: new Map<string, SpriteMaterial>(),
    cachedMaterials: new Set<Material>(),
    currentPixelRatio: window.devicePixelRatio || 1,
  };
  private renderState: {
    lineResolution: Vector2;
    dirty: {
      grid: boolean;
      polytope: boolean;
      constraints: boolean;
      objective: boolean;
      trace: boolean;
      iterate: boolean;
    };
  } = {
    lineResolution: new Vector2(window.innerWidth, window.innerHeight),
    dirty: {
      grid: true,
      polytope: true,
      constraints: true,
      objective: true,
      trace: true,
      iterate: true,
    },
  };
  private stateSignatures = {
    polytope: "",
    constraints: "",
    objective: "",
    trace: "",
    iterate: "",
  };
  private gridObjects: {
    lines: LineSegments | null;
    axes: LineSegments | null;
  } = {
    lines: null,
    axes: null,
  };
  private lastOrthoGridKey = "";
  private persistentSceneObjects: {
    polytopeFillMesh: Mesh | null;
    polytopeOutlineLines: UndashedLine2[];
    constraintLine: UndashedLine2 | null;
    polytopeVertexSprites: Sprite[];
    objectiveLines: UndashedLine2[];
    iterateLine: UndashedLine2 | null;
    iteratePhaseLines: UndashedLine2[];
    iteratePoints: Points | null;
    iterateRestartPoints: Points | null;
    iterateHighlight: Sprite | null;
    iterateStar: Sprite | null;
    tracePoints: Points | null;
    traceLines: UndashedLine2[];
  } = {
    polytopeFillMesh: null,
    polytopeOutlineLines: [],
    constraintLine: null,
    polytopeVertexSprites: [],
    objectiveLines: [],
    iterateLine: null,
    iteratePhaseLines: [],
    iteratePoints: null,
    iterateRestartPoints: null,
    iterateHighlight: null,
    iterateStar: null,
    tracePoints: null,
    traceLines: [],
  };
  private navigationIdleTimeoutId: number | null = null;
  private renderHelpers: {
    clearGroup(group: Group): void;
    createThickLine(
      positions: number[],
      options: {
        color: number;
        width: number;
        depthTest?: boolean;
        depthWrite?: boolean;
        renderOrder?: number;
      },
    ): UndashedLine2;
    getWorldSizeFromPixels(pixels: number, worldPosition?: Vector3): number;
    getPointMaterial(options: {
      color: number;
      size: number;
      sizeAttenuation: boolean;
      depthTest: boolean;
      depthWrite: boolean;
      transparent?: boolean;
      opacity?: number;
      alphaTest?: number;
      vertexColors?: boolean;
    }): PointsMaterial;
    getLineBasicMaterial(options: {
      color: number;
      transparent?: boolean;
      opacity?: number;
      depthTest?: boolean;
      depthWrite?: boolean;
    }): LineBasicMaterial;
  };
  private controls: {
    orbit: OrbitControls;
    ortho: OrbitControls;
  };
  private controlState: {
    orbitActive: boolean;
    lastOrbitTarget: Vector3;
    transitionStartTarget: Vector3;
    transitionEndTarget: Vector3;
    currentPerspectiveDistance: number;
    pendingScaleFactorFrom3D: number | null;
    suppressOrthoChange: boolean;
    orthographicSuspended: boolean;
    orbitTemporarilyDisabled: boolean;
  } = {
    orbitActive: false,
    lastOrbitTarget: new Vector3(),
    transitionStartTarget: new Vector3(),
    transitionEndTarget: new Vector3(),
    currentPerspectiveDistance: 0,
    pendingScaleFactorFrom3D: null,
    suppressOrthoChange: false,
    orthographicSuspended: false,
    orbitTemporarilyDisabled: false,
  };
  private interactionProjection: {
    raycaster: Raycaster;
    pointerNdc: Vector2;
    pointerWorld: Vector3;
    interactionPlane: Plane;
    interactionPlaneNormal: Vector3;
    planeOrigin: Vector3;
  } = {
    raycaster: new Raycaster(),
    pointerNdc: new Vector2(),
    pointerWorld: new Vector3(),
    interactionPlane: new Plane(new Vector3(0, 0, 1), 0),
    interactionPlaneNormal: new Vector3(0, 0, 1),
    planeOrigin: new Vector3(0, 0, 0),
  };
  private navigationFrameCallback: (() => void) | null = null;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderResources.currentPixelRatio = this.getDynamicPixelRatio();
    this.renderer.setPixelRatio(this.renderResources.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x000000, 0);

    this.scenes = {
      background: new Scene(),
      transparent: new Scene(),
      foreground: new Scene(),
      vertices: new Scene(),
      traceLines: new Scene(),
      trace: new Scene(),
      overlay: new Scene(),
    };

    this.groups = {
      grid: new Group(),
      polytopeFill: new Group(),
      polytopeOutline: new Group(),
      polytopeVertices: new Group(),
      constraint: new Group(),
      objective: new Group(),
      traceLines: new Group(),
      trace: new Group(),
      iterate: new Group(),
      overlay: new Group(),
    };

    this.scenes.background.add(this.groups.grid);
    this.scenes.transparent.add(this.groups.polytopeFill);
    this.scenes.foreground.add(this.groups.polytopeOutline, this.groups.constraint, this.groups.objective);
    this.scenes.vertices.add(this.groups.polytopeVertices);
    this.scenes.traceLines.add(this.groups.traceLines);
    this.scenes.trace.add(this.groups.trace, this.groups.iterate);
    this.scenes.overlay.add(this.groups.overlay);

    this.cameras = {
      ortho: new OrthographicCamera(-1, 1, 1, -1, -1000, 1000),
      perspective: new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000),
      active: null as unknown as OrthographicCamera,
    };
    this.cameras.active = this.cameras.ortho;
    this.controls = {
      orbit: new OrbitControls(this.cameras.perspective, this.canvas),
      ortho: new OrbitControls(this.cameras.ortho, this.canvas),
    };
    this.controls.orbit.enabled = false;
    this.controls.orbit.enableDamping = false;
    this.controls.orbit.dampingFactor = 0;
    this.controls.orbit.enableRotate = false;
    this.controls.orbit.addEventListener("change", this.handleOrbitControlsChange);

    this.controls.ortho.enableRotate = false;
    this.controls.ortho.enablePan = true;
    this.controls.ortho.enableZoom = true;
    this.controls.ortho.screenSpacePanning = true;
    this.controls.ortho.enableDamping = false;
    this.controls.ortho.mouseButtons.LEFT = MOUSE.PAN;
    this.controls.ortho.mouseButtons.RIGHT = MOUSE.DOLLY;
    this.controls.ortho.mouseButtons.MIDDLE = MOUSE.DOLLY;
    this.controls.ortho.addEventListener("change", this.handleOrthoControlsChange);
    this.controls.ortho.target.copy(this.getViewportTarget());
    this.controls.ortho.update();

    this.renderHelpers = {
      clearGroup: (group) => this.clearGroup(group),
      createThickLine: (positions, options) => this.createThickLine(positions, options),
      getWorldSizeFromPixels: (pixels, worldPosition) => this.getWorldSizeFromPixels(pixels, worldPosition),
      getPointMaterial: (options) => this.getPointMaterial(options),
      getLineBasicMaterial: (options) => this.getLineBasicMaterial(options),
    };

    this.controlState.currentPerspectiveDistance = this.getPerspectiveDistance();
    this.stateSignatures = this.captureStateSignatures(getState());
    subscribe((snapshot, meta) => {
      if (meta?.viewportDirty !== undefined) {
        if (Object.keys(meta.viewportDirty).length > 0) {
          this.invalidateScene(meta.viewportDirty);
        }
        return;
      }
      this.invalidateFromStateChange(snapshot);
    });

    this.initialized = true;
    this.updateDimensions();
    this.draw();
    window.addEventListener("resize", this.handleResize);
  }

  static async create(canvas: HTMLCanvasElement) {
    return new ViewportManager(canvas);
  }

  isDefaultView() {
    return this.viewState.scaleFactor === 1 && this.viewState.offset.x === 0 && this.viewState.offset.y === 0;
  }

  setSidebarWidth(sidebarWidth: number) {
    this.sidebarWidth = sidebarWidth;
    this.setViewportCenterFromSidebarWidth(sidebarWidth);
  }

  setNavigationFrameCallback(callback: (() => void) | null) {
    this.navigationFrameCallback = callback;
  }

  private setViewportCenterFromSidebarWidth(sidebarWidth: number, width = window.innerWidth, height = window.innerHeight) {
    this.viewState.centerX = sidebarWidth + (width - sidebarWidth) / 2;
    this.viewState.centerY = height / 2;
  }

  private invalidateScene(parts: Partial<typeof this.renderState.dirty> = {}) {
    const entries = Object.entries(parts) as Array<[keyof typeof this.renderState.dirty, boolean | undefined]>;
    if (entries.length === 0) {
      this.renderState.dirty.grid = true;
      this.renderState.dirty.polytope = true;
      this.renderState.dirty.constraints = true;
      this.renderState.dirty.objective = true;
      this.renderState.dirty.trace = true;
      this.renderState.dirty.iterate = true;
      return;
    }

    for (const [key, value] of entries) {
      if (value) {
        this.renderState.dirty[key] = true;
      }
    }
  }

  private serializePoint(point: PointXY | null) {
    return point ? `${point.x},${point.y}` : "";
  }

  private serializeVertices(vertices: ReadonlyArray<PointXY>) {
    return vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(";");
  }

  private serializeNumberPath(path: ReadonlyArray<ReadonlyArray<number>>) {
    return path.map((entry) => entry.join(",")).join(";");
  }

  private captureStateSignatures(state: State) {
    const polytopeLines = state.polytope && hasPolytopeLines(state.polytope) ? state.polytope.lines.map((line) => line.join(",")).join(";") : "";
    const polytopeVertices = state.polytope?.kind === "bounded" ? state.polytope.vertices.map((vertex) => vertex.join(",")).join(";") : "";
    const boundaryRays =
      state.polytope?.boundaryRays?.map((ray) => `${ray.start.join(",")}|${ray.direction.join(",")}`).join(";") ?? "";
    const transitionKey = state.isTransitioning3D ? `${state.transitionDirection}:${state.transitionProgress}:${state.viewAngle.x},${state.viewAngle.y},${state.viewAngle.z}` : "";
    const objectiveKey = `${this.serializePoint(state.objectiveVector)}|${this.serializePoint(state.currentObjective)}|${state.objectiveHidden}|${state.zScale}|${state.zAxisOffsetOnly}`;

    return {
      polytope: [
        this.serializeVertices(state.vertices),
        state.completionMode,
        state.highlightIndex,
        this.serializePoint(state.currentMouse),
        polytopeVertices,
        boundaryRays,
        objectiveKey,
        transitionKey,
      ].join("|"),
      constraints: [state.completionMode, state.highlightIndex, polytopeLines].join("|"),
      objective: [objectiveKey, polytopeLines, state.polytope?.kind ?? ""].join("|"),
      trace: [
        state.traceEnabled,
        state.zScale,
        state.zAxisOffsetOnly,
        transitionKey,
        state.traceBuffer
          .map((entry) => `${entry.objectiveVector ? `${entry.objectiveVector.x},${entry.objectiveVector.y}` : ""}:${this.serializeNumberPath(entry.path)}`)
          .join("|"),
      ].join("|"),
      iterate: [
        this.serializeNumberPath(state.iteratePath),
        state.iteratePhases.join(","),
        state.iterateRestartIndices.join(","),
        state.highlightIteratePathIndex,
        this.serializePoint(state.iterateObjectiveVector),
        state.zScale,
        state.zAxisOffsetOnly,
        transitionKey,
      ].join("|"),
    };
  }

  private invalidateFromStateChange(state: State) {
    const next = this.captureStateSignatures(state);
    const dirty: Partial<typeof this.renderState.dirty> = {};

    if (next.polytope !== this.stateSignatures.polytope) dirty.polytope = true;
    if (next.constraints !== this.stateSignatures.constraints) dirty.constraints = true;
    if (next.objective !== this.stateSignatures.objective) dirty.objective = true;
    if (next.trace !== this.stateSignatures.trace) dirty.trace = true;
    if (next.iterate !== this.stateSignatures.iterate) dirty.iterate = true;

    this.stateSignatures = next;
    if (Object.keys(dirty).length) {
      this.invalidateScene(dirty);
    }
  }

  private buildShapeFromVertices(vertices: ReadonlyArray<PointXY>) {
    const shape = new Shape();
    if (vertices.length === 0) return shape;
    shape.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i].x, vertices[i].y);
    }
    shape.closePath();
    return shape;
  }

  private clipLineToBounds(line: Line, bounds: Bounds): [PointXY, PointXY] | null {
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

  private clipRayToBounds(start: PointXY, direction: PointXY, bounds: Bounds): [PointXY, PointXY] | null {
    const candidates: Array<{ t: number; point: PointXY }> = [];

    if (Math.abs(direction.x) > EPS) {
      for (const x of [bounds.minX, bounds.maxX]) {
        const t = (x - start.x) / direction.x;
        if (t <= EPS) continue;
        const y = start.y + t * direction.y;
        if (y >= bounds.minY - EPS && y <= bounds.maxY + EPS) {
          candidates.push({ t, point: { x, y } });
        }
      }
    }

    if (Math.abs(direction.y) > EPS) {
      for (const y of [bounds.minY, bounds.maxY]) {
        const t = (y - start.y) / direction.y;
        if (t <= EPS) continue;
        const x = start.x + t * direction.x;
        if (x >= bounds.minX - EPS && x <= bounds.maxX + EPS) {
          candidates.push({ t, point: { x, y } });
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.t - a.t);
    return [start, candidates[0].point];
  }

  private buildArrowHeadSegments(tip: PointXY, angle: number, length: number): Array<[number, number, number, number]> {
    return [ARROW_HALF_ANGLE, -ARROW_HALF_ANGLE].map((offset) => {
      const targetAngle = angle + offset;
      const x2 = tip.x - length * Math.cos(targetAngle);
      const y2 = tip.y - length * Math.sin(targetAngle);
      return [tip.x, tip.y, x2, y2];
    });
  }

  private setViewportNavigationActive(active: boolean) {
    if (getState().isNavigatingViewport === active) {
      return;
    }
    setState({ isNavigatingViewport: active }, { viewportDirty: {} });
  }

  private clearViewportNavigationTimeout() {
    if (this.navigationIdleTimeoutId !== null) {
      clearTimeout(this.navigationIdleTimeoutId);
      this.navigationIdleTimeoutId = null;
    }
  }

  private beginViewportNavigation() {
    this.clearViewportNavigationTimeout();
    this.setViewportNavigationActive(true);
  }

  private scheduleViewportNavigationEnd() {
    this.clearViewportNavigationTimeout();
    this.navigationIdleTimeoutId = window.setTimeout(() => {
      this.navigationIdleTimeoutId = null;
      if (getState().isTransitioning3D) {
        return;
      }
      this.setViewportNavigationActive(false);
    }, VIEWPORT_NAVIGATION_IDLE_MS);
  }

  private getOrthoGridKey() {
    const target = this.controls.ortho.target;
    return `${Math.round(target.x)},${Math.round(target.y)},${Math.round(this.viewState.scaleFactor * 100) / 100}`;
  }

  getObjectiveDirtyFlags(): ViewportDirtyFlags {
    return this.is3DState() ? { polytope: true, objective: true } : { objective: true };
  }

  getPolytopeDirtyFlags(): ViewportDirtyFlags {
    return { polytope: true, constraints: true, objective: true };
  }

  getTraceDirtyFlags(): ViewportDirtyFlags {
    return { trace: true };
  }

  getIterateDirtyFlags(): ViewportDirtyFlags {
    return { iterate: true };
  }

  getConstraintDirtyFlags(): ViewportDirtyFlags {
    return { constraints: true };
  }

  getDraftPreviewDirtyFlags(): ViewportDirtyFlags {
    return { polytope: true };
  }

  getZScaleDirtyFlags(): ViewportDirtyFlags {
    return { polytope: true, objective: true, trace: true, iterate: true };
  }

  private clipPolygonToHalfPlane(polygon: PointXY[], line: Line): PointXY[] {
    if (polygon.length === 0) return [];

    const [A, B, C] = line;
    const inside = (point: PointXY) => A * point.x + B * point.y <= C + EPS;
    const intersect = (start: PointXY, end: PointXY): PointXY => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const denom = A * dx + B * dy;
      if (Math.abs(denom) < EPS) {
        return end;
      }
      const t = (C - A * start.x - B * start.y) / denom;
      return {
        x: start.x + t * dx,
        y: start.y + t * dy,
      };
    };

    const result: PointXY[] = [];
    let previous = polygon[polygon.length - 1];
    let previousInside = inside(previous);

    for (const current of polygon) {
      const currentInside = inside(current);
      if (currentInside) {
        if (!previousInside) {
          result.push(intersect(previous, current));
        }
        result.push(current);
      } else if (previousInside) {
        result.push(intersect(previous, current));
      }
      previous = current;
      previousInside = currentInside;
    }

    return result;
  }

  private clipRegionToBounds(lines: Line[], bounds: Bounds): PointXY[] {
    let polygon: PointXY[] = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ];

    for (const line of lines) {
      polygon = this.clipPolygonToHalfPlane(polygon, line);
      if (polygon.length === 0) {
        return [];
      }
    }

    return polygon;
  }

  private getPixelsPerUnit() {
    return this.viewState.gridSpacing * this.viewState.scaleFactor || 1;
  }

  private getUnitsPerPixel() {
    return 1 / this.getPixelsPerUnit();
  }

  private clampScaleFactor(value: number) {
    return Math.max(ORTHO_MIN_SCALE_FACTOR, Math.min(ORTHO_MAX_SCALE_FACTOR, value));
  }

  private getViewportTarget() {
    if (this.controlState.orbitActive) {
      return this.controls.orbit.target.clone();
    }
    const state = getState();
    if (state.isTransitioning3D && state.transitionDirection === "to2d") {
      return this.getCurrentTransitionTarget();
    }
    return this.getPlanarViewportTarget();
  }

  private getPlanarViewportTarget() {
    const unitsPerPixel = this.getUnitsPerPixel();
    const centerShiftX = (this.viewState.centerX - window.innerWidth / 2) * unitsPerPixel;
    const centerShiftY = (this.viewState.centerY - window.innerHeight / 2) * unitsPerPixel;
    return new Vector3(
      -this.viewState.offset.x - centerShiftX,
      -this.viewState.offset.y + centerShiftY,
      0,
    );
  }

  private getPerspectiveDistanceToFitBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number }, padding = 50) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width <= 0 || height <= 0) {
      return this.getPerspectiveDistance();
    }

    const availWidth = Math.max(100, window.innerWidth - this.sidebarWidth - 2 * padding);
    const availHeight = Math.max(100, window.innerHeight - 2 * padding);
    const verticalFov = this.cameras.perspective.fov * (Math.PI / 180);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (availWidth / availHeight));
    const distanceX = width / (2 * Math.tan(horizontalFov / 2));
    const distanceY = height / (2 * Math.tan(verticalFov / 2));
    return Math.max(10, distanceX, distanceY);
  }

  private getPerspectiveDistanceToFitBox(
    bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
    target: Vector3,
    viewAngle: PointXYZ,
    padding = 50,
  ) {
    const availWidth = Math.max(100, window.innerWidth - this.sidebarWidth - 2 * padding);
    const availHeight = Math.max(100, window.innerHeight - 2 * padding);
    const verticalFov = this.cameras.perspective.fov * (Math.PI / 180);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (availWidth / availHeight));
    const tanHalfH = Math.tan(horizontalFov / 2);
    const tanHalfV = Math.tan(verticalFov / 2);

    const euler = new Euler(-viewAngle.x, -viewAngle.y, -viewAngle.z, "XYZ");
    const forward = new Vector3(0, 0, 1).applyEuler(euler).normalize();
    const up = new Vector3(0, 1, 0).applyEuler(euler).normalize();
    const right = new Vector3().crossVectors(up, forward).normalize();

    const xs = [bounds.minX, bounds.maxX];
    const ys = [bounds.minY, bounds.maxY];
    const zs = [bounds.minZ, bounds.maxZ];
    let requiredDistance = 10;

    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          const relative = new Vector3(x - target.x, y - target.y, z - target.z);
          const forwardOffset = relative.dot(forward);
          const horizontalOffset = Math.abs(relative.dot(right));
          const verticalOffset = Math.abs(relative.dot(up));
          requiredDistance = Math.max(
            requiredDistance,
            forwardOffset + horizontalOffset / Math.max(EPS, tanHalfH),
            forwardOffset + verticalOffset / Math.max(EPS, tanHalfV),
          );
        }
      }
    }

    return requiredDistance;
  }

  private getPlanarOffset(offset: number) {
    const { is3DMode, isTransitioning3D } = getState();
    return is3DMode || isTransitioning3D ? 0 : offset;
  }

  private getVisibleBounds(toLogicalCoords: (screenX: number, screenY: number) => PointXY, margin = 50): Bounds {
    const topLeft = toLogicalCoords(-margin, -margin);
    const bottomRight = toLogicalCoords(window.innerWidth + margin, window.innerHeight + margin);
    return {
      minX: Math.min(topLeft.x, bottomRight.x) - margin,
      maxX: Math.max(topLeft.x, bottomRight.x) + margin,
      minY: Math.min(topLeft.y, bottomRight.y) - margin,
      maxY: Math.max(topLeft.y, bottomRight.y) + margin,
    };
  }

  private buildGridLinePositions(bounds: Bounds, spacing: number) {
    const positions: number[] = [];
    const startX = Math.floor(bounds.minX / spacing) * spacing;
    const endX = Math.ceil(bounds.maxX / spacing) * spacing;
    const startY = Math.floor(bounds.minY / spacing) * spacing;
    const endY = Math.ceil(bounds.maxY / spacing) * spacing;

    for (let x = startX; x <= endX + EPS; x += spacing) {
      positions.push(x, bounds.minY, 0, x, bounds.maxY, 0);
    }
    for (let y = startY; y <= endY + EPS; y += spacing) {
      positions.push(bounds.minX, y, 0, bounds.maxX, y, 0);
    }

    return positions;
  }

  private getRenderBounds(context: ReturnType<ViewportManager["buildRenderContext"]>): Bounds {
    if (context.is3D) {
      return this.getUnboundedClipBounds();
    }
    return this.getVisibleBounds(context.toLogicalCoords);
  }

  getUnboundedClipBounds(): Bounds {
    const extent = MAX_3D_DRAG_BOUND;
    return {
      minX: -extent,
      maxX: extent,
      minY: -extent,
      maxY: extent,
    };
  }

  private is3DState() {
    const { is3DMode, isTransitioning3D } = getState();
    return is3DMode || isTransitioning3D;
  }

  private shouldSnapToGrid() {
    return getState().snapToGrid;
  }

  private getProjectionViewAngle() {
    return this.controlState.orbitActive ? this.getOrbitAngles(this.cameras.perspective.rotation) : getState().viewAngle;
  }

  private syncOffsetFromTarget(targetX: number, targetY: number) {
    const unitsPerPixel = this.getUnitsPerPixel();
    const centerShiftX = (this.viewState.centerX - window.innerWidth / 2) * unitsPerPixel;
    const centerShiftY = (this.viewState.centerY - window.innerHeight / 2) * unitsPerPixel;
    this.viewState.offset.x = -targetX - centerShiftX;
    this.viewState.offset.y = -targetY + centerShiftY;
  }

  private syncOffsetFromVisibleCenter(targetX: number, targetY: number) {
    this.viewState.offset.x = -targetX;
    this.viewState.offset.y = -targetY;
  }

  private computeObjectiveValue(x: number, y: number) {
    const { objectiveVector } = getState();
    if (!objectiveVector) return 0;
    return objectiveVector.x * x + objectiveVector.y * y;
  }

  private getDisplayedZValue(x: number, y: number, z?: number, objectiveVector?: PointXY | null) {
    return getDisplayedIterateZ(z === undefined ? [x, y] : [x, y, z], objectiveVector);
  }

  private scaleZValue(value: number) {
    return (value * getState().zScale) / 100;
  }

  private getWorldSizeFromPixels(pixels: number, worldPosition?: Vector3) {
    if (this.cameras.active instanceof OrthographicCamera) {
      return pixels / this.getPixelsPerUnit();
    }

    const distance = worldPosition
      ? this.cameras.perspective.position.distanceTo(worldPosition)
      : this.cameras.perspective.position.length();
    const fovRadians = (this.cameras.perspective.fov * Math.PI) / 180;
    const viewportHeight = 2 * Math.tan(fovRadians / 2) * distance;
    return (pixels / this.renderState.lineResolution.y) * viewportHeight;
  }

  private getPerspectiveDistance(unitsPerPixel = this.getUnitsPerPixel(), height = window.innerHeight) {
    const fov = this.cameras.perspective.fov * (Math.PI / 180);
    return Math.max(10, (height * unitsPerPixel) / (2 * Math.tan(fov / 2)));
  }

  private getMaxPerspectiveDistance() {
    return this.getPerspectiveDistance(1 / (this.viewState.gridSpacing * ORTHO_MIN_SCALE_FACTOR));
  }

  private clampPerspectiveDistance(distance: number) {
    return Math.min(this.getMaxPerspectiveDistance(), Math.max(10, distance));
  }

  private getScaleFactorFromDistance(distance: number, height = window.innerHeight) {
    const fov = this.cameras.perspective.fov * (Math.PI / 180);
    const safeDistance = Math.max(10, distance);
    const viewportHeight = 2 * Math.tan(fov / 2) * safeDistance;
    const unitsPerPixel = viewportHeight / height;
    return this.clampScaleFactor(1 / (unitsPerPixel * this.viewState.gridSpacing));
  }

  private updateInteractionPlane(objectiveVector: PointXY | null, zScale: number, is3D: boolean) {
    if (objectiveVector && is3D && !getState().zAxisOffsetOnly) {
      const scale = zScale / 100;
      this.interactionProjection.interactionPlaneNormal
        .set(objectiveVector.x * scale, objectiveVector.y * scale, -1)
        .normalize();
    } else {
      this.interactionProjection.interactionPlaneNormal.set(0, 0, 1);
    }
    this.interactionProjection.interactionPlane.setFromNormalAndCoplanarPoint(
      this.interactionProjection.interactionPlaneNormal,
      this.interactionProjection.planeOrigin,
    );
  }

  private projectScreenToInteractionPlane(screenX: number, screenY: number): PointXY | null {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = rect;
    if (width === 0 || height === 0) return null;

    this.interactionProjection.pointerNdc.set((screenX / width) * 2 - 1, -((screenY / height) * 2 - 1));
    this.cameras.perspective.updateMatrixWorld();
    this.cameras.perspective.updateProjectionMatrix();
    this.interactionProjection.raycaster.setFromCamera(this.interactionProjection.pointerNdc, this.cameras.perspective);
    return this.interactionProjection.raycaster.ray.intersectPlane(
      this.interactionProjection.interactionPlane,
      this.interactionProjection.pointerWorld,
    )
      ? { x: this.interactionProjection.pointerWorld.x, y: this.interactionProjection.pointerWorld.y }
      : null;
  }

  private projectScreenToWorldPlane(screenX: number, screenY: number, z = 0): PointXY | null {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = rect;
    if (width === 0 || height === 0) return null;

    this.interactionProjection.pointerNdc.set((screenX / width) * 2 - 1, -((screenY / height) * 2 - 1));
    this.cameras.perspective.updateMatrixWorld();
    this.cameras.perspective.updateProjectionMatrix();
    this.interactionProjection.raycaster.setFromCamera(this.interactionProjection.pointerNdc, this.cameras.perspective);
    const plane = new Plane(new Vector3(0, 0, 1), -z);
    return this.interactionProjection.raycaster.ray.intersectPlane(plane, this.interactionProjection.pointerWorld)
      ? { x: this.interactionProjection.pointerWorld.x, y: this.interactionProjection.pointerWorld.y }
      : null;
  }

  private getVisibleCenterWorldPoint(z = 0) {
    const point = this.projectScreenToWorldPlane(this.viewState.centerX, this.viewState.centerY, z);
    if (point) {
      return point;
    }
    const fallback = this.getCurrentTransitionTarget();
    return { x: fallback.x, y: fallback.y };
  }

  private getCurrentTransitionTarget() {
    const state = getState();
    if (!(state.isTransitioning3D && state.transitionDirection === "to2d")) {
      return this.controlState.transitionStartTarget.clone();
    }
    return this.controlState.transitionStartTarget.clone().lerp(this.controlState.transitionEndTarget, state.transitionProgress);
  }

  private getFlattenTo2DProgress() {
    const state = getState();
    if (!state.isTransitioning3D || !state.transitionDirection) {
      return 0;
    }
    return state.transitionDirection === "to3d" ? 1 - state.transitionProgress : state.transitionProgress;
  }

  private align2DStateToCurrentTransitionView() {
    if (!(getState().isTransitioning3D && getState().transitionDirection === "to2d")) {
      return;
    }
    const returnFocus = this.getVisibleCenterWorldPoint(this.controlState.transitionEndTarget.z);
    this.syncOffsetFromVisibleCenter(returnFocus.x, returnFocus.y);
  }

  private getTransitionDirtyFlags() {
    return { polytope: true, objective: true, trace: true, iterate: true };
  }

  private initializeTransitionTargets(targetMode: boolean) {
    if (targetMode) {
      this.controlState.transitionStartTarget.copy(this.getViewportTarget());
      this.controlState.transitionEndTarget.copy(this.controlState.transitionStartTarget);
      if (this.controlState.orbitActive) {
        this.captureOrbitViewAngle();
      }
      this.controlState.pendingScaleFactorFrom3D = null;
      return;
    }

    this.snapshotOrbitState();
    this.controlState.transitionStartTarget.copy(this.controls.orbit.target);
    this.controlState.transitionEndTarget.copy(this.controls.orbit.target);
    this.controlState.transitionEndTarget.z = 0;
    this.syncOffsetFromTarget(this.controlState.transitionEndTarget.x, this.controlState.transitionEndTarget.y);
    this.captureReturnScaleFrom3D();
    this.deactivateOrbitControls();
  }

  private complete3DTransition(targetMode: boolean) {
    mutate((draft) => {
      draft.isTransitioning3D = false;
      draft.transitionDirection = null;
      draft.transitionProgress = 0;
      draft.viewAngle.x = targetMode ? DEFAULT_VIEW_ANGLE.x : 0;
      draft.viewAngle.y = targetMode ? DEFAULT_VIEW_ANGLE.y : 0;
      draft.viewAngle.z = targetMode ? DEFAULT_VIEW_ANGLE.z : 0;
    }, { viewportDirty: this.getTransitionDirtyFlags() });

    if (!targetMode && this.controlState.pendingScaleFactorFrom3D !== null) {
      this.viewState.scaleFactor = this.controlState.pendingScaleFactorFrom3D;
      this.controlState.pendingScaleFactorFrom3D = null;
      this.syncOrthoTarget(this.getViewportTarget(), true);
    }

    this.draw();
    this.scheduleViewportNavigationEnd();
  }

  private getBlendedRenderZ(
    zValue: number,
    planarOffset: number,
    context: Pick<
      ReturnType<ViewportManager["buildRenderContext"]>,
      "is3D" | "flattenTo2DProgress" | "getFinalPlanarOffset"
    >,
  ) {
    const z3D = this.scaleZValue(zValue) + planarOffset;
    const planarZ = context.getFinalPlanarOffset(planarOffset);
    if (!context.is3D) return planarZ;
    if (!context.flattenTo2DProgress) return z3D;
    return lerp(z3D, planarZ, context.flattenTo2DProgress);
  }

  private getBlendedObjectiveZ(
    x: number,
    y: number,
    planarOffset: number,
    context: Pick<
      ReturnType<ViewportManager["buildRenderContext"]>,
      "is3D" | "flattenTo2DProgress" | "getFinalPlanarOffset" | "computeObjectiveValue"
    >,
  ) {
    return this.getBlendedRenderZ(this.getDisplayedZValue(x, y), planarOffset, context);
  }

  private getBlendedPointPosition(
    entry: number[],
    planarOffset: number,
    context: Pick<
      ReturnType<ViewportManager["buildRenderContext"]>,
      "is3D" | "flattenTo2DProgress" | "getFinalPlanarOffset" | "computeObjectiveValue"
    >,
    objectiveVector?: PointXY | null,
  ) {
    const [x, y] = entry;
    const zValue = this.getDisplayedZValue(x, y, entry[2], objectiveVector);
    return new Vector3(x, y, this.getBlendedRenderZ(zValue, planarOffset, context));
  }

  private getVertexZ(x: number, y: number, extra = 0) {
    return this.scaleZValue(this.getDisplayedZValue(x, y)) + this.getPlanarOffset(extra);
  }

  private getWorldPosition(x: number, y: number, z?: number) {
    if (!this.is3DState()) {
      return new Vector3(x, y, this.getPlanarOffset(0));
    }
    const zValue = this.getDisplayedZValue(x, y, z);
    return new Vector3(x, y, this.scaleZValue(zValue));
  }

  private getObjectiveWorldPosition(target: PointXY) {
    return new Vector3(target.x, target.y, this.getPlanarOffset(OBJECTIVE_Z_OFFSET));
  }

  private projectWorldPosition(position: Vector3): PointXY {
    const projected = position.clone().project(this.cameras.active);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((projected.x + 1) / 2) * rect.width,
      y: ((1 - projected.y) / 2) * rect.height,
    };
  }

  private toPlaneVector(screenX: number, screenY: number) {
    return new Vector2(
      (screenX - this.viewState.centerX) * this.getUnitsPerPixel() - this.viewState.offset.x,
      (this.viewState.centerY - screenY) * this.getUnitsPerPixel() - this.viewState.offset.y,
    );
  }

  private snapPoint(point: PointXY) {
    if (!this.shouldSnapToGrid()) return point;
    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
  }

  private inverseProject2DPoint(projectedPoint2d: PointXY, viewAngles: PointXYZ): PointXY {
    const inverseRotationMatrix = new Matrix4()
      .makeRotationFromEuler(new Euler(viewAngles.x, viewAngles.y, viewAngles.z, "XYZ"))
      .invert();
    const inverseVector = new Vector3(projectedPoint2d.x, projectedPoint2d.y, 0).applyMatrix4(inverseRotationMatrix);
    return { x: inverseVector.x, y: inverseVector.y };
  }

  private buildPositionVector(entry: number[], planarOffset = 0) {
    const [x, y] = entry;
    const zValue = this.getDisplayedZValue(x, y, entry[2]);
    return new Vector3(x, y, this.scaleZValue(zValue) + this.getPlanarOffset(planarOffset));
  }

  private buildPositionArray(path: number[][], planarOffset = 0) {
    const positions = new Float32Array(path.length * 3);
    const planarZOffset = this.getPlanarOffset(planarOffset);
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      const zValue = this.getDisplayedZValue(x, y, path[i][2]);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = this.scaleZValue(zValue) + planarZOffset;
    }
    return positions;
  }

  private getDefaultPerspectiveDistance() {
    return this.getPerspectiveDistance();
  }

  private getOrbitAngles(rotation: Euler) {
    return { x: -rotation.x, y: -rotation.y, z: -rotation.z };
  }

  private captureOrbitViewAngle() {
    setState({ viewAngle: this.getOrbitAngles(this.cameras.perspective.rotation) }, { viewportDirty: {} });
  }

  private syncOrthoTarget(target = this.getViewportTarget(), resetZoom = false) {
    this.controlState.suppressOrthoChange = true;
    this.controls.ortho.target.copy(target);
    this.controls.ortho.update();
    if (resetZoom) {
      this.cameras.ortho.zoom = 1;
      this.cameras.ortho.updateProjectionMatrix();
    }
    this.controlState.suppressOrthoChange = false;
  }

  private applyPerspectivePose(viewAngle: PointXYZ, distance = this.getDefaultPerspectiveDistance(), target = this.getViewportTarget()) {
    const euler = new Euler(-viewAngle.x, -viewAngle.y, -viewAngle.z, "XYZ");
    const direction = new Vector3(0, 0, 1).applyEuler(euler).normalize();
    const clampedDistance = this.clampPerspectiveDistance(distance);
    const position = target.clone().add(direction.multiplyScalar(clampedDistance));
    const up = new Vector3(0, 1, 0).applyEuler(euler).normalize();
    this.cameras.perspective.position.copy(position);
    this.cameras.perspective.up.copy(up);
    this.cameras.perspective.lookAt(target);
    const pose = { position, up, target, distance: clampedDistance };
    this.controlState.currentPerspectiveDistance = pose.distance;
    return pose;
  }

  private captureReturnScaleFrom3D() {
    const target = this.controlState.orbitActive ? this.controls.orbit.target : this.getViewportTarget();
    const distance = this.cameras.perspective.position.distanceTo(target);
    this.controlState.currentPerspectiveDistance = Number.isFinite(distance) ? distance : this.controlState.currentPerspectiveDistance;
    this.controlState.pendingScaleFactorFrom3D = this.getScaleFactorFromDistance(this.controlState.currentPerspectiveDistance);
  }

  private snapshotOrbitState() {
    if (!this.controlState.orbitActive) {
      return;
    }
    this.controls.orbit.update();
    this.controlState.lastOrbitTarget.copy(this.controls.orbit.target);
    const distance = this.clampPerspectiveDistance(this.cameras.perspective.position.distanceTo(this.controls.orbit.target));
    this.controlState.currentPerspectiveDistance = Number.isFinite(distance) ? distance : this.controlState.currentPerspectiveDistance;
  }

  private easeInOutCubic(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private lerpAngle(start: number, end: number, t: number) {
    return start + (end - start) * t;
  }

  private registerCachedMaterial(material: Material) {
    this.renderResources.cachedMaterials.add(material);
  }

  private makeCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create 2D canvas context for sprite texture");
    }

    draw(ctx, size);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createCircleTexture(deviceRatio: number, scaleBucket: number) {
    const size = 32 * deviceRatio * scaleBucket;
    return this.makeCanvasTexture(size, (ctx, textureSize) => {
      ctx.clearRect(0, 0, textureSize, textureSize);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(textureSize / 2, textureSize / 2, textureSize * 0.44, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private createSquareTexture(deviceRatio: number, scaleBucket: number) {
    const size = 32 * deviceRatio * scaleBucket;
    return this.makeCanvasTexture(size, (ctx, textureSize) => {
      ctx.clearRect(0, 0, textureSize, textureSize);
      ctx.fillStyle = "#ffffff";
      const inset = textureSize * 0.06;
      ctx.fillRect(inset, inset, textureSize - inset * 2, textureSize - inset * 2);
    });
  }

  private createStarTexture(color: number) {
    const size = 96;
    return this.makeCanvasTexture(size, (ctx, textureSize) => {
      const center = textureSize / 2;
      const outerRadius = textureSize * 0.38;
      const innerRadius = textureSize * 0.18;

      ctx.clearRect(0, 0, textureSize, textureSize);
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.beginPath();

      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fill();
    });
  }

  private getCircleTexture() {
    const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const cacheKey = `circle-${deviceRatio}`;
    let texture = this.renderResources.circleTextures.get(cacheKey);
    if (texture) return texture;
    texture = this.createCircleTexture(deviceRatio, 2);
    this.renderResources.circleTextures.set(cacheKey, texture);
    return texture;
  }

  private getSquareTexture() {
    const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const cacheKey = `square-${deviceRatio}`;
    let texture = this.renderResources.squareTextures.get(cacheKey);
    if (texture) return texture;
    texture = this.createSquareTexture(deviceRatio, 2);
    this.renderResources.squareTextures.set(cacheKey, texture);
    return texture;
  }

  private getStarTexture(color: number) {
    let texture = this.renderResources.starTextures.get(color);
    if (texture) return texture;
    texture = this.createStarTexture(color);
    this.renderResources.starTextures.set(color, texture);
    return texture;
  }

  private getLineMaterial(options: {
    color: number;
    width: number;
    depthTest?: boolean;
    depthWrite?: boolean;
  }) {
    const key = `${options.color}:${options.width}:${options.depthTest ?? true}:${options.depthWrite ?? true}`;
    let material = this.renderResources.lineMaterialCache.get(key);
    if (!material) {
      material = new LineMaterial({
        color: options.color,
        linewidth: options.width,
        transparent: false,
        opacity: 1,
        depthTest: options.depthTest ?? true,
        depthWrite: options.depthWrite ?? true,
      });
      this.renderResources.lineMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    } else {
      material.color.set(options.color);
      material.depthTest = options.depthTest ?? true;
      material.depthWrite = options.depthWrite ?? true;
    }
    material.resolution.copy(this.renderState.lineResolution);
    return material;
  }

  private getLineBasicMaterial(options: {
    color: number;
    transparent?: boolean;
    opacity?: number;
    depthTest?: boolean;
    depthWrite?: boolean;
  }) {
    const key = `${options.color}:${options.transparent ?? false}:${options.opacity ?? 1}:${options.depthTest ?? true}:${options.depthWrite ?? true}`;
    let material = this.renderResources.lineBasicMaterialCache.get(key);
    if (!material) {
      material = new LineBasicMaterial({
        color: options.color,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        depthTest: options.depthTest ?? true,
        depthWrite: options.depthWrite ?? true,
      });
      this.renderResources.lineBasicMaterialCache.set(key, material);
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

  private getPointMaterial(options: {
    color: number;
    size: number;
    sizeAttenuation: boolean;
    depthTest: boolean;
    depthWrite: boolean;
    transparent?: boolean;
    opacity?: number;
    alphaTest?: number;
    vertexColors?: boolean;
    shape?: "circle" | "square";
  }) {
    const shape = options.shape ?? "circle";
    const texture = shape === "square" ? this.getSquareTexture() : this.getCircleTexture();
    const key = [
      shape,
      options.color,
      options.size,
      options.sizeAttenuation,
      options.depthTest,
      options.depthWrite,
      options.transparent ?? false,
      options.opacity ?? 1,
      options.alphaTest ?? 0,
      options.vertexColors ?? false,
    ].join(":");
    let material = this.renderResources.pointsMaterialCache.get(key);
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
        vertexColors: options.vertexColors ?? false,
        alphaMap: texture,
      });
      material.needsUpdate = true;
      this.renderResources.pointsMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    } else if (material.alphaMap !== texture) {
      material.alphaMap = texture;
      material.needsUpdate = true;
    }
    return material;
  }

  private getSpriteMaterial(type: "circle" | "star" | "square", color: number) {
    const texture = type === "star" ? this.getStarTexture(color) : type === "square" ? this.getSquareTexture() : this.getCircleTexture();
    const key = `${type}:${color}`;
    let material = this.renderResources.spriteMaterialCache.get(key);
    if (!material) {
      material = new SpriteMaterial({
        map: texture,
        transparent: false,
        alphaTest: 0.5,
        depthTest: false,
        depthWrite: false,
      });
      material.color.set(color);
      this.renderResources.spriteMaterialCache.set(key, material);
      this.registerCachedMaterial(material);
    } else if (material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
    return material;
  }

  private createThickLine(
    positions: number[],
    options: {
      color: number;
      width: number;
      depthTest?: boolean;
      depthWrite?: boolean;
      renderOrder?: number;
    },
  ) {
    const { color, width, depthTest = true, depthWrite = true, renderOrder = 0 } = options;
    const geometry = new AlwaysVisibleLineGeometry();
    geometry.setPositions(positions);
    const material = this.getLineMaterial({ color, width, depthTest, depthWrite });
    const line = new UndashedLine2(geometry, material);
    line.renderOrder = renderOrder;
    line.frustumCulled = false;
    return line;
  }

  private addThickLine(
    group: Group,
    helpers: ReturnType<ViewportManager["buildRenderContext"]>["helpers"],
    positions: number[],
    options: {
      color: number;
      width: number;
      depthTest?: boolean;
      depthWrite?: boolean;
      renderOrder?: number;
    },
  ) {
    const line = helpers.createThickLine(positions, options);
    group.add(line);
    return line;
  }

  private updateThickLine(
    line: UndashedLine2,
    positions: number[],
    options: {
      color: number;
      width: number;
      depthTest?: boolean;
      depthWrite?: boolean;
      renderOrder?: number;
      transparent?: boolean;
      opacity?: number;
      replaceGeometry?: boolean;
    },
  ) {
    let geometry = line.geometry as AlwaysVisibleLineGeometry;
    if (options.replaceGeometry) {
      geometry.dispose();
      geometry = new AlwaysVisibleLineGeometry();
      line.geometry = geometry;
    }
    geometry.setPositions(positions);
    geometry.attributes.instanceStart.needsUpdate = true;
    geometry.attributes.instanceEnd.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    line.material = this.getLineMaterial({
      color: options.color,
      width: options.width,
      depthTest: options.depthTest,
      depthWrite: options.depthWrite,
    });
    line.material.transparent = options.transparent ?? false;
    line.material.opacity = options.opacity ?? 1;
    line.material.needsUpdate = true;
    line.renderOrder = options.renderOrder ?? 0;
    line.visible = positions.length >= 6;
  }

  private getOrCreateTraceLine(index: number) {
    let line = this.persistentSceneObjects.traceLines[index];
    if (line) return line;
    line = this.createThickLine([0, 0, 0, 0, 0, 0], {
      color: COLORS.trace,
      width: TRACE_LINE_THICKNESS,
      depthTest: true,
      depthWrite: true,
    });
    line.visible = false;
    this.persistentSceneObjects.traceLines[index] = line;
    this.groups.traceLines.add(line);
    return line;
  }

  private getOrCreateIteratePhaseLine(index: number) {
    let line = this.persistentSceneObjects.iteratePhaseLines[index];
    if (line) return line;
    line = this.createThickLine([0, 0, 0, 0, 0, 0], {
      color: COLORS.iteratePath,
      width: ITERATE_LINE_THICKNESS,
      depthTest: false,
      depthWrite: false,
      renderOrder: RENDER_LAYERS.iterateLine,
    });
    line.visible = false;
    this.persistentSceneObjects.iteratePhaseLines[index] = line;
    this.groups.iterate.add(line);
    return line;
  }

  private getOrCreateObjectiveLine(index: number) {
    let line = this.persistentSceneObjects.objectiveLines[index];
    if (line) return line;
    line = this.createThickLine([0, 0, 0, 0, 0, 0], {
      color: COLORS.objective,
      width: ITERATE_LINE_THICKNESS,
      depthTest: true,
      depthWrite: true,
      renderOrder: RENDER_LAYERS.objective,
    });
    line.visible = false;
    this.persistentSceneObjects.objectiveLines[index] = line;
    this.groups.objective.add(line);
    return line;
  }

  private getOrCreatePolytopeVertexSprite(index: number, type: "circle" | "square", color: number, pixelSize: number, position: ThreeVector3) {
    let sprite = this.persistentSceneObjects.polytopeVertexSprites[index];
    const material = this.getSpriteMaterial(type, color);
    const worldSize = this.getWorldSizeFromPixels(pixelSize, position);
    if (!sprite) {
      sprite = this.createSpriteAtSize(position, material, worldSize);
      this.persistentSceneObjects.polytopeVertexSprites[index] = sprite;
      this.groups.polytopeVertices.add(sprite);
    } else {
      sprite.material = material;
      sprite.position.copy(position);
      sprite.scale.set(worldSize, worldSize, worldSize);
    }
    sprite.userData.pixelSize = pixelSize;
    sprite.renderOrder = RENDER_LAYERS.polytopeVertices;
    sprite.visible = true;
    return sprite;
  }

  private getOrCreatePolytopeFillMesh() {
    let mesh = this.persistentSceneObjects.polytopeFillMesh;
    if (mesh) return mesh;
    mesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: COLORS.polytopeFill,
        transparent: true,
        opacity: 0.6,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    mesh.visible = false;
    this.persistentSceneObjects.polytopeFillMesh = mesh;
    this.groups.polytopeFill.add(mesh);
    return mesh;
  }

  private getOrCreatePolytopeOutlineLine(index: number) {
    let line = this.persistentSceneObjects.polytopeOutlineLines[index];
    if (line) return line;
    line = this.createThickLine([0, 0, 0, 0, 0, 0], {
      color: 0x000000,
      width: POLY_LINE_THICKNESS,
      depthTest: true,
      depthWrite: true,
      renderOrder: RENDER_LAYERS.polyEdges,
    });
    line.visible = false;
    this.persistentSceneObjects.polytopeOutlineLines[index] = line;
    this.groups.polytopeOutline.add(line);
    return line;
  }

  private getOrCreateConstraintLine() {
    let line = this.persistentSceneObjects.constraintLine;
    if (line) return line;
    line = this.createThickLine([0, 0, 0, 0, 0, 0], {
      color: COLORS.polytopeHighlight,
      width: POLY_LINE_THICKNESS,
      depthTest: true,
      depthWrite: true,
      renderOrder: RENDER_LAYERS.constraintLines,
    });
    line.visible = false;
    this.persistentSceneObjects.constraintLine = line;
    this.groups.constraint.add(line);
    return line;
  }

  private updatePointCloudGeometry(pointCloud: Points, positions: ArrayLike<number>, colors?: ArrayLike<number>) {
    const geometry = pointCloud.geometry as BufferGeometry;
    geometry.setAttribute("position", new Float32BufferAttribute(Array.from(positions), 3));
    if (colors) {
      geometry.setAttribute("color", new Float32BufferAttribute(Array.from(colors), 3));
    } else if (geometry.getAttribute("color")) {
      geometry.deleteAttribute("color");
    }
    geometry.computeBoundingSphere();
  }

  private getOrCreatePointCloud(
    current: Points | null,
    group: Group,
    helpers: ReturnType<ViewportManager["buildRenderContext"]>["helpers"],
    options: {
      color: number;
      size: number;
      renderOrder: number;
      colors?: ArrayLike<number>;
      shape?: "circle" | "square";
    },
  ) {
    if (current) {
      const material = helpers.getPointMaterial({
        color: options.color,
        size: options.size,
        sizeAttenuation: false,
        depthWrite: false,
        depthTest: false,
        transparent: false,
        opacity: 1,
        alphaTest: 0.2,
        vertexColors: Boolean(options.colors),
        shape: options.shape,
      });
      current.material = material;
      current.renderOrder = options.renderOrder;
      return current;
    }
    const pointCloud = this.createPointCloud([], helpers, options);
    group.add(pointCloud);
    return pointCloud;
  }

  private createSpriteAtSize(position: ThreeVector3, material: SpriteMaterial, size: number) {
    const sprite = new Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(size, size, size);
    return sprite;
  }

  private createCircleSprite(position: ThreeVector3, color: number, size: number) {
    return this.createSpriteAtSize(position, this.getSpriteMaterial("circle", color), size);
  }

  private createStarSprite(position: ThreeVector3, color: number) {
    const sprite = this.createSpriteAtSize(
      position,
      this.getSpriteMaterial("star", color),
      this.getWorldSizeFromPixels(STAR_POINT_PIXEL_SIZE, position),
    );
    sprite.userData.pixelSize = STAR_POINT_PIXEL_SIZE;
    return sprite;
  }

  private addSprite(group: Group, sprite: Sprite, renderOrder: number) {
    sprite.renderOrder = renderOrder;
    group.add(sprite);
    return sprite;
  }

  private shouldSkipPreviewDrawing(): boolean {
    return getState().tourActive;
  }

  private handleResize = () => {
    this.updateDimensions();
  };

  private refreshScreenSpaceSprites() {
    const refreshGroup = (group: Group) => {
      for (const child of group.children) {
        if (!(child instanceof Sprite)) continue;
        const pixelSize = child.userData.pixelSize;
        if (typeof pixelSize !== "number") continue;
        const worldSize = this.getWorldSizeFromPixels(pixelSize, child.position);
        child.scale.set(worldSize, worldSize, worldSize);
      }
    };

    refreshGroup(this.groups.polytopeVertices);
    refreshGroup(this.groups.iterate);
    refreshGroup(this.groups.overlay);
  }

  private updateLineSegmentsGeometry(lineSegments: LineSegments, positions: number[]) {
    const geometry = lineSegments.geometry as BufferGeometry;
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
  }

  updateDimensions() {
    if (!this.initialized) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.syncRendererPixelRatio(width, height);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.renderState.lineResolution.set(width, height);
    for (const material of this.renderResources.lineMaterialCache.values()) {
      material.resolution.copy(this.renderState.lineResolution);
    }
    this.setViewportCenterFromSidebarWidth(this.sidebarWidth, width, height);
    this.invalidateScene({ grid: true, polytope: false, constraints: false, objective: true, trace: false, iterate: false });
  }

  draw() {
    if (!this.initialized || this.renderScheduled) {
      return;
    }

    this.renderScheduled = true;
    window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.renderFrame();
    });
  }

  private renderFrame() {
    if (!this.initialized) return;
    const state = getState();
    const is3D = state.is3DMode || state.isTransitioning3D;
    if (this.controlState.orbitActive) {
      this.controls.orbit.update();
    }
    this.updateCamera();
    this.refreshScreenSpaceSprites();
    const context = this.buildRenderContext(is3D);
    this.renderScene(context);

    this.renderer.autoClear = true;
    this.renderer.render(this.scenes.background, this.cameras.active);
    this.renderer.autoClear = false;
    [this.scenes.transparent, this.scenes.foreground, this.scenes.vertices, this.scenes.traceLines, this.scenes.trace, this.scenes.overlay].forEach((scene) =>
      this.renderer.render(scene, this.cameras.active),
    );
    this.renderer.autoClear = true;
  }

  private buildRenderContext(is3D: boolean): {
    is3D: boolean;
    groups: typeof this.groups;
    gridSpacing: number;
    scaleFactor: number;
    offset: { x: number; y: number };
    centerX: number;
    centerY: number;
    lineResolution: Vector2;
    skipPreviewDrawing: boolean;
    helpers: typeof this.renderHelpers;
    toLogicalCoords(screenX: number, screenY: number): PointXY;
    computeObjectiveValue(x: number, y: number): number;
    scaleZValue(value: number): number;
    getPlanarOffset(offset: number): number;
    flattenTo2DProgress: number;
    getFinalPlanarOffset(offset: number): number;
    getVertexZ(x: number, y: number, extra?: number): number;
  } {
    return {
      is3D,
      groups: this.groups,
      gridSpacing: this.viewState.gridSpacing,
      scaleFactor: this.viewState.scaleFactor,
      offset: this.viewState.offset,
      centerX: this.viewState.centerX,
      centerY: this.viewState.centerY,
      lineResolution: this.renderState.lineResolution,
      skipPreviewDrawing: this.shouldSkipPreviewDrawing(),
      helpers: this.renderHelpers,
      toLogicalCoords: this.toLogicalCoords.bind(this),
      computeObjectiveValue: (x, y) => this.computeObjectiveValue(x, y),
      scaleZValue: (value) => this.scaleZValue(value),
      getPlanarOffset: (offset: number) => this.getPlanarOffset(offset),
      flattenTo2DProgress: this.getFlattenTo2DProgress(),
      getVertexZ: (x, y, extra) => this.getVertexZ(x, y, extra),
      getFinalPlanarOffset: (offset: number) => offset,
    };
  }

  private renderScene(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    if (this.renderState.dirty.grid) {
      this.renderGrid(context);
      this.renderState.dirty.grid = false;
    }
    if (this.renderState.dirty.polytope) {
      this.renderPolytope(context);
      this.renderState.dirty.polytope = false;
    }
    if (this.renderState.dirty.constraints) {
      this.renderConstraints(context);
      this.renderState.dirty.constraints = false;
    }
    if (this.renderState.dirty.objective) {
      this.renderObjective(context);
      this.renderState.dirty.objective = false;
    }
    if (this.renderState.dirty.trace) {
      this.renderTrace(context);
      this.renderState.dirty.trace = false;
    }
    if (this.renderState.dirty.iterate) {
      this.renderIterate(context);
      this.renderState.dirty.iterate = false;
    }
  }

  private renderGrid(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    const { helpers, groups, is3D, toLogicalCoords, scaleFactor } = context;
    if (!this.gridObjects.lines) {
      this.gridObjects.lines = new LineSegments(
        new BufferGeometry(),
        helpers.getLineBasicMaterial({
          color: COLORS.grid,
          transparent: false,
          opacity: 1,
          depthTest: true,
          depthWrite: false,
        }),
      );
      groups.grid.add(this.gridObjects.lines);
    }
    if (!this.gridObjects.axes) {
      this.gridObjects.axes = new LineSegments(
        new BufferGeometry(),
        helpers.getLineBasicMaterial({
          color: COLORS.axis,
          depthTest: true,
          depthWrite: false,
        }),
      );
      groups.grid.add(this.gridObjects.axes);
    }

    let minX: number, maxX: number, minY: number, maxY: number;
    let gridPositions: number[] = [];
    if (is3D) {
      const extent = Math.max(200, 200 / scaleFactor);
      minX = minY = -extent;
      maxX = maxY = extent;
    } else {
      const tl = toLogicalCoords(-GRID_MARGIN, -GRID_MARGIN);
      const br = toLogicalCoords(window.innerWidth + GRID_MARGIN, window.innerHeight + GRID_MARGIN);
      minX = Math.min(tl.x, br.x) - 5;
      maxX = Math.max(tl.x, br.x) + 5;
      minY = Math.min(tl.y, br.y) - 5;
      maxY = Math.max(tl.y, br.y) + 5;
    }

    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      gridPositions.push(x, minY, 0, x, maxY, 0);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      gridPositions.push(minX, y, 0, maxX, y, 0);
    }

    this.updateLineSegmentsGeometry(this.gridObjects.lines, gridPositions);
    this.updateLineSegmentsGeometry(this.gridObjects.axes, [0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0]);
  }

  private renderPolytope(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    const { is3D, skipPreviewDrawing } = context;

    const { vertices, completionMode, highlightIndex, currentMouse, polytope } = getState();
    const regionFinished = getState().completionMode !== "draft";
    const hasDerivedClosedRegion = completionMode === "open" && polytope?.kind === "bounded" && polytope.vertices.length >= 3;
    const displayVertices: PointXY[] = hasDerivedClosedRegion ? polytope.vertices.map(([x, y]) => ({ x, y })) : vertices;
    const isClosedRegion = completionMode === "closed" || hasDerivedClosedRegion;
    if (vertices.length === 0) {
      if (this.persistentSceneObjects.polytopeFillMesh) {
        this.persistentSceneObjects.polytopeFillMesh.visible = false;
      }
      this.persistentSceneObjects.polytopeOutlineLines.forEach((line) => {
        line.visible = false;
      });
      this.persistentSceneObjects.polytopeVertexSprites.forEach((sprite) => {
        sprite.visible = false;
      });
      return;
    }

    const vrep = VRep.fromPoints(displayVertices);
    const isNonconvex = !vrep.isConvex();
    const useFixedUnboundedBounds = completionMode === "open" && !hasDerivedClosedRegion && polytope?.kind === "unbounded";
    const bounds = useFixedUnboundedBounds ? this.getUnboundedClipBounds() : this.getRenderBounds(context);

    const fillVertices: PointXY[] =
      isClosedRegion && displayVertices.length >= 3
        ? displayVertices
        : completionMode === "open" && polytope?.kind === "unbounded" && hasPolytopeLines(polytope)
          ? this.clipRegionToBounds(polytope.lines, bounds)
          : [];

    if (fillVertices.length >= 3) {
      const shapeGeometry = new ShapeGeometry(this.buildShapeFromVertices(fillVertices));
      if (is3D) {
        const positions = shapeGeometry.getAttribute("position") as Float32BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          positions.setZ(i, this.getBlendedObjectiveZ(x, y, 0, context));
        }
      }
      const mesh = this.getOrCreatePolytopeFillMesh();
      mesh.geometry.dispose();
      mesh.geometry = shapeGeometry;
      const material = mesh.material as MeshBasicMaterial;
      material.color.set(isNonconvex ? COLORS.polytopeHighlight : COLORS.polytopeFill);
      if (!is3D) {
        mesh.position.z = context.getPlanarOffset(VERTEX_Z_OFFSET / 2);
      } else {
        mesh.position.z = 0;
      }
      mesh.renderOrder = RENDER_LAYERS.polyEdges - 1;
      mesh.visible = true;
    } else if (this.persistentSceneObjects.polytopeFillMesh) {
      this.persistentSceneObjects.polytopeFillMesh.visible = false;
    }

    let outlineLineCount = 0;
    const edgeCount = regionFinished ? Math.max(0, displayVertices.length - (isClosedRegion ? 0 : 1)) : Math.max(0, displayVertices.length - 1);
    for (let i = 0; i < edgeCount; i++) {
      const nextIndex = (i + 1) % displayVertices.length;
      if (!isClosedRegion && nextIndex >= displayVertices.length) break;
      const v = displayVertices[i];
      const next = displayVertices[nextIndex];
      const z1 = this.getBlendedObjectiveZ(v.x, v.y, EDGE_Z_OFFSET, context);
      const z2 = this.getBlendedObjectiveZ(next.x, next.y, EDGE_Z_OFFSET, context);
      const positions = [v.x, v.y, z1, next.x, next.y, z2];
      const highlight = !hasDerivedClosedRegion && highlightIndex === i;
      this.updateThickLine(this.getOrCreatePolytopeOutlineLine(outlineLineCount++), positions, {
        color: highlight ? COLORS.polytopeHighlight : 0x000000,
        width: POLY_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.polyEdges,
      });
    }

    if (completionMode === "open" && !hasDerivedClosedRegion && polytope?.boundaryRays) {
      polytope.boundaryRays.forEach((ray) => {
        const clipped = this.clipRayToBounds(
          { x: ray.start[0], y: ray.start[1] },
          { x: ray.direction[0], y: ray.direction[1] },
          bounds,
        );
        if (!clipped) return;
        const [start, end] = clipped;
        const z1 = this.getBlendedObjectiveZ(start.x, start.y, EDGE_Z_OFFSET, context);
        const z2 = this.getBlendedObjectiveZ(end.x, end.y, EDGE_Z_OFFSET, context);
        this.updateThickLine(this.getOrCreatePolytopeOutlineLine(outlineLineCount++), [start.x, start.y, z1, end.x, end.y, z2], {
          color: 0x000000,
          width: POLY_LINE_THICKNESS,
          depthTest: is3D,
          depthWrite: is3D,
          renderOrder: RENDER_LAYERS.polyEdges,
        });
      });
    }

    const vertexSizePx = VERTEX_POINT_PIXEL_SIZE;
    displayVertices.forEach((v, index) => {
      const position = this.getBlendedPointPosition([v.x, v.y], VERTEX_Z_OFFSET, context);
      const isOpenRayAnchor = completionMode === "open" && !hasDerivedClosedRegion && (index === 0 || index === displayVertices.length - 1);
      this.getOrCreatePolytopeVertexSprite(
        index,
        isOpenRayAnchor ? "square" : "circle",
        isOpenRayAnchor ? COLORS.polytopeHighlight : COLORS.vertex,
        vertexSizePx,
        position,
      );
    });
    for (let index = displayVertices.length; index < this.persistentSceneObjects.polytopeVertexSprites.length; index++) {
      this.persistentSceneObjects.polytopeVertexSprites[index]!.visible = false;
    }

    if (!regionFinished && displayVertices.length >= 1 && currentMouse && !skipPreviewDrawing) {
      const last = displayVertices[displayVertices.length - 1];
      const lastZ = this.getBlendedObjectiveZ(last.x, last.y, EDGE_Z_OFFSET, context);
      const previewZ = this.getBlendedObjectiveZ(currentMouse.x, currentMouse.y, EDGE_Z_OFFSET, context);
      this.updateThickLine(this.getOrCreatePolytopeOutlineLine(outlineLineCount++), [last.x, last.y, lastZ, currentMouse.x, currentMouse.y, previewZ], {
        color: 0x000000,
        width: POLY_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.polyEdges,
      });
    }
    for (let index = outlineLineCount; index < this.persistentSceneObjects.polytopeOutlineLines.length; index++) {
      this.persistentSceneObjects.polytopeOutlineLines[index]!.visible = false;
    }
  }

  private renderConstraints(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    const { is3D, toLogicalCoords } = context;

    const { completionMode, polytope, highlightIndex } = getState();
    if (completionMode === "draft" || highlightIndex === null || !polytope || !hasPolytopeLines(polytope)) {
      if (this.persistentSceneObjects.constraintLine) {
        this.persistentSceneObjects.constraintLine.visible = false;
      }
      return;
    }

    const bounds = this.getVisibleBounds(toLogicalCoords);
    let renderedConstraint = false;

    polytope.lines.forEach((line, index) => {
      if (index !== highlightIndex) return;
      const segment = this.clipLineToBounds(line, bounds);
      if (!segment) return;
      const [start, end] = segment;
      this.updateThickLine(this.getOrCreateConstraintLine(), [start.x, start.y, 0, end.x, end.y, 0], {
        color: COLORS.polytopeHighlight,
        width: POLY_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.constraintLines,
      });
      renderedConstraint = true;
    });
    if (!renderedConstraint && this.persistentSceneObjects.constraintLine) {
      this.persistentSceneObjects.constraintLine.visible = false;
    }
  }

  private renderObjective(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    const { helpers, is3D, skipPreviewDrawing } = context;

    const { objectiveHidden, objectiveVector, currentObjective, polytope } = getState();
    if (objectiveHidden) {
      this.persistentSceneObjects.objectiveLines.forEach((line) => {
        line.visible = false;
      });
      return;
    }

    const target = objectiveVector || (getState().completionMode !== "draft" && currentObjective && !skipPreviewDrawing ? currentObjective : null);
    if (!target) {
      this.persistentSceneObjects.objectiveLines.forEach((line) => {
        line.visible = false;
      });
      return;
    }

    if (Math.hypot(target.x, target.y) < 1e-3) {
      this.persistentSceneObjects.objectiveLines.forEach((line) => {
        line.visible = false;
      });
      return;
    }
    const angle = Math.atan2(target.y, target.x);
    const baseZ = context.getPlanarOffset(OBJECTIVE_Z_OFFSET);
    const arrowColor =
      polytope?.kind === "unbounded" && hasPolytopeLines(polytope) && isObjectiveDirectionUnbounded(polytope.lines, [target.x, target.y])
        ? COLORS.polytopeHighlight
        : COLORS.objective;
    let objectiveLineCount = 0;
    this.updateThickLine(this.getOrCreateObjectiveLine(objectiveLineCount++), [0, 0, baseZ, target.x, target.y, baseZ], {
      color: arrowColor,
      width: ITERATE_LINE_THICKNESS,
      depthTest: is3D,
      depthWrite: is3D,
      renderOrder: RENDER_LAYERS.objective,
    });

    const headLength = helpers.getWorldSizeFromPixels(16);
    this.buildArrowHeadSegments({ x: target.x, y: target.y }, angle, headLength).forEach(([x1, y1, x2, y2]) => {
      this.updateThickLine(this.getOrCreateObjectiveLine(objectiveLineCount++), [x1, y1, baseZ, x2, y2, baseZ], {
        color: arrowColor,
        width: ITERATE_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.objective,
      });
    });
    for (let index = objectiveLineCount; index < this.persistentSceneObjects.objectiveLines.length; index++) {
      this.persistentSceneObjects.objectiveLines[index]!.visible = false;
    }
  }

  private renderTrace(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    const { helpers, groups, is3D } = context;

    const { traceEnabled, traceBuffer } = getState();
    if (!traceEnabled || !traceBuffer || traceBuffer.length === 0) {
      this.persistentSceneObjects.traceLines.forEach((line) => {
        line.visible = false;
      });
      if (this.persistentSceneObjects.tracePoints) {
        this.persistentSceneObjects.tracePoints.visible = false;
      }
      return;
    }

    const sampledPositions: number[] = [];
    traceBuffer.forEach((traceEntry, index) => {
      const positions = this.buildTraceLinePositions(traceEntry.path, traceEntry.objectiveVector, context, is3D);
      const line = this.getOrCreateTraceLine(index);
      this.updateThickLine(line, positions, {
        color: COLORS.trace,
        width: TRACE_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.traceLine,
        transparent: true,
        opacity: TRACE_LINE_OPACITY,
        replaceGeometry: true,
      });

      const pointPositions = this.buildTraceSamplePositions(positions);
      if (pointPositions.length) {
        sampledPositions.push(...pointPositions);
      }
    });
    for (let index = traceBuffer.length; index < this.persistentSceneObjects.traceLines.length; index++) {
      this.persistentSceneObjects.traceLines[index]!.visible = false;
    }

    if (sampledPositions.length) {
      const tracePoints = this.getOrCreatePointCloud(this.persistentSceneObjects.tracePoints, groups.trace, helpers, {
        color: COLORS.trace,
        size: TRACE_POINT_PIXEL_SIZE,
        renderOrder: RENDER_LAYERS.tracePoints,
      });
      this.updatePointCloudGeometry(tracePoints, sampledPositions);
      tracePoints.visible = true;
      this.persistentSceneObjects.tracePoints = tracePoints;
    } else if (this.persistentSceneObjects.tracePoints) {
      this.persistentSceneObjects.tracePoints.visible = false;
    }
  }

  private buildTraceLinePositions(
    path: number[][],
    objectiveVector: PointXY | null,
    context: ReturnType<ViewportManager["buildRenderContext"]>,
    is3D: boolean,
  ): number[] {
    if (path.length === 0) {
      return [];
    }
    const positions = new Array<number>(path.length * 3);
    for (let i = 0; i < path.length; i++) {
      const entry = path[i]!;
      const baseIndex = i * 3;
      positions[baseIndex] = entry[0]!;
      positions[baseIndex + 1] = entry[1]!;
      const scaledZ = context.scaleZValue(getDisplayedIterateZ(entry, objectiveVector));
      positions[baseIndex + 2] = is3D ? scaledZ : scaledZ + TRACE_Z_OFFSET;
    }
    return positions;
  }

  private buildTraceSamplePositions(linePositions: number[]): number[] {
    const pointCount = Math.floor(linePositions.length / 3);
    if (pointCount === 0) {
      return [];
    }

    const step = Math.max(1, Math.ceil(pointCount / MAX_TRACE_POINT_SPRITES));
    const samples: number[] = [];
    for (let index = 0; index < pointCount; index += step) {
      const baseIndex = index * 3;
      samples.push(linePositions[baseIndex], linePositions[baseIndex + 1], linePositions[baseIndex + 2]);
    }
    const lastBaseIndex = (pointCount - 1) * 3;
    if (
      samples.length === 0 ||
      samples[samples.length - 3] !== linePositions[lastBaseIndex] ||
      samples[samples.length - 2] !== linePositions[lastBaseIndex + 1] ||
      samples[samples.length - 1] !== linePositions[lastBaseIndex + 2]
    ) {
      samples.push(linePositions[lastBaseIndex], linePositions[lastBaseIndex + 1], linePositions[lastBaseIndex + 2]);
    }
    return samples;
  }

  private createPointCloud(
    positions: ArrayLike<number>,
    helpers: ReturnType<ViewportManager["buildRenderContext"]>["helpers"],
    options: {
      color: number;
      size: number;
      renderOrder: number;
      colors?: ArrayLike<number>;
      shape?: "circle" | "square";
    },
  ) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(Array.from(positions), 3));
    if (options.colors) {
      geometry.setAttribute("color", new Float32BufferAttribute(Array.from(options.colors), 3));
    }
    const material = helpers.getPointMaterial({
      color: options.color,
      size: options.size,
      sizeAttenuation: false,
      depthWrite: false,
      depthTest: false,
      transparent: false,
        opacity: 1,
        alphaTest: 0.2,
        vertexColors: Boolean(options.colors),
        shape: options.shape,
      });
    const pointMesh = new Points(geometry, material);
    pointMesh.renderOrder = options.renderOrder;
    return pointMesh;
  }

  private renderIterate(context: ReturnType<ViewportManager["buildRenderContext"]>) {
    const { helpers, groups } = context;

    const { iteratePath, highlightIteratePathIndex, iteratePhases, iterateRestartIndices, iterateObjectiveVector } = getState();
    if (!iteratePath || iteratePath.length === 0) {
      if (this.persistentSceneObjects.iterateLine) this.persistentSceneObjects.iterateLine.visible = false;
      this.persistentSceneObjects.iteratePhaseLines.forEach((line) => {
        line.visible = false;
      });
      if (this.persistentSceneObjects.iteratePoints) this.persistentSceneObjects.iteratePoints.visible = false;
      if (this.persistentSceneObjects.iterateRestartPoints) this.persistentSceneObjects.iterateRestartPoints.visible = false;
      if (this.persistentSceneObjects.iterateHighlight) this.persistentSceneObjects.iterateHighlight.visible = false;
      if (this.persistentSceneObjects.iterateStar) this.persistentSceneObjects.iterateStar.visible = false;
      return;
    }

    const positions = new Float32Array(iteratePath.length * 3);
    const colors = new Float32Array(iteratePath.length * 3);
    const hasPhases = iteratePhases.length === iteratePath.length && iteratePhases.length > 0;
    for (let i = 0; i < iteratePath.length; i++) {
      const entry = iteratePath[i];
      const z = this.getBlendedRenderZ(
        this.getDisplayedZValue(entry[0], entry[1], entry[2], iterateObjectiveVector),
        ITERATE_Z_OFFSET,
        context,
      );
      positions[i * 3] = entry[0];
      positions[i * 3 + 1] = entry[1];
      positions[i * 3 + 2] = z;
      const colorValue = hasPhases ? PHASE_COLORS[iteratePhases[i]! % PHASE_COLORS.length] : COLORS.iteratePath;
      const color = new Color(colorValue);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    if (hasPhases) {
      if (this.persistentSceneObjects.iterateLine) this.persistentSceneObjects.iterateLine.visible = false;
      let segmentStart = 0;
      let segmentPhase = iteratePhases[0]!;
      let segmentCount = 0;
      for (let i = 1; i < iteratePath.length; i++) {
        const currentPhase = iteratePhases[i]!;
        const previousPhase = iteratePhases[i - 1]!;
        if (currentPhase !== previousPhase) {
          const segmentPositions: number[] = [];
          for (let j = segmentStart; j <= i; j++) {
            segmentPositions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
          }
          if (segmentPositions.length >= 6) {
            const iterateLine = this.getOrCreateIteratePhaseLine(segmentCount++);
            this.updateThickLine(iterateLine, segmentPositions, {
              color: PHASE_COLORS[segmentPhase % PHASE_COLORS.length],
              width: ITERATE_LINE_THICKNESS,
              depthTest: false,
              depthWrite: false,
              renderOrder: RENDER_LAYERS.iterateLine,
              replaceGeometry: true,
            });
          }
          segmentStart = i - 1;
          segmentPhase = currentPhase;
        }
      }
      if (segmentStart < iteratePath.length) {
        const segmentPositions: number[] = [];
        for (let j = segmentStart; j < iteratePath.length; j++) {
          segmentPositions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
        }
        if (segmentPositions.length >= 6) {
          const iterateLine = this.getOrCreateIteratePhaseLine(segmentCount++);
          this.updateThickLine(iterateLine, segmentPositions, {
            color: PHASE_COLORS[segmentPhase % PHASE_COLORS.length],
            width: ITERATE_LINE_THICKNESS,
            depthTest: false,
            depthWrite: false,
            renderOrder: RENDER_LAYERS.iterateLine,
            replaceGeometry: true,
          });
        }
      }
      for (let index = segmentCount; index < this.persistentSceneObjects.iteratePhaseLines.length; index++) {
        this.persistentSceneObjects.iteratePhaseLines[index]!.visible = false;
      }
    } else {
      this.persistentSceneObjects.iteratePhaseLines.forEach((line) => {
        line.visible = false;
      });
      const iterateLine =
        this.persistentSceneObjects.iterateLine ??
        this.createThickLine(Array.from(positions), {
          color: COLORS.iteratePath,
          width: ITERATE_LINE_THICKNESS,
          depthTest: false,
          depthWrite: false,
        });
      if (!this.persistentSceneObjects.iterateLine) {
        groups.iterate.add(iterateLine);
        this.persistentSceneObjects.iterateLine = iterateLine;
      }
      this.updateThickLine(iterateLine, Array.from(positions), {
        color: COLORS.iteratePath,
        width: ITERATE_LINE_THICKNESS,
        depthTest: false,
        depthWrite: false,
        renderOrder: RENDER_LAYERS.iterateLine,
        replaceGeometry: true,
      });
      const iteratePoints = this.getOrCreatePointCloud(this.persistentSceneObjects.iteratePoints, groups.iterate, helpers, {
        color: COLORS.iteratePath,
        size: ITERATE_POINT_PIXEL_SIZE,
        renderOrder: RENDER_LAYERS.iteratePoints,
      });
      this.updatePointCloudGeometry(iteratePoints, positions);
      iteratePoints.visible = true;
      this.persistentSceneObjects.iteratePoints = iteratePoints;
    }

    if (hasPhases) {
      const iteratePoints = this.getOrCreatePointCloud(this.persistentSceneObjects.iteratePoints, groups.iterate, helpers, {
        color: 0xffffff,
        size: ITERATE_POINT_PIXEL_SIZE,
        renderOrder: RENDER_LAYERS.iteratePoints,
        colors,
      });
      this.updatePointCloudGeometry(iteratePoints, positions, colors);
      iteratePoints.visible = true;
      this.persistentSceneObjects.iteratePoints = iteratePoints;
    }

    const visibleRestartIndices = iterateRestartIndices.filter((index) => index >= 0 && index < iteratePath.length);
    if (visibleRestartIndices.length > 0) {
      const restartPositions = new Float32Array(visibleRestartIndices.length * 3);
      const restartColors = hasPhases ? new Float32Array(visibleRestartIndices.length * 3) : undefined;
      for (let i = 0; i < visibleRestartIndices.length; i++) {
        const index = visibleRestartIndices[i]!;
        const baseIndex = index * 3;
        restartPositions[i * 3] = positions[baseIndex]!;
        restartPositions[i * 3 + 1] = positions[baseIndex + 1]!;
        restartPositions[i * 3 + 2] = positions[baseIndex + 2]!;
        if (restartColors) {
          restartColors[i * 3] = colors[baseIndex]!;
          restartColors[i * 3 + 1] = colors[baseIndex + 1]!;
          restartColors[i * 3 + 2] = colors[baseIndex + 2]!;
        }
      }
      const iterateRestartPoints = this.getOrCreatePointCloud(this.persistentSceneObjects.iterateRestartPoints, groups.iterate, helpers, {
        color: COLORS.iteratePath,
        size: ITERATE_POINT_PIXEL_SIZE * 1.4,
        renderOrder: RENDER_LAYERS.iterateRestartPoints,
        colors: restartColors,
        shape: "square",
      });
      this.updatePointCloudGeometry(iterateRestartPoints, restartPositions, restartColors);
      iterateRestartPoints.visible = true;
      this.persistentSceneObjects.iterateRestartPoints = iterateRestartPoints;
    } else if (this.persistentSceneObjects.iterateRestartPoints) {
      this.persistentSceneObjects.iterateRestartPoints.visible = false;
    }

    if (highlightIteratePathIndex !== null && highlightIteratePathIndex < iteratePath.length) {
      const highlightPos = this.getBlendedPointPosition(
        iteratePath[highlightIteratePathIndex],
        ITERATE_Z_OFFSET,
        context,
        iterateObjectiveVector,
      );
      const highlightSize = helpers.getWorldSizeFromPixels(ITERATE_POINT_PIXEL_SIZE * 1.3, highlightPos);
      const highlightSprite =
        this.persistentSceneObjects.iterateHighlight ?? this.createCircleSprite(highlightPos, COLORS.iterateHighlight, highlightSize);
      if (!this.persistentSceneObjects.iterateHighlight) {
        groups.iterate.add(highlightSprite);
        this.persistentSceneObjects.iterateHighlight = highlightSprite;
      }
      highlightSprite.position.copy(highlightPos);
      highlightSprite.scale.set(highlightSize, highlightSize, highlightSize);
      highlightSprite.renderOrder = RENDER_LAYERS.iterateHighlight;
      highlightSprite.visible = true;
    } else if (this.persistentSceneObjects.iterateHighlight) {
      this.persistentSceneObjects.iterateHighlight.visible = false;
    }

    const lastPos = this.getBlendedPointPosition(
      iteratePath[iteratePath.length - 1],
      ITERATE_Z_OFFSET,
      context,
      iterateObjectiveVector,
    );
    const starSprite = this.persistentSceneObjects.iterateStar ?? this.createStarSprite(lastPos, COLORS.iterateHighlight);
    if (!this.persistentSceneObjects.iterateStar) {
      groups.overlay.add(starSprite);
      this.persistentSceneObjects.iterateStar = starSprite;
    }
    starSprite.position.copy(lastPos);
    starSprite.renderOrder = RENDER_LAYERS.iterateStar;
    starSprite.visible = true;
  }

  private updateCamera() {
    const state = getState();
    const transitioning = state.isTransitioning3D;
    const is3D = this.is3DState();
    if (!is3D) {
      this.deactivateOrbitControls();
      this.cameras.active = this.cameras.ortho;
      const unitsPerPixel = this.getUnitsPerPixel();
      const halfWidth = (window.innerWidth * unitsPerPixel) / 2;
      const halfHeight = (window.innerHeight * unitsPerPixel) / 2;
      const target = this.getViewportTarget();
      const frame = {
        left: -halfWidth,
        right: halfWidth,
        top: halfHeight,
        bottom: -halfHeight,
        position: new Vector3(target.x, target.y, 10),
        target,
      };

      this.cameras.ortho.left = frame.left;
      this.cameras.ortho.right = frame.right;
      this.cameras.ortho.top = frame.top;
      this.cameras.ortho.bottom = frame.bottom;
      this.cameras.ortho.position.copy(frame.position);
      this.cameras.ortho.lookAt(frame.target);
      this.cameras.ortho.updateProjectionMatrix();

      this.controls.ortho.enabled = !state.is3DMode && !state.isTransitioning3D && !this.controlState.orthographicSuspended;
      this.syncOrthoTarget(frame.target);
      return;
    }

    this.controls.ortho.enabled = false;
    this.cameras.active = this.cameras.perspective;
    this.cameras.perspective.aspect = window.innerWidth / window.innerHeight;
    this.cameras.perspective.clearViewOffset();
    this.cameras.perspective.updateProjectionMatrix();

    if (transitioning) {
      this.deactivateOrbitControls();
      const distanceOverride = state.isTransitioning3D && state.transitionDirection === "to2d" ? this.controlState.currentPerspectiveDistance : undefined;
      this.applyPerspectivePose(state.viewAngle, distanceOverride, this.getCurrentTransitionTarget());
      return;
    }

    if (!this.controlState.orbitActive) {
      this.activateOrbitControls();
    }
  }

  private handleOrthoControlsChange = () => {
    const { is3DMode, isTransitioning3D } = getState();
    if (this.controlState.suppressOrthoChange) return;
    if (is3DMode || isTransitioning3D) return;
    this.beginViewportNavigation();
    this.navigationFrameCallback?.();

    const zoomValue = this.cameras.ortho.zoom;
    const didZoom = Number.isFinite(zoomValue) && zoomValue !== 1;
    if (Number.isFinite(zoomValue) && zoomValue !== 1) {
      this.viewState.scaleFactor = this.clampScaleFactor(this.viewState.scaleFactor * zoomValue);
      this.cameras.ortho.zoom = 1;
      this.cameras.ortho.updateProjectionMatrix();
    }

    this.syncOffsetFromTarget(this.controls.ortho.target.x, this.controls.ortho.target.y);
    const nextGridKey = this.getOrthoGridKey();
    const needsGridUpdate = didZoom || nextGridKey !== this.lastOrthoGridKey;
    this.lastOrthoGridKey = nextGridKey;
    this.invalidateScene({
      grid: needsGridUpdate,
      polytope: false,
      constraints: false,
      objective: didZoom,
      trace: false,
      iterate: false,
    });
    this.draw();
    this.scheduleViewportNavigationEnd();
  };

  private handleOrbitControlsChange = () => {
    if (!this.controlState.orbitActive) {
      return;
    }
    this.beginViewportNavigation();
    this.navigationFrameCallback?.();
    const previousDistance = this.controlState.currentPerspectiveDistance;
    if (this.controlState.lastOrbitTarget.distanceToSquared(this.controls.orbit.target) >= 1e-9) {
      this.controlState.lastOrbitTarget.copy(this.controls.orbit.target);
    }
    const distance = this.cameras.perspective.position.distanceTo(this.controls.orbit.target);
    this.controlState.currentPerspectiveDistance = Number.isFinite(distance) ? distance : this.controlState.currentPerspectiveDistance;
    this.invalidateScene({
      grid: false,
      polytope: false,
      constraints: false,
      objective: Math.abs(this.controlState.currentPerspectiveDistance - previousDistance) > 1e-6,
      trace: false,
      iterate: false,
    });
    this.draw();
    this.scheduleViewportNavigationEnd();
  };

  setViewState(scale: number, offsetX: number, offsetY: number) {
    this.viewState.scaleFactor = this.clampScaleFactor(scale);
    this.viewState.offset.x = offsetX;
    this.viewState.offset.y = offsetY;
    this.syncOrthoTarget(this.getViewportTarget(), true);
    this.invalidateScene({ grid: true, polytope: false, constraints: false, objective: true, trace: false, iterate: false });
    this.draw();
  }

  zoomToFit(bounds: { minX: number; maxX: number; minY: number; maxY: number }, padding = 50, zBounds?: { minZ: number; maxZ: number }) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width <= 0 || height <= 0) return;

    if (this.is3DState()) {
      const scaledZBounds = zBounds
        ? {
            minZ: this.scaleZValue(zBounds.minZ),
            maxZ: this.scaleZValue(zBounds.maxZ),
          }
        : undefined;
      const target = new Vector3(
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        scaledZBounds ? (scaledZBounds.minZ + scaledZBounds.maxZ) / 2 : 0,
      );
      const viewAngle = this.getProjectionViewAngle();
      const distance = scaledZBounds
        ? this.getPerspectiveDistanceToFitBox(
            {
              minX: bounds.minX,
              maxX: bounds.maxX,
              minY: bounds.minY,
              maxY: bounds.maxY,
              minZ: scaledZBounds.minZ,
              maxZ: scaledZBounds.maxZ,
            },
            target,
            viewAngle,
            padding,
          )
        : this.getPerspectiveDistanceToFitBounds(bounds, padding);
      this.viewState.scaleFactor = this.getScaleFactorFromDistance(distance);
      this.syncOffsetFromTarget(target.x, target.y);
      this.syncOrthoTarget(target, true);

      if (getState().is3DMode && !this.controlState.orbitActive) {
        this.activateOrbitControls();
      }
      if (this.controlState.orbitActive) {
        this.controls.orbit.target.copy(target);
        this.controlState.lastOrbitTarget.copy(target);
        this.applyPerspectivePose(viewAngle, distance, target);
        this.controls.orbit.update();
      }

      this.invalidateScene({ grid: true, polytope: false, constraints: false, objective: true, trace: false, iterate: false });
      this.draw();
      return;
    }

    const availWidth = Math.max(100, window.innerWidth - this.sidebarWidth - 2 * padding);
    const availHeight = Math.max(100, window.innerHeight - 2 * padding);
    const scaleX = availWidth / (width * this.viewState.gridSpacing);
    const scaleY = availHeight / (height * this.viewState.gridSpacing);
    this.setViewState(
      Math.min(scaleX, scaleY),
      -(bounds.minX + bounds.maxX) / 2,
      -(bounds.minY + bounds.maxY) / 2,
    );
  }

  resetView() {
    if (this.is3DState()) {
      const target = new Vector3(0, 0, 0);
      const scaleFactor = 1;
      const distance = this.getPerspectiveDistance(1 / (this.viewState.gridSpacing * scaleFactor));
      this.viewState.scaleFactor = scaleFactor;
      this.viewState.offset.x = 0;
      this.viewState.offset.y = 0;
      this.syncOrthoTarget(target, true);

      if (getState().is3DMode && !this.controlState.orbitActive) {
        this.activateOrbitControls();
      }
      if (this.controlState.orbitActive) {
        this.controls.orbit.target.copy(target);
        this.controlState.lastOrbitTarget.copy(target);
        this.applyPerspectivePose(DEFAULT_VIEW_ANGLE, distance, target);
        this.controls.orbit.update();
      }

      this.invalidateScene({ grid: true, polytope: false, constraints: false, objective: true, trace: false, iterate: false });
      this.draw();
      return;
    }

    this.setViewState(1, 0, 0);
  }

  setControlsBlocked(blocked: boolean) {
    this.controlState.orthographicSuspended = blocked;
    const state = getState();
    this.controls.ortho.enabled = !blocked && !state.is3DMode && !state.isTransitioning3D;
    if (this.controlState.orbitActive && !this.controlState.orbitTemporarilyDisabled && blocked) {
      this.controls.orbit.enabled = false;
      this.controlState.orbitTemporarilyDisabled = true;
    } else if (this.controlState.orbitActive && this.controlState.orbitTemporarilyDisabled && !blocked) {
      this.controls.orbit.enabled = true;
      this.controlState.orbitTemporarilyDisabled = false;
    }
  }

  set2DPanEnabled(enabled: boolean) {
    const state = getState();
    this.controls.ortho.enablePan = enabled && !state.is3DMode && !state.isTransitioning3D && !this.controlState.orthographicSuspended;
  }

  toLogicalCoords(x: number, y: number): PointXY {
    const is3D = this.is3DState();
    if (is3D) {
      const projectionState = getState();
      this.updateInteractionPlane(projectionState.objectiveVector, projectionState.zScale, is3D);
      const projectedPoint = this.projectScreenToInteractionPlane(x, y);
      if (projectedPoint) {
        return this.snapPoint(this.clamp3DInteractionPoint(projectedPoint));
      }

      const planeCoords = this.toPlaneVector(x, y);
      const angles = this.getProjectionViewAngle();
      return this.snapPoint(
        this.clamp3DInteractionPoint(
          this.inverseProject2DPoint({ x: planeCoords.x, y: planeCoords.y }, angles),
        ),
      );
    }

    const planeCoords = this.toPlaneVector(x, y);
    return this.snapPoint({ x: planeCoords.x, y: planeCoords.y });
  }

  private clamp3DInteractionPoint(point: PointXY): PointXY {
    const state = getState();
    if (!(state.editorInteraction.kind !== "idle" && (state.is3DMode || state.isTransitioning3D))) {
      return point;
    }

    const unitsPerPixel = this.getUnitsPerPixel();
    const center = this.getViewportTarget();
    const viewSpan = Math.max(window.innerWidth, window.innerHeight) * unitsPerPixel;
    const viewBound = Math.max(60, viewSpan * VIEW_DRAG_BOUND_MULTIPLIER);
    const slopeScaler = Math.max(state.zScale, 0.001);
    const slopeBound = (MAX_3D_PLANE_SLOPE * 100) / slopeScaler;
    const bound = Math.min(MAX_3D_DRAG_BOUND, Math.min(viewBound, slopeBound));
    if (!Number.isFinite(bound) || bound <= 0) {
      return point;
    }

    return {
      x: Math.max(center.x - bound, Math.min(center.x + bound, point.x)),
      y: Math.max(center.y - bound, Math.min(center.y + bound, point.y)),
    };
  }

  toCanvasCoords(x: number, y: number, z?: number) {
    return this.projectWorldPosition(this.getWorldPosition(x, y, z));
  }

  getObjectiveScreenPosition(target: PointXY) {
    return this.projectWorldPosition(this.getObjectiveWorldPosition(target));
  }

  private activateOrbitControls() {
    const pose = this.applyPerspectivePose(this.getProjectionViewAngle());
    this.controls.orbit.target.copy(pose.target);
    this.controlState.lastOrbitTarget.copy(pose.target);
    this.controls.orbit.enabled = true;
    this.controlState.orbitActive = true;
    this.controls.orbit.enableRotate = true;
    this.controls.orbit.enablePan = true;
    this.controls.orbit.mouseButtons.LEFT = MOUSE.PAN;
    this.controls.orbit.mouseButtons.RIGHT = MOUSE.ROTATE;
    this.controls.orbit.mouseButtons.MIDDLE = MOUSE.DOLLY;
    this.controls.orbit.maxDistance = this.getMaxPerspectiveDistance();
    this.controls.orbit.update();
  }

  private deactivateOrbitControls() {
    if (!this.controlState.orbitActive) {
      return;
    }
    this.controlState.lastOrbitTarget.copy(this.controls.orbit.target);
    this.controls.orbit.enabled = false;
    this.controlState.orbitActive = false;
    this.captureOrbitViewAngle();
  }

  start3DTransition(targetMode: boolean) {
    const { isTransitioning3D, viewAngle } = getState();
    if (isTransitioning3D) return;
    this.beginViewportNavigation();

    const transitionDuration = targetMode ? 400 : 500;
    const startAngles = targetMode ? { x: 0, y: 0, z: 0 } : { ...viewAngle };
    const endAngles = targetMode ? { ...DEFAULT_VIEW_ANGLE } : { x: 0, y: 0, z: 0 };
    this.initializeTransitionTargets(targetMode);

    setState({
      isTransitioning3D: true,
      transitionStartTime: performance.now(),
      transition3DStartAngles: startAngles,
      transition3DEndAngles: endAngles,
      transitionDirection: targetMode ? "to3d" : "to2d",
      transitionProgress: 0,
      is3DMode: targetMode,
    }, { viewportDirty: this.getTransitionDirtyFlags() });

    const animate3DTransition = () => {
      const currentTime = performance.now();
      const snapshot = getState();
      const elapsed = currentTime - snapshot.transitionStartTime;
      const progress = Math.min(elapsed / transitionDuration, 1);
      const easedProgress = this.easeInOutCubic(progress);

      mutate((draft) => {
        draft.viewAngle.x = this.lerpAngle(draft.transition3DStartAngles.x, draft.transition3DEndAngles.x, easedProgress);
        draft.viewAngle.y = this.lerpAngle(draft.transition3DStartAngles.y, draft.transition3DEndAngles.y, easedProgress);
        draft.viewAngle.z = this.lerpAngle(draft.transition3DStartAngles.z, draft.transition3DEndAngles.z, easedProgress);
        draft.transitionProgress = easedProgress;
      }, { viewportDirty: this.getTransitionDirtyFlags() });

      if (!targetMode) {
        this.align2DStateToCurrentTransitionView();
      }

      if (progress < 1) {
        this.draw();
        requestAnimationFrame(animate3DTransition);
        return;
      }
      mutate((draft) => {
        draft.viewAngle.x = targetMode ? DEFAULT_VIEW_ANGLE.x : 0;
        draft.viewAngle.y = targetMode ? DEFAULT_VIEW_ANGLE.y : 0;
        draft.viewAngle.z = targetMode ? DEFAULT_VIEW_ANGLE.z : 0;
        draft.transitionProgress = 1;
      }, { viewportDirty: this.getTransitionDirtyFlags() });

      if (!targetMode) {
        this.align2DStateToCurrentTransitionView();
      }

      this.draw();

      requestAnimationFrame(() => this.complete3DTransition(targetMode));
    };

    animate3DTransition();
  }

  private getDynamicPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1;
    return Math.min(2, deviceRatio);
  }

  private syncRendererPixelRatio(width?: number, height?: number) {
    const resolvedWidth = width ?? window.innerWidth;
    const resolvedHeight = height ?? window.innerHeight;
    const ratio = this.getDynamicPixelRatio();
    if (ratio === this.renderResources.currentPixelRatio) {
      return;
    }

    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(resolvedWidth, resolvedHeight, false);
    this.renderResources.currentPixelRatio = ratio;
  }

  private clearGroup(group: Group) {
    while (group.children.length > 0) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      child.traverse((node) => {
        const geometryHolder = node as typeof node & { geometry?: { dispose?: () => void } };
        geometryHolder.geometry?.dispose?.();

        const materialHolder = node as typeof node & { material?: Material | Material[] };
        const material = materialHolder.material;
        if (Array.isArray(material)) {
          for (const entry of material) {
            if (!this.renderResources.cachedMaterials.has(entry)) {
              entry.dispose();
            }
          }
          return;
        }

        if (material && !this.renderResources.cachedMaterials.has(material)) {
          material.dispose();
        }
      });
    }
  }

}
