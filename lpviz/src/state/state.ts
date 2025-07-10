import { PointXY, PointXYZ, VecM } from '../types/arrays';
import { Vertices, Lines, VecNs } from '../types/arrays';

export interface TraceEntry {
  path: number[][];
  angle: number;
}

export interface State {
  vertices: PointXY[];
  currentMouse: PointXY | null;
  polygonComplete: boolean;
  interiorPoint: PointXY | null;
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  computedVertices: Vertices;
  computedLines: Lines;
  snapToGrid: boolean;
  highlightIndex: number | null;
  analyticCenter: PointXY | null;
  iteratePath: VecNs;
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
  barrierWeights: VecM;
  solverMode: string;
  animationIntervalId: number | null;
  originalIteratePath: VecNs;
  isPanning: boolean;
  lastPan: { x: number; y: number };
  wasPanning: boolean;
  wasDraggingPoint: boolean;
  wasDraggingObjective: boolean;
  is3DMode: boolean;
  viewAngle: PointXYZ;
  focalDistance: number;
  isRotatingCamera: boolean;
  lastRotationMouse: { x: number; y: number };
  zScale: number;
  traceEnabled: boolean;
  currentTracePath: VecNs;
  totalRotationAngle: number;
  rotationCount: number;
  traceBuffer: TraceEntry[];
  maxTraceCount: number;
  lastDrawnTraceIndex: number;
  isTransitioning3D: boolean;
  transitionStartTime: number;
  transitionDuration: number;
  transition3DStartAngles: PointXYZ;
  transition3DEndAngles: PointXYZ;
  inputMode: 'visual' | 'manual';
  manualConstraints: string[];
  manualObjective: string | null;
  objectiveDirection: 'max' | 'min';
  parsedConstraints: Lines;
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
