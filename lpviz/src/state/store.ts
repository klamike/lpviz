import type { Line, PointXY, PointXYZ, VecNs } from "../solvers/utils/blas";
import type { PolytopeRepresentation } from "../solvers/utils/polytopeTypes";

export const MAX_TRACE_POINT_SPRITES = 1200;
export const DEFAULT_VIEW_ANGLE: PointXYZ = { x: -1.15, y: 0.4, z: 0 };
export const DEFAULT_Z_SCALE = 0.1;

export type SolverMode = "central" | "ipm" | "simplex" | "pdhg";
export type CompletionMode = "draft" | "closed" | "open";
export type CompletedInteraction = "none" | "dragged-point" | "dragged-objective" | "dragged-constraint";
export type DrawingPhase =
  | "empty"
  | "sketching_polytope"
  | "awaiting_objective"
  | "objective_preview"
  | "ready_for_solvers";
export type ConstraintDragOperation =
  | { kind: "closed-line"; lineIndex: number; lines: Line[] }
  | { kind: "open-vertices"; vertexIndices: [number, number] };
export type HistoryEntry = {
  vertices: PointXY[];
  objectiveVector: PointXY | null;
  completionMode: CompletionMode;
};
export type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "constraint"; operation: ConstraintDragOperation; start: PointXY; normal: PointXY }
  | { kind: "objective" };
export type EditorInteractionState =
  | { kind: "idle" }
  | { kind: "pending-drag"; target: Extract<DragTarget, { kind: "point" | "constraint" }>; dragStartPos: { x: number; y: number } }
  | { kind: "dragging"; target: DragTarget };

interface TraceEntry {
  path: number[][];
  objectiveVector: PointXY | null;
}

export type ViewportDirtyFlags = Partial<{
  grid: boolean;
  polytope: boolean;
  constraints: boolean;
  objective: boolean;
  trace: boolean;
  iterate: boolean;
}>;

export type StateChangeMeta = {
  viewportDirty?: ViewportDirtyFlags;
};

export type State = {
  vertices: PointXY[];
  currentMouse: PointXY | null;
  completionMode: CompletionMode;
  interiorPoint: PointXY | null;
  polytope: PolytopeRepresentation | null;

  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveHidden: boolean;

  solverMode: SolverMode;
  iteratePath: VecNs;
  iteratePhases: number[];
  highlightIteratePathIndex: number | null;
  rotateObjectiveMode: boolean;
  animationIntervalId: number | null;
  originalIteratePath: VecNs;
  originalIteratePhases: number[];
  iterateRestartIndices: number[];
  originalIterateRestartIndices: number[];
  iterateObjectiveVector: PointXY | null;
  originalIterateObjectiveVector: PointXY | null;

  snapToGrid: boolean;
  highlightIndex: number | null;
  editorInteraction: EditorInteractionState;
  lastCompletedInteraction: CompletedInteraction;

  historyStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  is3DMode: boolean;
  zAxisOffsetOnly: boolean;
  viewAngle: PointXYZ;
  zScale: number;
  isTransitioning3D: boolean;
  transitionStartTime: number;
  transition3DStartAngles: PointXYZ;
  transition3DEndAngles: PointXYZ;
  transitionDirection: "to3d" | "to2d" | null;
  transitionProgress: number;

  traceEnabled: boolean;
  traceBuffer: TraceEntry[];
  maxTraceCount: number;
  tourActive: boolean;
  isNavigatingViewport: boolean;
};

const initialState: State = {
  vertices: [],
  currentMouse: null,
  completionMode: "draft",
  interiorPoint: null,
  polytope: null,

  objectiveVector: null,
  currentObjective: null,
  objectiveHidden: false,

  solverMode: "central",
  iteratePath: [],
  iteratePhases: [],
  highlightIteratePathIndex: null,
  rotateObjectiveMode: false,
  animationIntervalId: null,
  originalIteratePath: [],
  originalIteratePhases: [],
  iterateRestartIndices: [],
  originalIterateRestartIndices: [],
  iterateObjectiveVector: null,
  originalIterateObjectiveVector: null,

  snapToGrid: false,
  highlightIndex: null,
  editorInteraction: { kind: "idle" },
  lastCompletedInteraction: "none",

  historyStack: [],
  redoStack: [],

  is3DMode: false,
  zAxisOffsetOnly: false,
  viewAngle: { ...DEFAULT_VIEW_ANGLE },
  zScale: DEFAULT_Z_SCALE,
  isTransitioning3D: false,
  transitionStartTime: 0,
  transition3DStartAngles: { x: 0, y: 0, z: 0 },
  transition3DEndAngles: { ...DEFAULT_VIEW_ANGLE },
  transitionDirection: null,
  transitionProgress: 0,

  traceEnabled: false,
  traceBuffer: [],
  maxTraceCount: 0,
  tourActive: false,
  isNavigatingViewport: false,
};

let state: State = initialState;
const listeners = new Set<(snapshot: State, meta?: StateChangeMeta) => void>();

export function computeDrawingPhase(state: State): DrawingPhase {
  const verticesCount = state.vertices.length;
  const regionFinished = state.completionMode !== "draft";
  const hasObjective = state.objectiveVector !== null;

  if (verticesCount === 0) {
    return "empty";
  }
  if (!regionFinished) {
    return "sketching_polytope";
  }
  if (!hasObjective) {
    return state.currentObjective !== null ? "objective_preview" : "awaiting_objective";
  }
  return "ready_for_solvers";
}

