import { useCallback, useMemo, useRef } from "react";
import { getState, mutate, type HistoryEntry, type State } from "@/state";

export type HistorySnapshotSource = Pick<
  State,
  "vertices" | "objectiveVector" | "completionMode"
>;

export type SaveHistory = (
  snapshotSource?: HistorySnapshotSource,
  options?: { clearRedo?: boolean },
) => void;

export type HandleUndoRedo = (isRedo: boolean) => void;

export type HistoryActions = {
  save: SaveHistory;
  handleUndoRedo: HandleUndoRedo;
  saveRef: React.MutableRefObject<SaveHistory>;
  handleUndoRedoRef: React.MutableRefObject<HandleUndoRedo>;
};

export function useHistory({
  onRestore,
}: {
  onRestore: () => void;
}): HistoryActions {
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const captureEntry = useCallback(
    (state: HistorySnapshotSource): HistoryEntry => ({
      vertices: JSON.parse(JSON.stringify(state.vertices)),
      objectiveVector: state.objectiveVector
        ? { ...state.objectiveVector }
        : null,
      completionMode: state.completionMode,
    }),
    [],
  );

  const save = useCallback<SaveHistory>(
    (snapshotSource = getState(), options = {}) => {
      const snapshot = captureEntry(snapshotSource);
      mutate((draft) => {
        draft.historyStack.push(snapshot);
        if (options.clearRedo ?? true) {
          draft.redoStack = [];
        }
      });
    },
    [captureEntry],
  );

  const handleUndoRedo = useCallback<HandleUndoRedo>(
    (isRedo) => {
      const state = getState();
      if (
        isRedo
          ? state.redoStack.length === 0
          : state.historyStack.length === 0
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
        if (sourceStack.length === 0) return;

        const popped = sourceStack.pop();
        if (!popped) return;
        stateToRestore = popped;

        if (!isRedo) {
          targetStack.push(currentEntry);
        }
      });

      if (!stateToRestore) return;

      mutate((draft) => {
        draft.vertices = stateToRestore!.vertices;
        draft.objectiveVector = stateToRestore!.objectiveVector;
        draft.completionMode = stateToRestore!.completionMode;
      });
      onRestoreRef.current();
    },
    [captureEntry, save],
  );

  const saveRef = useRef<SaveHistory>(save);
  saveRef.current = save;
  const handleUndoRedoRef = useRef<HandleUndoRedo>(handleUndoRedo);
  handleUndoRedoRef.current = handleUndoRedo;

  return useMemo(
    () => ({ save, handleUndoRedo, saveRef, handleUndoRedoRef }),
    [save, handleUndoRedo],
  );
}
