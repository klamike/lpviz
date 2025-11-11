import {
  getGeometryState,
  getObjectiveState,
  getInteractionState,
  getViewState,
  mutateGeometryState,
  mutateObjectiveState,
  mutateInteractionState,
  mutateViewState,
} from "../state/state";
import { PointXY } from "../types/arrays";
import { distance } from "../utils/math2d";
import { setButtonState } from "../utils/uiHelpers";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";
import { HelpPopup } from "./guidedTour";

export interface PointerEvent {
  clientX: number;
  clientY: number;
}

export interface DragHandlers {
  start: (e: PointerEvent) => void;
  move: (e: PointerEvent) => void;
  end: () => void;
}

export function getLogicalCoords(canvasManager: CanvasManager, e: PointerEvent): PointXY {
  const rect = canvasManager.canvas.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;
  return canvasManager.toLogicalCoords(localX, localY);
}

export function createDragHandlers(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  saveToHistory: () => void,
  sendPolytope: () => void,
  helpPopup?: HelpPopup
): DragHandlers {
  const canvas = canvasManager.canvas;

  function cleanupDragState() {
    mutateInteractionState((draft) => {
      draft.potentialDragPointIndex = null;
      draft.dragStartPos = null;
    });
  }

  function exceedsDragThreshold(e: PointerEvent): boolean {
    const { dragStartPos } = getInteractionState();
    if (!dragStartPos) return false;
    const dragDistance = Math.hypot(
      e.clientX - dragStartPos.x,
      e.clientY - dragStartPos.y
    );
    return dragDistance > 5;
  }

  function handleDragStart(e: PointerEvent) {
    const logicalCoords = getLogicalCoords(canvasManager, e);
    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const geometry = getGeometryState();
    const objective = getObjectiveState();

    if (!geometry.polygonComplete) {
      const idx = geometry.vertices.findIndex(v => distance(logicalCoords, v) < 0.5);
      if (idx !== -1) {
        mutateInteractionState((draft) => {
          draft.potentialDragPointIndex = idx;
          draft.dragStartPos = { x: e.clientX, y: e.clientY };
        });
      }
      return;
    }

    // Check for objective dragging first
    if (objective.objectiveVector !== null) {
      const tip = canvasManager.toCanvasCoords(objective.objectiveVector.x, objective.objectiveVector.y);
      if (Math.hypot(localX - tip.x, localY - tip.y) < 10) { 
        mutateInteractionState((draft) => {
          draft.draggingObjective = true;
        });
        return;
      }
    }

    // Check for vertex dragging
    const idx = geometry.vertices.findIndex(v => distance(logicalCoords, v) < 0.5);
    if (idx !== -1) {
      mutateInteractionState((draft) => {
        draft.potentialDragPointIndex = idx;
        draft.dragStartPos = { x: e.clientX, y: e.clientY };
      });
      return;
    }

    // Handle panning
    if (objective.objectiveVector !== null) {
      mutateInteractionState((draft) => {
        draft.isPanning = true;
        draft.lastPan = { x: e.clientX, y: e.clientY };
      });
    }
  }

  function handleDragMove(e: PointerEvent) {
    const logicalCoords = getLogicalCoords(canvasManager, e);
    let interaction = getInteractionState();
    let geometry = getGeometryState();
    let objective = getObjectiveState();

    // Check if we should start dragging a point (after some movement)
    if (interaction.potentialDragPointIndex !== null && interaction.draggingPointIndex === null) {
      if (exceedsDragThreshold(e)) {
        const dragIndex = interaction.potentialDragPointIndex;
        mutateInteractionState((draft) => {
          draft.draggingPointIndex = dragIndex;
          draft.potentialDragPointIndex = null;
        });
        interaction = getInteractionState();
      }
    }

    // Handle active dragging states
    if (interaction.draggingPointIndex !== null) {
      const index = interaction.draggingPointIndex;
      mutateGeometryState((draft) => {
        draft.vertices[index] = logicalCoords;
      });
      canvasManager.draw();
      return;
    }
    
    if (interaction.draggingObjective) {
      mutateObjectiveState((draft) => {
        draft.objectiveVector = logicalCoords;
      });
      uiManager.updateObjectiveDisplay();
      canvasManager.draw();
      return;
    }
    
    if (interaction.isPanning && interaction.lastPan) {
      const dx = e.clientX - interaction.lastPan.x;
      const dy = e.clientY - interaction.lastPan.y;
      canvasManager.panByScreenDelta(dx, dy);
      mutateInteractionState((draft) => {
        draft.lastPan = { x: e.clientX, y: e.clientY };
      });
      canvasManager.draw();
      setButtonState("unzoomButton", true);
      return;
    }

    // Default mouse move behavior (not dragging or panning)
    if (helpPopup?.isTouring()) {
      return;
    }
    
    if (!geometry.polygonComplete) {
      mutateGeometryState((draft) => {
        draft.currentMouse = logicalCoords;
      });
      canvasManager.draw();
    } else if (geometry.polygonComplete && objective.objectiveVector === null) {
      mutateObjectiveState((draft) => {
        draft.currentObjective = logicalCoords;
      });
      canvasManager.draw();
    }
  }

  function handleDragEnd() {
    cleanupDragState();
    const interaction = getInteractionState();
    
    if (interaction.isPanning) {
      mutateInteractionState((draft) => {
        draft.isPanning = false;
        draft.wasPanning = true;
      });
      return;
    }
    
    if (interaction.draggingPointIndex !== null) {
      saveToHistory();
      mutateInteractionState((draft) => {
        draft.draggingPointIndex = null;
        draft.wasDraggingPoint = true;
      });
      sendPolytope(); 
    }
    
    if (interaction.draggingObjective) {
      saveToHistory();
      mutateInteractionState((draft) => {
        draft.draggingObjective = false;
        draft.wasDraggingObjective = true;
      });
      sendPolytope(); 
    }
  }

  return {
    start: handleDragStart,
    move: handleDragMove,
    end: handleDragEnd
  };
}

