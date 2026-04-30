import type { ResultTextBlock } from "@/features/solver/types";
import type { Line, PointXY, PointXYZ, VecNs } from "@lpviz/math/types";
import type { PolytopeRepresentation } from "@lpviz/polytope/polytopeTypes";
import { DEFAULT_VIEW_ANGLE, DEFAULT_Z_SCALE } from "@lpviz/viewport/defaults";

export const MAX_TRACE_POINT_SPRITES = 1200;
export { DEFAULT_VIEW_ANGLE, DEFAULT_Z_SCALE };

export type SolverMode = "central" | "ipm" | "simplex" | "pdhg";
export type CompletionMode = "draft" | "closed" | "open";
type CompletedInteraction =
  | "none"
  | "dragged-point"
  | "dragged-objective"
  | "dragged-constraint";
export type DrawingPhase =
  | "empty"
  | "sketching_polytope"
  | "awaiting_objective"
  | "objective_preview"
  | "ready_for_solvers";
type ConstraintDragOperation =
  | { kind: "closed-line"; lineIndex: number; lines: Line[] }
  | { kind: "open-vertices"; vertexIndices: [number, number] };
export type HistoryEntry = {
  vertices: PointXY[];
  objectiveVector: PointXY | null;
  completionMode: CompletionMode;
};
export type DragViewAnchor3D = { x: number; y: number; z: number };

export type DragTarget =
  | { kind: "point"; index: number; viewAnchor3D?: DragViewAnchor3D }
  | {
      kind: "constraint";
      operation: ConstraintDragOperation;
      start: PointXY;
      normal: PointXY;
    }
  | { kind: "objective"; viewAnchor3D?: DragViewAnchor3D };
export type EditorInteractionState =
  | { kind: "idle" }
  | {
      kind: "pending-drag";
      target: Extract<DragTarget, { kind: "point" | "constraint" }>;
      dragStartPos: { x: number; y: number };
    }
  | { kind: "dragging"; target: DragTarget };

interface TraceEntry {
  path: Float64Array[];
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

type StateChangeMeta = {
  viewportDirty?: ViewportDirtyFlags;
};

export type SolverSettings = {
  alphaMax: number;
  correctorThreshold: number;
  maxitIPM: number;
  simplexDualMode: boolean;
  pdhgEta: number;
  pdhgTau: number;
  maxitPDHG: number;
  pdhgIneqMode: boolean;
  pdhgHalpernMode: boolean;
  pdhgColorByBasis: boolean;
  centralPathIter: number;
  objectiveAngleStep: number;
  objectiveRotationSpeed: number;
  replaySpeed: number;
};

const DEFAULT_SOLVER_SETTINGS: SolverSettings = {
  alphaMax: 0.1,
  correctorThreshold: 0.9,
  maxitIPM: 1000,
  simplexDualMode: false,
  pdhgEta: 0.25,
  pdhgTau: 0.25,
  maxitPDHG: 1000,
  pdhgIneqMode: true,
  pdhgHalpernMode: false,
  pdhgColorByBasis: false,
  centralPathIter: 75,
  objectiveAngleStep: 0.1,
  objectiveRotationSpeed: 1,
  replaySpeed: 10,
};

export type State = {
  vertices: PointXY[];
  completionMode: CompletionMode;
  interiorPoint: PointXY | null;
  polytope: PolytopeRepresentation | null;
  inequalitiesMessage: string | null;
  resultDisplayMode: "usage" | "blocks" | "virtual";
  resultBlocks: ResultTextBlock[] | null;
  resultVirtualHeader: string | null;
  resultVirtualFooter: string | null;
  resultVirtualShowEmpty: boolean;
  resultVirtualRows: ResultTextBlock[];
  resultMaxLineChars: number;

  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  objectiveHidden: boolean;

  solverMode: SolverMode;
  solverSettings: SolverSettings;
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
  isNavigatingViewport: boolean;
};

const initialState: State = {
  vertices: [],
  completionMode: "draft",
  interiorPoint: null,
  polytope: null,
  inequalitiesMessage: null,
  resultDisplayMode: "usage",
  resultBlocks: null,
  resultVirtualHeader: null,
  resultVirtualFooter: null,
  resultVirtualShowEmpty: false,
  resultVirtualRows: [],
  resultMaxLineChars: 0,

  objectiveVector: null,
  currentObjective: null,
  objectiveHidden: false,

  solverMode: "central",
  solverSettings: { ...DEFAULT_SOLVER_SETTINGS },
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
  isNavigatingViewport: false,
};

type StoreApi<T, Meta = unknown> = {
  getState: () => T;
  getInitialState: () => T;
  setState: (
    partial: Partial<T> | ((state: T) => T | Partial<T>),
    replace?: boolean,
    meta?: Meta,
  ) => void;
  subscribe: (listener: (state: T, meta?: Meta) => void) => () => void;
};

function createStore<T, Meta = unknown>(
  initializer: (
    set: StoreApi<T, Meta>["setState"],
    get: StoreApi<T, Meta>["getState"],
    api: StoreApi<T, Meta>,
  ) => T,
): StoreApi<T, Meta> {
  const listeners = new Set<(state: T, meta?: Meta) => void>();
  let state: T;

  const setState: StoreApi<T, Meta>["setState"] = (
    partial,
    replace = false,
    meta,
  ) => {
    const nextState =
      typeof partial === "function"
        ? (partial as (state: T) => T | Partial<T>)(state)
        : partial;

    const resolvedState =
      replace || typeof nextState !== "object" || nextState === null
        ? (nextState as T)
        : { ...state, ...nextState };

    if (!Object.is(resolvedState, state)) {
      state = resolvedState;
      listeners.forEach((listener) => listener(state, meta));
    }
  };

  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener: (state: T) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const api: StoreApi<T, Meta> = {
    setState,
    getState,
    getInitialState,
    subscribe,
  };
  const initialState = (state = initializer(setState, getState, api));

  return api;
}

const lpvizStore = createStore<State, StateChangeMeta>(() => initialState);

export function getState(): State {
  return lpvizStore.getState();
}

export function setState(patch: Partial<State>, _meta?: StateChangeMeta): void {
  lpvizStore.setState(patch, false, _meta);
}

export function subscribe(
  listener: (snapshot: State, meta?: StateChangeMeta) => void,
): () => void {
  return lpvizStore.subscribe(listener);
}

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
    return state.currentObjective !== null
      ? "objective_preview"
      : "awaiting_objective";
  }
  return "ready_for_solvers";
}

