import type { PointXY, PointXYZ, VecNs } from "../solvers/utils/blas";
import type { PolytopeRepresentation } from "../solvers/utils/polytope";
import { MAX_TRACE_POINT_SPRITES } from "../ui/rendering/constants";
import type { DrawingPhaseSnapshot } from "./drawing";
import { computeDrawingSnapshot } from "./drawing";
import type { HistoryEntry } from "./history";

export type SolverMode = "central" | "ipm" | "simplex" | "pdhg";
type InputMode = "visual" | "manual";

interface TraceLineData {
  positions: number[];
  sampledIndices: number[];
}

interface TraceEntry {
  lineData: TraceLineData;
  angle: number;
}

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

  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveHidden: boolean;

  solverMode: SolverMode;
  iteratePath: VecNs;
  iteratePathComputed: boolean;
  highlightIteratePathIndex: number | null;
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
  zScale: number;
  isTransitioning3D: boolean;
  transitionStartTime: number;
  transitionDuration: number;
  transition3DStartAngles: PointXYZ;
  transition3DEndAngles: PointXYZ;
  transitionDirection: "to3d" | "to2d" | null;
  transitionProgress: number;

  traceEnabled: boolean;
  totalRotationAngle: number;
  traceBuffer: TraceEntry[];
  maxTraceCount: number;

  ipmAlphaMax: number;
  ipmMaxIterations: number;
  pdhgEta: number;
  pdhgTau: number;
  pdhgMaxIterations: number;
  pdhgIneqMode: boolean;
  centralPathSteps: number;
  objectiveAngleStep: number;
  objectiveRotationSpeed: number;

  inputMode: InputMode;
  tourActive: boolean;
  snapshot: DrawingPhaseSnapshot;
};

const initialState: State = {
  vertices: [],
  currentMouse: null,
  polytopeComplete: false,
  interiorPoint: null,
  polytope: null,

  objectiveVector: null,
  currentObjective: null,
  objectiveHidden: false,

  solverMode: "central",
  iteratePath: [],
  iteratePathComputed: false,
  highlightIteratePathIndex: null,
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
  zScale: DEFAULT_Z_SCALE,
  isTransitioning3D: false,
  transitionStartTime: 0,
  transitionDuration: DEFAULT_TRANSITION_DURATION,
  transition3DStartAngles: { x: 0, y: 0, z: 0 },
  transition3DEndAngles: { ...DEFAULT_VIEW_ANGLE },
  transitionDirection: null,
  transitionProgress: 0,

  traceEnabled: false,
  totalRotationAngle: 0,
  traceBuffer: [],
  maxTraceCount: 0,

  ipmAlphaMax: 0.1,
  ipmMaxIterations: 1000,
  pdhgEta: 0.25,
  pdhgTau: 0.25,
  pdhgMaxIterations: 1000,
  pdhgIneqMode: true,
  centralPathSteps: 75,
  objectiveAngleStep: 0.1,
  objectiveRotationSpeed: 1,

  inputMode: "visual",
  tourActive: false,
  snapshot: {} as DrawingPhaseSnapshot,
};

initialState.snapshot = computeDrawingSnapshot(initialState);

let state: State = initialState;
const listeners = new Set<(snapshot: State) => void>();

function refreshSnapshot() {
  state.snapshot = computeDrawingSnapshot(state);
}

function notifyListeners() {
  listeners.forEach((listener) => listener(state));
}

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>): void {
  Object.assign(state, patch);
  refreshSnapshot();
  notifyListeners();
}

export function mutate(mutator: (draft: State) => void): void {
  mutator(state);
  refreshSnapshot();
  notifyListeners();
}

export function subscribe(listener: (snapshot: State) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prepareAnimationInterval(): void {
  const { animationIntervalId } = getState();
  if (animationIntervalId !== null)
    (clearInterval(animationIntervalId),
      setState({ animationIntervalId: null }));
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

  const lineData = buildTraceLineData(iteratesArray);
  mutate((draft) => {
    draft.traceBuffer.push({
      lineData,
      angle: draft.totalRotationAngle,
    });
    while (draft.traceBuffer.length > draft.maxTraceCount)
      draft.traceBuffer.shift();
  });
}

function buildTraceLineData(path: number[][]): TraceLineData {
  const { objectiveVector } = getState();
  const computeObjective = (x: number, y: number) =>
    objectiveVector ? objectiveVector.x * x + objectiveVector.y * y : 0;
  const positions: number[] = [];
  const sampledIndices: number[] = [];

  for (let i = 0; i < path.length; i++) {
    const entry = path[i];
    const zValue =
      entry[2] !== undefined ? entry[2] : computeObjective(entry[0], entry[1]);
    positions.push(entry[0], entry[1], zValue);
  }

  if (path.length > 0) {
    const step = Math.max(1, Math.ceil(path.length / MAX_TRACE_POINT_SPRITES));
    for (let i = 0; i < path.length; i += step) {
      sampledIndices.push(i);
    }
    const lastIdx = path.length - 1;
    if (sampledIndices[sampledIndices.length - 1] !== lastIdx) {
      sampledIndices.push(lastIdx);
    }
  }

  return { positions, sampledIndices };
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
  setState({ traceBuffer: [], totalRotationAngle: 0 });
}

export function handleStepSizeChange(): void {
  if (!getState().traceEnabled) return;

  const objectiveAngleStepSlider = document.getElementById(
    "objectiveAngleStepSlider"
  ) as HTMLInputElement;
  const angleStep = parseFloat(objectiveAngleStepSlider?.value || "0.1");
  const newMaxTracesPerRotation = Math.ceil((2 * Math.PI) / angleStep);

  mutate((draft) => {
    draft.maxTraceCount = newMaxTracesPerRotation;

    while (draft.traceBuffer.length > draft.maxTraceCount) {
      draft.traceBuffer.shift();
    }
  });
}
