import { createRoot } from "solid-js";
import { createMutable } from "solid-js/store";
import { Lines, PointXY, PointXYZ, VecNs, Vertices } from "../types/arrays";
import { HistoryEntry } from "./history";

export interface TraceEntry {
  path: number[][];
  angle: number;
}

export type SolverMode = "central" | "ipm" | "simplex" | "pdhg";
export type InputMode = "visual" | "manual";
export type ObjectiveDirection = "max" | "min";

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
  historyStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  highlightIteratePathIndex: number | null;
  isIteratePathComputing: boolean;
  rotateObjectiveMode: boolean;
  draggingPointIndex: number | null;
  potentialDragPointIndex: number | null;
  dragStartPos: { x: number; y: number } | null;
  draggingObjective: boolean;
  solverMode: SolverMode;
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
  inputMode: InputMode;
  manualConstraints: string[];
  manualObjective: string | null;
  objectiveDirection: ObjectiveDirection;
  parsedConstraints: Lines;
  uiButtons: Record<string, boolean>;
  solverSettingsVisible: Record<"ipm" | "pdhg" | "central", boolean>;
}

const DEFAULT_VIEW_ANGLE: PointXYZ = { x: -1.15, y: 0.4, z: 0 };
const DEFAULT_TRANSITION_DURATION = 500;
const DEFAULT_FOCAL_DISTANCE = 1000;
const DEFAULT_Z_SCALE = 0.1;

function createInitialState(): State {
  return {
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
    draggingPointIndex: null,
    potentialDragPointIndex: null,
    dragStartPos: null,
    draggingObjective: false,
    solverMode: "central" as SolverMode,
    animationIntervalId: null,
    originalIteratePath: [],
    isPanning: false,
    lastPan: { x: 0, y: 0 },
    wasPanning: false,
    wasDraggingPoint: false,
    wasDraggingObjective: false,
    is3DMode: false,
    viewAngle: { ...DEFAULT_VIEW_ANGLE },
    focalDistance: DEFAULT_FOCAL_DISTANCE,
    isRotatingCamera: false,
    lastRotationMouse: { x: 0, y: 0 },
    zScale: DEFAULT_Z_SCALE,
    traceEnabled: false,
    currentTracePath: [],
    totalRotationAngle: 0,
    rotationCount: 0,
    traceBuffer: [],
    maxTraceCount: 0,
    lastDrawnTraceIndex: -1,
    isTransitioning3D: false,
    transitionStartTime: 0,
    transitionDuration: DEFAULT_TRANSITION_DURATION,
    transition3DStartAngles: { x: 0, y: 0, z: 0 },
    transition3DEndAngles: { ...DEFAULT_VIEW_ANGLE },
    inputMode: "visual" as InputMode,
    manualConstraints: [],
    manualObjective: null,
    objectiveDirection: "max" as ObjectiveDirection,
    parsedConstraints: [],
    uiButtons: {
      iteratePathButton: false,
      ipmButton: false,
      simplexButton: false,
      pdhgButton: false,
      traceButton: false,
      animateButton: false,
      startRotateObjectiveButton: false,
      stopRotateObjectiveButton: false,
      zoomButton: true,
      unzoomButton: false,
    },
    solverSettingsVisible: {
      ipm: false,
      pdhg: false,
      central: true,
    },
  };
}

export const state = createRoot(() => createMutable<State>(createInitialState()));

export function resetState(): void {
  Object.assign(state, createInitialState());
}

export function prepareAnimationInterval(): void {
  if (state.animationIntervalId !== null) {
    clearInterval(state.animationIntervalId);
    state.animationIntervalId = null;
  }
}

export function updateIteratePaths(iteratesArray: number[][]): void {
  state.originalIteratePath = [...iteratesArray];
  state.iteratePath = iteratesArray;
}

export function addTraceToBuffer(iteratesArray: number[][]): void {
  if (!state.traceEnabled || iteratesArray.length === 0) return;

  state.traceBuffer.push({
    path: [...iteratesArray],
    angle: state.totalRotationAngle,
  });

  // Only trim traces if we exceed the buffer limit
  while (state.traceBuffer.length > state.maxTraceCount) {
    state.traceBuffer.shift();
  }

  if (state.totalRotationAngle >= 2 * Math.PI) {
    state.rotationCount = Math.floor(state.totalRotationAngle / (2 * Math.PI));
  }
}

export function updateIteratePathsWithTrace(iteratesArray: number[][]): void {
  updateIteratePaths(iteratesArray);
  if (state.traceEnabled && iteratesArray.length > 0) {
    addTraceToBuffer(iteratesArray);
  }
}

export function resetTraceState(): void {
  if (state.traceEnabled) {
    state.traceBuffer = [];
    state.totalRotationAngle = 0;
    state.rotationCount = 0;
  }
}

export function handleStepSizeChange(): void {
  if (!state.traceEnabled) return;

  const objectiveAngleStepSlider = document.getElementById(
    "objectiveAngleStepSlider",
  ) as HTMLInputElement;
  const angleStep = parseFloat(objectiveAngleStepSlider?.value || "0.1");
  const newMaxTracesPerRotation = Math.ceil((2 * Math.PI) / angleStep);

  // Update maxTraceCount to the new value
  state.maxTraceCount = newMaxTracesPerRotation;

  // If the new limit is smaller than current buffer, trim from the beginning (oldest traces)
  while (state.traceBuffer.length > state.maxTraceCount) {
    state.traceBuffer.shift();
  }
}
