export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

export interface TraceEntry {
  path: number[][];
  angle: number;
}

export interface State {
  vertices: Vec2[];
  currentMouse: Vec2 | null;
  polygonComplete: boolean;
  interiorPoint: Vec2 | null;
  objectiveVector: Vec2 | null;
  currentObjective: Vec2 | null;
  computedVertices: number[][];
  computedLines: number[][];
  snapToGrid: boolean;
  highlightIndex: number | null;
  analyticCenter: number[] | null;
  iteratePath: number[][];
  iteratePathComputed: boolean;
  historyStack: any[];
  redoStack: any[];
  highlightIteratePathIndex: number | null;
  isIteratePathComputing: boolean;
  rotateObjectiveMode: boolean;
  barrierWeightsVisible: boolean;
  draggingPointIndex: number | null;
  potentialDragPointIndex: number | null;
  dragStartPos: { x: number; y: number } | null;
  draggingObjective: boolean;
  barrierWeights: number[];
  solverMode: string;
  animationIntervalId: number | null;
  originalIteratePath: number[][];
  isPanning: boolean;
  lastPan: { x: number; y: number };
  wasPanning: boolean;
  wasDraggingPoint: boolean;
  wasDraggingObjective: boolean;
  is3DMode: boolean;
  viewAngle: Vec3;
  focalDistance: number;
  isRotatingCamera: boolean;
  lastRotationMouse: { x: number; y: number };
  zScale: number;
  traceEnabled: boolean;
  currentTracePath: number[][];
  totalRotationAngle: number;
  rotationCount: number;
  traceBuffer: TraceEntry[];
  maxTraceCount: number;
  lastDrawnTraceIndex: number;
  isTransitioning3D: boolean;
  transitionStartTime: number;
  transitionDuration: number;
  transition3DStartAngles: Vec3;
  transition3DEndAngles: Vec3;
  inputMode: 'visual' | 'manual';
  manualConstraints: string[];
  manualObjective: string | null;
  objectiveDirection: 'max' | 'min';
  parsedConstraints: number[][];
}

export const state: State = {
  vertices: [],
  currentMouse: null,
  polygonComplete: false,
  interiorPoint: null,
  objectiveVector: null,
  currentObjective: null,
  computedVertices: [],
  computedLines: [],
  snapToGrid: false,
  highlightIndex: null,
  analyticCenter: null,
  iteratePath: [],
  iteratePathComputed: false,
  historyStack: [],
  redoStack: [],
  highlightIteratePathIndex: null,
  isIteratePathComputing: false,
  rotateObjectiveMode: false,
  barrierWeightsVisible: false,
  draggingPointIndex: null,
  potentialDragPointIndex: null,
  dragStartPos: null,
  draggingObjective: false,
  barrierWeights: [],
  solverMode: "central",
  animationIntervalId: null,
  originalIteratePath: [],
  isPanning: false,
  lastPan: { x: 0, y: 0 },
  wasPanning: false,
  wasDraggingPoint: false,
  wasDraggingObjective: false,
  is3DMode: false,
  viewAngle: { x: -1.15, y: 0.4, z: 0 },
  focalDistance: 1000,
  isRotatingCamera: false,
  lastRotationMouse: { x: 0, y: 0 },
  zScale: 0.1,
  traceEnabled: false,
  currentTracePath: [],
  totalRotationAngle: 0,
  rotationCount: 0,
  traceBuffer: [],
  maxTraceCount: 0,
  lastDrawnTraceIndex: -1,
  isTransitioning3D: false,
  transitionStartTime: 0,
  transitionDuration: 500,
  transition3DStartAngles: { x: 0, y: 0, z: 0 },
  transition3DEndAngles: { x: -1.15, y: 0.4, z: 0 },
  inputMode: 'visual',
  manualConstraints: [],
  manualObjective: null,
  objectiveDirection: 'max',
  parsedConstraints: []
};

export function resetState(): void {
  Object.assign(state, {
    vertices: [],
    currentMouse: null,
    polygonComplete: false,
    interiorPoint: null,
    objectiveVector: null,
    currentObjective: null,
    computedVertices: [],
    computedLines: [],
    snapToGrid: false,
    highlightIndex: null,
    analyticCenter: null,
    iteratePath: [],
    iteratePathComputed: false,
    historyStack: [],
    redoStack: [],
    highlightIteratePathIndex: null,
    isIteratePathComputing: false,
    rotateObjectiveMode: false,
    barrierWeightsVisible: false,
    draggingPointIndex: null,
    potentialDragPointIndex: null,
    dragStartPos: null,
    draggingObjective: false,
    barrierWeights: [],
    solverMode: "central",
    animationIntervalId: null,
    originalIteratePath: [],
    isPanning: false,
    lastPan: { x: 0, y: 0 },
    wasPanning: false,
    wasDraggingPoint: false,
    wasDraggingObjective: false,
    is3DMode: false,
    viewAngle: { x: -1.15, y: 0.4, z: 0 },
    focalDistance: 1000,
    isRotatingCamera: false,
    lastRotationMouse: { x: 0, y: 0 },
    zScale: 0.1,
    traceEnabled: false,
    currentTracePath: [],
    totalRotationAngle: 0,
    rotationCount: 0,
    traceBuffer: [],
    maxTraceCount: 0,
    lastDrawnTraceIndex: -1,
    isTransitioning3D: false,
    transitionStartTime: 0,
    transitionDuration: 500,
    transition3DStartAngles: { x: 0, y: 0, z: 0 },
    transition3DEndAngles: { x: -1.15, y: 0.4, z: 0 },
    inputMode: 'visual',
    manualConstraints: [],
    manualObjective: null,
    objectiveDirection: 'max',
    parsedConstraints: []
  });
}
