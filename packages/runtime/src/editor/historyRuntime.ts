import { getState, mutate, type HistoryEntry, type State } from "@lpviz/state";

export function createHistoryRuntime({ onRestore }: { onRestore: () => void }) {
  const captureEntry = (
    state: Pick<State, "vertices" | "objectiveVector" | "completionMode">,
  ): HistoryEntry => ({
    vertices: JSON.parse(JSON.stringify(state.vertices)),
    objectiveVector: state.objectiveVector
      ? { ...state.objectiveVector }
      : null,
    completionMode: state.completionMode,
  });

  const save = (
    snapshotSource: Pick<
      State,
      "vertices" | "objectiveVector" | "completionMode"
    > = getState(),
    options: { clearRedo?: boolean } = {},
  ) => {
    const snapshot = captureEntry(snapshotSource);
    mutate((draft) => {
      draft.historyStack.push(snapshot);
      if (options.clearRedo ?? true) {
        draft.redoStack = [];
      }
    });
  };

  const handleUndoRedo = (isRedo: boolean) => {
    const state = getState();
    if (
      isRedo ? state.redoStack.length === 0 : state.historyStack.length === 0
    ) {
      return;
    }

    if (isRedo) {
      save(getState(), { clearRedo: false });
    }

    const currentEntry = captureEntry(getState());
    let stateToRestore: HistoryEntry | null = null;
    mutate((draft) => {
      const sourceStack = isRedo ? draft.redoStack : draft.historyStack;
      const targetStack = isRedo ? draft.historyStack : draft.redoStack;
      if (sourceStack.length === 0) {
        return;
      }

      const popped = sourceStack.pop();
      if (!popped) {
        return;
      }
      stateToRestore = popped;

      if (!isRedo) {
        targetStack.push(currentEntry);
      }
    });

    if (!stateToRestore) {
      return;
    }

    mutate((draft) => {
      draft.vertices = stateToRestore!.vertices;
      draft.objectiveVector = stateToRestore!.objectiveVector;
      draft.completionMode = stateToRestore!.completionMode;
    });
    onRestore();
  };

  return {
    captureEntry,
    save,
    handleUndoRedo,
  };
}
