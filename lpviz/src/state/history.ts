import { state } from "./state";
import { PointXY } from "../types/arrays";
import { CanvasManager } from "../ui/canvasManager";

export interface HistoryEntry {
  vertices: PointXY[];
  objectiveVector: PointXY | null;
}

export function saveToHistory(): void {
  state.historyStack.push({
    vertices: JSON.parse(JSON.stringify(state.vertices)),
    objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
  });
}

export function createUndoRedoHandler(
  canvasManager: CanvasManager,
  saveToHistory: () => void,
  sendPolytope: () => void
) {
  return function handleUndoRedo(isRedo: boolean) {
    const sourceStack = isRedo ? state.redoStack : state.historyStack;
    const targetStack = isRedo ? state.historyStack : state.redoStack;
    
    if (sourceStack.length === 0) return;
    
    const stateToRestore = sourceStack.pop();
    if (!stateToRestore) return;
    
    if (!isRedo) {
      targetStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
    } else {
      saveToHistory();
    }
    
    state.vertices = stateToRestore.vertices;
    state.objectiveVector = stateToRestore.objectiveVector;
    canvasManager.draw();
    sendPolytope();
  };
}

export function setupKeyboardHandlers(
  canvasManager: CanvasManager,
  saveToHistory: () => void,
  sendPolytope: () => void,
  handleUndoRedo: (isRedo: boolean) => void
): void {
  // ===== KEYBOARD HANDLERS =====
  
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      handleUndoRedo(e.shiftKey);
    }
    if (e.key.toLowerCase() === "s") {
      state.snapToGrid = !state.snapToGrid;
    }
  });

  window.addEventListener("load", () => {
    const canvas = document.getElementById("gridCanvas");
    canvas?.focus();
  });
}

export function clearHistory(): void {
  state.historyStack = [];
  state.redoStack = [];
}

export function hasUndoHistory(): boolean {
  return state.historyStack.length > 0;
}

export function hasRedoHistory(): boolean {
  return state.redoStack.length > 0;
}
