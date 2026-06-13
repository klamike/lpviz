import type { ResultTextBlock } from "@/features/solver/types";

// Result rows materialize (format) lazily on access so a 100k-iteration solve
// doesn't pay for formatting rows that are never scrolled into view. Plain
// arrays satisfy this shape, which keeps empty-state assignments simple.
export type VirtualRowBlocks = {
  length: number;
  at(index: number): ResultTextBlock | undefined;
};
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

export interface TraceEntry {
  // Flat, contiguous iterate data: element `i` is at [i*stride .. i*stride+stride).
  // stride 3 = [x, y, bakedTotalZ] (packed pdhg/ipm), stride 2 = [x, y]
  // (simplex / central path, z renders flat). Storing one array per chunk
  // instead of one Float64Array view per iterate keeps the trace ring at a few
  // dozen live objects rather than millions, which is what a major GC must mark.
  points: Float64Array;
  count: number;
  stride: number;
  objectiveVector: PointXY | null;
}

// Notified with the trace entries dropped from the ring on each append /
// capacity change / reset. The solver layer uses this to hand a packed entry's
// (now GPU-resident) iterations buffer back to the worker pool; the store
// itself stays unaware of buffer recycling. Entries here are already removed
// from state, so their backing buffers have no remaining reader.
type TraceEvictionListener = (evicted: TraceEntry[]) => void;
let traceEvictionListener: TraceEvictionListener | null = null;
export function setTraceEvictionListener(
  fn: TraceEvictionListener | null,
): void {
  traceEvictionListener = fn;
}
function notifyTraceEvicted(evicted: TraceEntry[]): void {
  if (evicted.length > 0) traceEvictionListener?.(evicted);
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
  resultVirtualRows: VirtualRowBlocks;
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

type Listener = () => void;

type StateValues<K extends keyof State> = { [P in K]: State[P] };
type MetaListener = (meta?: StateChangeMeta) => void;

class LpvizStore {
  private values: State;
  private listeners = new Map<keyof State, Listener[]>();
  private metaListeners: MetaListener[] = [];
  private pending: Listener[] = [];

  constructor(initialValues: State) {
    this.values = initialValues;
  }

  getState(): State {
    return this.values;
  }

  getSnapshot(): State {
    return { ...this.values };
  }

  patch(partial: Partial<State>, meta?: StateChangeMeta): void {
    const changedKeys: (keyof State)[] = [];
    let nextValues: State | null = null;

    for (const rawKey in partial) {
      const key = rawKey as keyof State;
      const value = partial[key];
      if (Object.is(this.values[key], value)) continue;
      nextValues ??= { ...this.values };
      (nextValues as Record<keyof State, State[keyof State]>)[key] =
        value as State[keyof State];
      changedKeys.push(key);
    }

    const hasMeta = meta !== undefined;
    if (!nextValues && !hasMeta) return;

    if (nextValues) {
      this.values = nextValues;
      for (const key of changedKeys) {
        const ls = this.listeners.get(key);
        if (!ls) continue;
        for (let i = 0; i < ls.length; i++) ls[i]!();
      }
      this.flush();
    }

    if (hasMeta) {
      const listeners = this.metaListeners.slice();
      for (let i = 0; i < listeners.length; i++) listeners[i]!(meta);
    }
  }

  on<K extends keyof State>(
    keys: readonly K[],
    fn: (values: StateValues<K>) => void,
    signal: AbortSignal,
  ): void {
    if (signal.aborted) return;

    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const snap = {} as StateValues<K>;
      for (const key of keys) snap[key] = this.values[key];
      fn(snap);
    };
    const handler = () => {
      if (scheduled) return;
      scheduled = true;
      this.pending.push(flush);
    };

    for (const key of keys) {
      const ls = this.listeners.get(key);
      if (ls) ls.push(handler);
      else this.listeners.set(key, [handler]);
    }

    signal.addEventListener(
      "abort",
      () => {
        for (const key of keys) {
          const ls = this.listeners.get(key);
          if (!ls) continue;
          const index = ls.indexOf(handler);
          if (index >= 0) ls.splice(index, 1);
          if (ls.length === 0) this.listeners.delete(key);
        }
      },
      { once: true },
    );
  }

  onMeta(fn: MetaListener, signal: AbortSignal): void {
    if (signal.aborted) return;
    this.metaListeners.push(fn);
    signal.addEventListener(
      "abort",
      () => {
        const index = this.metaListeners.indexOf(fn);
        if (index >= 0) this.metaListeners.splice(index, 1);
      },
      { once: true },
    );
  }

  private flush(): void {
    while (this.pending.length > 0) {
      const pending = this.pending;
      this.pending = [];
      for (let i = 0; i < pending.length; i++) pending[i]!();
    }
  }
}

const lpvizStore = new LpvizStore(initialState);

export function getState(): State {
  return lpvizStore.getState();
}