export function setupDragEventListeners(
  canvas: HTMLCanvasElement,
  dragHandlers: DragHandlers,
  canvasManager: CanvasManager
): void {
  // mouse

  canvas.addEventListener("mousedown", (e) => {
    const viewState = getViewState();
    if (viewState.is3DMode && e.shiftKey && !viewState.isTransitioning3D) {
      mutateViewState((draft) => {
        draft.isRotatingCamera = true;
        draft.lastRotationMouse = { x: e.clientX, y: e.clientY };
      });
      return;
    }
    dragHandlers.start(e);
  });

  canvas.addEventListener("mousemove", (e) => {
    const viewState = getViewState();
    if (viewState.isRotatingCamera && viewState.lastRotationMouse) {
      const deltaX = e.clientX - viewState.lastRotationMouse.x;
      const deltaY = e.clientY - viewState.lastRotationMouse.y;
      
      mutateViewState((draft) => {
        draft.viewAngle.y += deltaX * 0.01;
        draft.viewAngle.x += deltaY * 0.01;
        draft.viewAngle.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, draft.viewAngle.x));
        draft.lastRotationMouse = { x: e.clientX, y: e.clientY };
      });
      canvasManager.draw();
      return;
    }
    dragHandlers.move(e);
  });

  canvas.addEventListener("mouseup", () => {
    if (getViewState().isRotatingCamera) {
      mutateViewState((draft) => {
        draft.isRotatingCamera = false;
      });
      return;
    }
    dragHandlers.end();
  });

  // touch
  
  canvas.addEventListener("touchstart", (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      dragHandlers.start(touch);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const interaction = getInteractionState();
      if (interaction.isPanning || interaction.draggingPointIndex !== null || interaction.draggingObjective) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      dragHandlers.move(touch);
    }
  }, { passive: false });

  canvas.addEventListener("touchend", (e: TouchEvent) => {
    const interaction = getInteractionState();
    if (interaction.isPanning || interaction.draggingPointIndex !== null || interaction.draggingObjective) {
      e.preventDefault();
    }
    dragHandlers.end();
  }, { passive: false });
}