export function prepareAnimationInterval(): void {
  const { animationIntervalId } = getState();
  if (animationIntervalId !== null) {
    clearInterval(animationIntervalId);
    setState({ animationIntervalId: null });
  }
}

export function updateIteratePaths(
  iteratesArray: Float64Array[],
  phasesArray?: number[],
  restartIndicesArray?: number[],
): void {
  const { objectiveVector } = getState();
  setState(
    buildIterateStatePatch(
      iteratesArray,
      phasesArray,
      restartIndicesArray,
      snapshotObjectiveVector(objectiveVector),
    ),
    { viewportDirty: { iterate: true } },
  );
}

export function clearIterateState(): void {
  setState(
    {
      ...buildIterateStatePatch([], undefined, undefined, null),
      highlightIteratePathIndex: null,
    },
    { viewportDirty: { iterate: true } },
  );
}

export function addTraceToBuffer(iteratesArray: Float64Array[]): void {
  const state = getState();
  if (!state.traceEnabled || iteratesArray.length === 0) return;
  setState(
    {
      traceBuffer: appendedTraceBuffer(
        state,
        iteratesArray,
        snapshotObjectiveVector(state.objectiveVector),
      ),
    },
    { viewportDirty: { trace: true } },
  );
}

export function computeIterateZ(
  entry: Float64Array,
  objectiveVector: PointXY | null,
): number {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2]! : objectiveValue;
  return totalValue - objectiveValue;
}

export function getDisplayedIterateZ(
  entry: Float64Array,
  objectiveOverride?: PointXY | null,
): number {
  const { objectiveVector: currentObjective } = getState();
  const objectiveVector =
    objectiveOverride === undefined ? currentObjective : objectiveOverride;
  return computeIterateZ(entry, objectiveVector);
}

export function updateIteratePathsWithTrace(
  iteratesArray: Float64Array[],
  phasesArray?: number[],
  restartIndicesArray?: number[],
): void {
  const state = getState();
  const objectiveSnapshot = snapshotObjectiveVector(state.objectiveVector);
  const patch: Partial<State> = buildIterateStatePatch(
    iteratesArray,
    phasesArray,
    restartIndicesArray,
    objectiveSnapshot,
  );
  if (state.traceEnabled && iteratesArray.length > 0) {
    patch.traceBuffer = appendedTraceBuffer(
      state,
      iteratesArray,
      objectiveSnapshot,
    );
  }
  setState(patch, {
    viewportDirty: {
      iterate: true,
      ...(state.traceEnabled && iteratesArray.length > 0
        ? { trace: true }
        : {}),
    },
  });
}

function snapshotObjectiveVector(objectiveVector: PointXY | null) {
  return objectiveVector ? { ...objectiveVector } : null;
}

function copyIteratePath(iteratesArray: Float64Array[]) {
  return iteratesArray.map((entry) => entry.slice());
}

function copyIteratePhases(phasesArray?: number[]) {
  return phasesArray ? [...phasesArray] : [];
}

function copyRestartIndices(restartIndicesArray?: number[]) {
  return restartIndicesArray ? [...restartIndicesArray] : [];
}

function appendedTraceBuffer(
  state: State,
  iteratesArray: Float64Array[],
  objectiveSnapshot: PointXY | null,
): TraceEntry[] {
  const entry: TraceEntry = {
    path: copyIteratePath(iteratesArray),
    objectiveVector: snapshotObjectiveVector(objectiveSnapshot),
  };
  const raw = [...state.traceBuffer, entry];
  return raw.length > state.maxTraceCount
    ? raw.slice(raw.length - state.maxTraceCount)
    : raw;
}

function buildIterateStatePatch(
  iteratesArray: Float64Array[],
  phasesArray: number[] | undefined,
  restartIndicesArray: number[] | undefined,
  objectiveSnapshot: PointXY | null,
): Partial<State> {
  return {
    originalIteratePath: copyIteratePath(iteratesArray),
    iteratePath: iteratesArray,
    iteratePhases: phasesArray ?? [],
    originalIteratePhases: copyIteratePhases(phasesArray),
    iterateRestartIndices: restartIndicesArray ?? [],
    originalIterateRestartIndices: copyRestartIndices(restartIndicesArray),
    iterateObjectiveVector: objectiveSnapshot,
    originalIterateObjectiveVector: snapshotObjectiveVector(objectiveSnapshot),
  };
}

export function resetTraceState(): void {
  if (getState().traceBuffer.length === 0) return;
  setState({ traceBuffer: [] }, { viewportDirty: { trace: true } });
}

export function setTraceCapacity(maxTraceCount: number): void {
  const { traceBuffer } = getState();
  setState(
    {
      maxTraceCount,
      traceBuffer:
        traceBuffer.length > maxTraceCount
          ? traceBuffer.slice(traceBuffer.length - maxTraceCount)
          : traceBuffer,
    },
    { viewportDirty: { trace: true } },
  );
}