function notifyListeners(meta?: StateChangeMeta) {
  listeners.forEach((listener) => listener(state, meta));
}

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State>, meta?: StateChangeMeta): void {
  Object.assign(state, patch);
  notifyListeners(meta);
}

export function mutate(mutator: (draft: State) => void, meta?: StateChangeMeta): void {
  mutator(state);
  notifyListeners(meta);
}

export function subscribe(listener: (snapshot: State, meta?: StateChangeMeta) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prepareAnimationInterval(): void {
  const { animationIntervalId } = getState();
  if (animationIntervalId !== null) (clearInterval(animationIntervalId), setState({ animationIntervalId: null }, { viewportDirty: {} }));
}

export function updateIteratePaths(iteratesArray: number[][], phasesArray?: number[], restartIndicesArray?: number[]): void {
  mutate((draft) => {
    const objectiveSnapshot = snapshotObjectiveVector(draft.objectiveVector);
    assignIterateState(draft, iteratesArray, phasesArray, restartIndicesArray, objectiveSnapshot);
  }, { viewportDirty: { iterate: true } });
}

export function clearIterateState(): void {
  mutate((draft) => {
    assignIterateState(draft, [], undefined, undefined, null);
    draft.highlightIteratePathIndex = null;
  }, { viewportDirty: { iterate: true } });
}

export function addTraceToBuffer(iteratesArray: number[][]): void {
  const { traceEnabled, objectiveVector } = getState();
  if (!traceEnabled || iteratesArray.length === 0) return;

  mutate((draft) => {
    appendTraceEntry(draft, iteratesArray, snapshotObjectiveVector(objectiveVector));
  }, { viewportDirty: { trace: true } });
}

export function getDisplayedIterateZ(entry: number[], objectiveOverride?: PointXY | null): number {
  const { objectiveVector: currentObjective, zAxisOffsetOnly } = getState();
  const objectiveVector = objectiveOverride === undefined ? currentObjective : objectiveOverride;
  const objectiveValue = objectiveVector ? objectiveVector.x * entry[0] + objectiveVector.y * entry[1] : 0;
  const totalValue = entry[2] !== undefined ? entry[2] : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

export function updateIteratePathsWithTrace(iteratesArray: number[][], phasesArray?: number[], restartIndicesArray?: number[]): void {
  mutate((draft) => {
    const objectiveSnapshot = snapshotObjectiveVector(draft.objectiveVector);
    assignIterateState(draft, iteratesArray, phasesArray, restartIndicesArray, objectiveSnapshot);

    if (draft.traceEnabled && iteratesArray.length > 0) {
      appendTraceEntry(draft, iteratesArray, objectiveSnapshot);
    }
  }, { viewportDirty: { iterate: true, trace: getState().traceEnabled && iteratesArray.length > 0 } });
}

function snapshotObjectiveVector(objectiveVector: PointXY | null) {
  return objectiveVector ? { ...objectiveVector } : null;
}

function copyIteratePath(iteratesArray: number[][]) {
  return iteratesArray.map((entry) => [...entry]);
}

function copyIteratePhases(phasesArray?: number[]) {
  return phasesArray ? [...phasesArray] : [];
}

function copyRestartIndices(restartIndicesArray?: number[]) {
  return restartIndicesArray ? [...restartIndicesArray] : [];
}

function trimTraceBuffer(draft: State) {
  while (draft.traceBuffer.length > draft.maxTraceCount) {
    draft.traceBuffer.shift();
  }
}

function appendTraceEntry(draft: State, iteratesArray: number[][], objectiveSnapshot: PointXY | null) {
  draft.traceBuffer.push({
    path: copyIteratePath(iteratesArray),
    objectiveVector: snapshotObjectiveVector(objectiveSnapshot),
  });
  trimTraceBuffer(draft);
}

function assignIterateState(
  draft: State,
  iteratesArray: number[][],
  phasesArray: number[] | undefined,
  restartIndicesArray: number[] | undefined,
  objectiveSnapshot: PointXY | null,
) {
  draft.originalIteratePath = copyIteratePath(iteratesArray);
  draft.iteratePath = iteratesArray;
  draft.iteratePhases = phasesArray || [];
  draft.originalIteratePhases = copyIteratePhases(phasesArray);
  draft.iterateRestartIndices = restartIndicesArray || [];
  draft.originalIterateRestartIndices = copyRestartIndices(restartIndicesArray);
  draft.iterateObjectiveVector = objectiveSnapshot;
  draft.originalIterateObjectiveVector = snapshotObjectiveVector(objectiveSnapshot);
}

export function resetTraceState(): void {
  if (!getState().traceEnabled) return;
  setState({ traceBuffer: [] }, { viewportDirty: { trace: true } });
}

export function setTraceCapacity(maxTraceCount: number): void {
  mutate((draft) => {
    draft.maxTraceCount = maxTraceCount;

    while (draft.traceBuffer.length > draft.maxTraceCount) {
      draft.traceBuffer.shift();
    }
  }, { viewportDirty: { trace: true } });
}
