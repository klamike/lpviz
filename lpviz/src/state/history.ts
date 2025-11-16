import { getState, mutate, setState } from "./store";
import type { PointXY } from "../solvers/utils/blas";
import { ViewportManager } from "../ui/viewport";

export interface HistoryEntry {
  vertices: PointXY[];
  objectiveVector: PointXY | null;
}

export function saveToHistory(): void {
  const { vertices, objectiveVector } = getState();
  mutate((draft) => {
    draft.historyStack.push({
      vertices: JSON.parse(JSON.stringify(vertices)),
      objectiveVector: objectiveVector ? { ...objectiveVector } : null,
    });
  });
}

export function createUndoRedoHandler(canvasManager: ViewportManager, saveToHistory: () => void, sendPolytope: () => void) {
  return function handleUndoRedo(isRedo: boolean) {
    const { redoStack, historyStack } = getState();
    const sourceStackLength = isRedo ? redoStack.length : historyStack.length;
    if (sourceStackLength === 0) return;

    if (isRedo) saveToHistory();

    const { vertices, objectiveVector } = getState();
    let stateToRestore: HistoryEntry | null = null;
    mutate((draft) => {
      const sourceStack = isRedo ? draft.redoStack : draft.historyStack;
      const targetStack = isRedo ? draft.historyStack : draft.redoStack;
      if (sourceStack.length === 0) return;

      const popped = sourceStack.pop();
      if (!popped) return;
      stateToRestore = popped;

      if (!isRedo) {
        targetStack.push({
          vertices: JSON.parse(JSON.stringify(vertices)),
          objectiveVector: objectiveVector ? { ...objectiveVector } : null,
        });
      }
    });

    if (!stateToRestore) return;

    mutate((draft) => {
      draft.vertices = stateToRestore!.vertices;
      draft.objectiveVector = stateToRestore!.objectiveVector;
    });
    canvasManager.draw();
    sendPolytope();
  };
}

export function setupKeyboardHandlers(canvasManager: ViewportManager, handleUndoRedo: (isRedo: boolean) => void): void {
  // ===== KEYBOARD HANDLERS =====

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      handleUndoRedo(e.shiftKey);
    }
    if (e.key.toLowerCase() === "s") {
      const { snapToGrid } = getState();
      setState({ snapToGrid: !snapToGrid });
    }
    if (e.key.toLowerCase() === "h") {
      const { objectiveHidden } = getState();
      setState({ objectiveHidden: !objectiveHidden });
      canvasManager.draw();
    }
  });
}
