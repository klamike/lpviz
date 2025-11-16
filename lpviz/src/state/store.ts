import type { PointXY, PointXYZ, VecNs, Lines } from "../solvers/utils/blas";
import type { PolytopeRepresentation } from "../solvers/utils/polytope";
import type { HistoryEntry } from "./history";
import type { InputMode, ObjectiveDirection, SolverMode, TraceEntry } from "./types";

export type { SolverMode, InputMode, ObjectiveDirection, TraceEntry } from "./types";

const DEFAULT_VIEW_ANGLE: PointXYZ = { x: -1.15, y: 0.4, z: 0 };
const DEFAULT_TRANSITION_DURATION = 500;
const DEFAULT_FOCAL_DISTANCE = 1000;
const DEFAULT_Z_SCALE = 0.1;

export type State = {
  vertices: PointXY[];
  currentMouse: PointXY | null;
  polytopeComplete: boolean;
  interiorPoint: PointXY | null;
  polytope: PolytopeRepresentation | null;
  analyticCenter: PointXY | null;

  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveDirection: ObjectiveDirection;
  objectiveHidden: boolean;

  solverMode: SolverMode;
  iteratePath: VecNs;
  iteratePathComputed: boolean;
  highlightIteratePathIndex: number | null;
  isIteratePathComputing: boolean;
  rotateObjectiveMode: boolean;
  animationIntervalId: number | null;
  originalIteratePath: VecNs;

  snapToGrid: boolean;
  highlightIndex: number | null;
  draggingPointIndex: number | null;
  potentialDragPointIndex: number | null;
  draggingPoint: boolean;
  potentialDragPoint: boolean;
  dragStartPos: { x: number; y: number } | null;
  draggingObjective: boolean;
  draggingConstraintIndex: number | null;
  potentialDragConstraint: boolean;
  draggingConstraint: boolean;
  constraintDragStart: PointXY | null;
  constraintDragNormal: PointXY | null;
  isPanning: boolean;
  lastPan: { x: number; y: number };
  wasPanning: boolean;
  wasDraggingPoint: boolean;
  wasDraggingObjective: boolean;
  wasDraggingConstraint: boolean;

  historyStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  is3DMode: boolean;
  viewAngle: PointXYZ;
  focalDistance: number;
  isRotatingCamera: boolean;
  lastRotationMouse: { x: number; y: number };
  zScale: number;
  isTransitioning3D: boolean;
  transitionStartTime: number;
  transitionDuration: number;
  transition3DStartAngles: PointXYZ;
  transition3DEndAngles: PointXYZ;

  traceEnabled: boolean;
  currentTracePath: VecNs;
  totalRotationAngle: number;
  rotationCount: number;
  traceBuffer: TraceEntry[];
  maxTraceCount: number;
  lastDrawnTraceIndex: number;

  inputMode: InputMode;
  manualConstraints: string[];
  manualObjective: string | null;
  parsedConstraints: Lines;
};

const initialState: State = {
  vertices: [],
  currentMouse: null,
  polytopeComplete: false,
  interiorPoint: null,
  polytope: null,
  analyticCenter: null,

  objectiveVector: null,
  currentObjective: null,
  objectiveDirection: "max",
  objectiveHidden: false,

  solverMode: "central",
  iteratePath: [],
  iteratePathComputed: false,
  highlightIteratePathIndex: null,
  isIteratePathComputing: false,
  rotateObjectiveMode: false,
  animationIntervalId: null,
  originalIteratePath: [],

  snapToGrid: false,
  highlightIndex: null,
  draggingPointIndex: null,
  potentialDragPointIndex: null,
  draggingPoint: false,
  potentialDragPoint: false,
  dragStartPos: null,
  draggingObjective: false,
  draggingConstraintIndex: null,
  potentialDragConstraint: false,
  draggingConstraint: false,
  constraintDragStart: null,
  constraintDragNormal: null,
  isPanning: false,
  lastPan: { x: 0, y: 0 },
  wasPanning: false,
  wasDraggingPoint: false,
  wasDraggingObjective: false,
  wasDraggingConstraint: false,

  historyStack: [],
  redoStack: [],

  is3DMode: false,
  viewAngle: { ...DEFAULT_VIEW_ANGLE },
  focalDistance: DEFAULT_FOCAL_DISTANCE,
  isRotatingCamera: false,
  lastRotationMouse: { x: 0, y: 0 },
  zScale: DEFAULT_Z_SCALE,
  isTransitioning3D: false,
  transitionStartTime: 0,
  transitionDuration: DEFAULT_TRANSITION_DURATION,
  transition3DStartAngles: { x: 0, y: 0, z: 0 },
  transition3DEndAngles: { ...DEFAULT_VIEW_ANGLE },

  traceEnabled: false,
  currentTracePath: [],
  totalRotationAngle: 0,
  rotationCount: 0,
  traceBuffer: [],
  maxTraceCount: 0,
  lastDrawnTraceIndex: -1,

  inputMode: "visual",
  manualConstraints: [],
  manualObjective: null,
  parsedConstraints: [],
};

let state: State = initialState;
const listeners = new Set<(snapshot: State) => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener(state));
}

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  Object.assign(state, patch);
  notifyListeners();
}

export function setFields(updates: Partial<State>): void {
  Object.assign(state, updates);
  notifyListeners();
}

export function mutate(mutator: (draft: State) => void): void {
  mutator(state);
  notifyListeners();
}

export function subscribe(listener: (snapshot: State) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prepareAnimationInterval(): void {
  const { animationIntervalId } = getState();
  if (animationIntervalId !== null) (clearInterval(animationIntervalId), setState({ animationIntervalId: null }));
}

export function updateIteratePaths(iteratesArray: number[][]): void {
  mutate((draft) => {
    draft.originalIteratePath = [...iteratesArray];
    draft.iteratePath = iteratesArray;
  });
}

export function addTraceToBuffer(iteratesArray: number[][]): void {
  const { traceEnabled } = getState();
  if (!traceEnabled || iteratesArray.length === 0) return;

  mutate((draft) => {
    draft.traceBuffer.push({
      path: [...iteratesArray],
      angle: draft.totalRotationAngle,
    });
    while (draft.traceBuffer.length > draft.maxTraceCount) draft.traceBuffer.shift();
    if (draft.totalRotationAngle >= 2 * Math.PI) {
      draft.rotationCount = Math.floor(draft.totalRotationAngle / (2 * Math.PI));
    }
  });
}

export function updateIteratePathsWithTrace(iteratesArray: number[][]): void {
  updateIteratePaths(iteratesArray);
  const snapshot = getState();
  if (snapshot.traceEnabled && iteratesArray.length > 0) {
    addTraceToBuffer(iteratesArray);
  }
}

export function resetTraceState(): void {
  if (!getState().traceEnabled) return;
  setFields({ traceBuffer: [], totalRotationAngle: 0, rotationCount: 0 });
}

export function handleStepSizeChange(): void {
  if (!getState().traceEnabled) return;

  const objectiveAngleStepSlider = document.getElementById("objectiveAngleStepSlider") as HTMLInputElement;
  const angleStep = parseFloat(objectiveAngleStepSlider?.value || "0.1");
  const newMaxTracesPerRotation = Math.ceil((2 * Math.PI) / angleStep);

  mutate((draft) => {
    draft.maxTraceCount = newMaxTracesPerRotation;

    while (draft.traceBuffer.length > draft.maxTraceCount) {
      draft.traceBuffer.shift();
    }
  });
}
