import {
  getGeometryState,
  getObjectiveState,
  getHistoryState,
  mutateGeometryState,
  mutateObjectiveState,
  mutateHistoryState,
  mutateInteractionState,
} from "./state";
import { PointXY } from "../types/arrays";
import { CanvasManager } from "../ui/canvasManager";

export interface HistoryEntry {
  vertices: PointXY[];
  objectiveVector: PointXY | null;
}

export function saveToHistory(): void {
  const geometry = getGeometryState();
  const objective = getObjectiveState();
  mutateHistoryState((draft) => {
    draft.historyStack.push({
      vertices: JSON.parse(JSON.stringify(geometry.vertices)),
      objectiveVector: objective.objectiveVector ? { ...objective.objectiveVector } : null,
    });
  });
}

export function createUndoRedoHandler(
  canvasManager: CanvasManager,
  saveToHistory: () => void,
  sendPolytope: () => void
) {
  return function handleUndoRedo(isRedo: boolean) {
    const historySnapshot = getHistoryState();
    const sourceStackLength = isRedo ? historySnapshot.redoStack.length : historySnapshot.historyStack.length;
    if (sourceStackLength === 0) return;
    
    if (isRedo) {
      saveToHistory();
    }
    
    const geometrySnapshot = getGeometryState();
    const objectiveSnapshot = getObjectiveState();
    let stateToRestore: HistoryEntry | null = null;
    mutateHistoryState((draft) => {
      const sourceStack = isRedo ? draft.redoStack : draft.historyStack;
      const targetStack = isRedo ? draft.historyStack : draft.redoStack;
      if (sourceStack.length === 0) return;
      
      const popped = sourceStack.pop();
      if (!popped) return;
      stateToRestore = popped;
      
      if (!isRedo) {
        targetStack.push({
          vertices: JSON.parse(JSON.stringify(geometrySnapshot.vertices)),
          objectiveVector: objectiveSnapshot.objectiveVector ? { ...objectiveSnapshot.objectiveVector } : null,
        });
      }
    });
    
    if (!stateToRestore) return;
    
    mutateGeometryState((draft) => {
      draft.vertices = stateToRestore!.vertices;
    });
    mutateObjectiveState((draft) => {
      draft.objectiveVector = stateToRestore!.objectiveVector;
    });
    canvasManager.draw();
    sendPolytope();
  };
}

export function setupKeyboardHandlers(handleUndoRedo: (isRedo: boolean) => void): void {
  // ===== KEYBOARD HANDLERS =====
  
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      handleUndoRedo(e.shiftKey);
    }
    if (e.key.toLowerCase() === "s") {
      mutateInteractionState((draft) => {
        draft.snapToGrid = !draft.snapToGrid;
      });
    }
  });
}