export function getSnapshot(): State {
  return lpvizStore.getSnapshot();
}

export function setState(patch: Partial<State>, meta?: StateChangeMeta): void {
  lpvizStore.patch(patch, meta);
}

export function on<K extends keyof State>(
  keys: readonly K[],
  fn: (values: StateValues<K>) => void,
  signal: AbortSignal,
): void {
  lpvizStore.on(keys, fn, signal);
}

export function onMeta(
  fn: (meta?: StateChangeMeta) => void,
  signal: AbortSignal,
): void {
  lpvizStore.onMeta(fn, signal);
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

// computeIterateZ for a flat trace chunk: the iterate lives at `points[base..]`
// with the given stride. Identical math to the per-view form above.
export function computeFlatTraceZ(
  points: Float64Array,
  base: number,
  stride: number,
  objectiveVector: PointXY | null,
): number {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * points[base]! + objectiveVector.y * points[base + 1]!
    : 0;
  const totalValue = stride >= 3 ? points[base + 2]! : objectiveValue;
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


const EMPTY_TRACE_POINTS = new Float64Array(0);

// Collapse a solve's per-iterate Float64Array views into one flat chunk. Packed
// pdhg/ipm results are already a contiguous stride-3 block in one transferred
// buffer, so that buffer is exposed as a single view with no copy (and is later
// handed back to the worker pool on eviction). Other solvers' iterates live in
// independent buffers and are flattened once here.
function buildTracePoints(iteratesArray: Float64Array[]): {
  points: Float64Array;
  count: number;
  stride: number;
} {
  const count = iteratesArray.length;
  if (count === 0) return { points: EMPTY_TRACE_POINTS, count: 0, stride: 3 };
  const first = iteratesArray[0]!;
  const stride = first.length >= 3 ? 3 : 2;
  const last = iteratesArray[count - 1]!;
  const F8 = Float64Array.BYTES_PER_ELEMENT;
  if (
    first.length === stride &&
    first.byteOffset === 0 &&
    first.buffer === last.buffer &&
    last.byteOffset === (count - 1) * stride * F8
  ) {
    return {
      points: new Float64Array(first.buffer, 0, count * stride),
      count,
      stride,
    };
  }
  const points = new Float64Array(count * stride);
  for (let i = 0; i < count; i++) {
    const it = iteratesArray[i]!;
    points[i * stride] = it[0] ?? 0;
    points[i * stride + 1] = it[1] ?? 0;
    if (stride >= 3) points[i * stride + 2] = it[2] ?? 0;
  }
  return { points, count, stride };
}

function appendedTraceBuffer(
  state: State,
  iteratesArray: Float64Array[],
  objectiveSnapshot: PointXY | null,
): TraceEntry[] {
  const built = buildTracePoints(iteratesArray);
  const entry: TraceEntry = {
    points: built.points,
    count: built.count,
    stride: built.stride,
    objectiveVector: snapshotObjectiveVector(objectiveSnapshot),
  };
  const raw = [...state.traceBuffer, entry];
  const overflow = raw.length - state.maxTraceCount;
  if (overflow > 0) {
    notifyTraceEvicted(raw.slice(0, overflow));
    return raw.slice(overflow);
  }
  return raw;
}

function buildIterateStatePatch(
  iteratesArray: Float64Array[],
  phasesArray: number[] | undefined,
  restartIndicesArray: number[] | undefined,
  objectiveSnapshot: PointXY | null,
): Partial<State> {
  // Path entries and phase/restart arrays are never mutated after creation
  // (replay re-references entries while growing a fresh iteratePath array),
  // so the "original" fields can share them instead of deep-copying — at
  // high maxit the copies cost milliseconds and megabytes per solve.
  return {
    originalIteratePath: iteratesArray,
    iteratePath: iteratesArray,
    iteratePhases: phasesArray ?? [],
    originalIteratePhases: phasesArray ?? [],
    iterateRestartIndices: restartIndicesArray ?? [],
    originalIterateRestartIndices: restartIndicesArray ?? [],
    iterateObjectiveVector: objectiveSnapshot,
    originalIterateObjectiveVector: snapshotObjectiveVector(objectiveSnapshot),
  };
}

export function resetTraceState(): void {
  const { traceBuffer } = getState();
  if (traceBuffer.length === 0) return;
  notifyTraceEvicted(traceBuffer);
  setState({ traceBuffer: [] }, { viewportDirty: { trace: true } });
}

export function setTraceCapacity(maxTraceCount: number): void {
  const { traceBuffer } = getState();
  const overflow = traceBuffer.length - maxTraceCount;
  if (overflow > 0) notifyTraceEvicted(traceBuffer.slice(0, overflow));
  setState(
    {
      maxTraceCount,
      traceBuffer: overflow > 0 ? traceBuffer.slice(overflow) : traceBuffer,
    },
    { viewportDirty: { trace: true } },
  );
}
