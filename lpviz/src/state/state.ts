import { createStore, type StoreApi } from 'zustand/vanilla';
import { produce, type Draft } from 'immer';

import { createGeometrySlice, type GeometrySlice } from './slices/geometrySlice';
import { createObjectiveSlice, type ObjectiveSlice } from './slices/objectiveSlice';
import { createSolverSlice, type SolverSlice } from './slices/solverSlice';
import { createInteractionSlice, type InteractionSlice } from './slices/interactionSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createViewSlice, type ViewSlice } from './slices/viewSlice';
import { createTraceSlice, type TraceSlice } from './slices/traceSlice';
import { createInputSlice, type InputSlice } from './slices/inputSlice';
export type { SolverMode, InputMode, ObjectiveDirection } from './types';
export type { TraceEntry } from './slices/traceSlice';

export type State = GeometrySlice &
  ObjectiveSlice &
  SolverSlice &
  InteractionSlice &
  HistorySlice &
  ViewSlice &
  TraceSlice &
  InputSlice;

function createInitialState(): State {
  return {
    ...createGeometrySlice(),
    ...createObjectiveSlice(),
    ...createSolverSlice(),
    ...createInteractionSlice(),
    ...createHistorySlice(),
    ...createViewSlice(),
    ...createTraceSlice(),
    ...createInputSlice(),
  };
}

const appStateStore: StoreApi<State> = createStore<State>(() => createInitialState());

export const getState = (): State => appStateStore.getState();

export const setState = (partial: Partial<State>): void => {
  appStateStore.setState(partial);
};

export const mutateState = (recipe: (draft: Draft<State>) => void): void => {
  appStateStore.setState((current) =>
    produce(current, (draft) => {
      recipe(draft);
    })
  );
};

export const subscribeToState: StoreApi<State>['subscribe'] = appStateStore.subscribe;

type SliceHelpers<Slice> = {
  get: () => Slice;
  set: (partial: Partial<Slice>) => void;
  mutate: (recipe: (draft: Draft<Slice>) => void) => void;
};

const createSliceHelpers = <Slice>(selector: (state: State) => Slice): SliceHelpers<Slice> => ({
  get: () => selector(appStateStore.getState()),
  set: (partial) => {
    appStateStore.setState(partial);
  },
  mutate: (recipe) => {
    mutateState((draft) => {
      recipe(draft as Draft<Slice>);
    });
  },
});

const geometrySelector = (state: State): GeometrySlice => state;
const objectiveSelector = (state: State): ObjectiveSlice => state;
const solverSelector = (state: State): SolverSlice => state;
const interactionSelector = (state: State): InteractionSlice => state;
const historySelector = (state: State): HistorySlice => state;
const viewSelector = (state: State): ViewSlice => state;
const traceSelector = (state: State): TraceSlice => state;
const inputSelector = (state: State): InputSlice => state;

export const {
  get: getGeometryState,
  set: setGeometryState,
  mutate: mutateGeometryState,
} = createSliceHelpers<GeometrySlice>(geometrySelector);

export const {
  get: getObjectiveState,
  set: setObjectiveState,
  mutate: mutateObjectiveState,
} = createSliceHelpers<ObjectiveSlice>(objectiveSelector);

export const {
  get: getSolverState,
  set: setSolverState,
  mutate: mutateSolverState,
} = createSliceHelpers<SolverSlice>(solverSelector);

export const {
  get: getInteractionState,
  set: setInteractionState,
  mutate: mutateInteractionState,
} = createSliceHelpers<InteractionSlice>(interactionSelector);

export const {
  get: getHistoryState,
  set: setHistoryState,
  mutate: mutateHistoryState,
} = createSliceHelpers<HistorySlice>(historySelector);

export const {
  get: getViewState,
  set: setViewState,
  mutate: mutateViewState,
} = createSliceHelpers<ViewSlice>(viewSelector);

export const {
  get: getTraceState,
  set: setTraceState,
  mutate: mutateTraceState,
} = createSliceHelpers<TraceSlice>(traceSelector);

export const {
  get: getInputState,
  set: setInputState,
  mutate: mutateInputState,
} = createSliceHelpers<InputSlice>(inputSelector);

export function prepareAnimationInterval(): void {
  const { animationIntervalId } = getState();
  if (animationIntervalId !== null) {
    clearInterval(animationIntervalId);
    setState({ animationIntervalId: null });
  }
}

export function updateIteratePaths(iteratesArray: number[][]): void {
  mutateState((draft) => {
    draft.originalIteratePath = [...iteratesArray];
    draft.iteratePath = iteratesArray;
  });
}

export function addTraceToBuffer(iteratesArray: number[][]): void {
  const snapshot = getState();
  if (!snapshot.traceEnabled || iteratesArray.length === 0) return;
  
  mutateState((draft) => {
    draft.traceBuffer.push({
      path: [...iteratesArray],
      angle: draft.totalRotationAngle
    });
    
    while (draft.traceBuffer.length > draft.maxTraceCount) {
      draft.traceBuffer.shift();
    }
    
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
  if (!getState().traceEnabled) {
    return;
  }
  
  mutateState((draft) => {
    draft.traceBuffer = [];
    draft.totalRotationAngle = 0;
    draft.rotationCount = 0;
  });
}

export function handleStepSizeChange(): void {
  if (!getState().traceEnabled) return;
  
  const objectiveAngleStepSlider = document.getElementById("objectiveAngleStepSlider") as HTMLInputElement;
  const angleStep = parseFloat(objectiveAngleStepSlider?.value || "0.1");
  const newMaxTracesPerRotation = Math.ceil((2 * Math.PI) / angleStep);
  
  mutateState((draft) => {
    draft.maxTraceCount = newMaxTracesPerRotation;
    
    while (draft.traceBuffer.length > draft.maxTraceCount) {
      draft.traceBuffer.shift();
    }
  });
}
