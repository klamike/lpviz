import { state } from "../state/state";
import { PointXY } from "../types/arrays";
import { distance } from "../utils/math2d";
import { setButtonState } from "../utils/uiHelpers";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";

export interface PointerEvent {
  clientX: number;
  clientY: number;
}

export interface DragHandlers {
  start: (e: PointerEvent) => void;
  move: (e: PointerEvent) => void;
  end: () => void;
}

export function getLogicalCoords(
  canvasManager: CanvasManager,
  e: PointerEvent,
): PointXY {
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
  helpPopup?: any,
): DragHandlers {
  const canvas = canvasManager.canvas;

  function cleanupDragState() {
    state.potentialDragPointIndex = null;
    state.dragStartPos = null;
  }

  function exceedsDragThreshold(e: PointerEvent): boolean {
    if (!state.dragStartPos) return false;
    const dragDistance = Math.hypot(
      e.clientX - state.dragStartPos.x,
      e.clientY - state.dragStartPos.y,
    );
    return dragDistance > 5;
  }

  function handleDragStart(e: PointerEvent) {
    const logicalCoords = getLogicalCoords(canvasManager, e);
    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    if (!state.polygonComplete) {
      const idx = state.vertices.findIndex(
        (v) => distance(logicalCoords, v) < 0.5,
      );
      if (idx !== -1) {
        state.potentialDragPointIndex = idx;
        state.dragStartPos = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    // Check for objective dragging first
    if (state.objectiveVector !== null) {
      const tip = canvasManager.toCanvasCoords(
        state.objectiveVector.x,
        state.objectiveVector.y,
      );
      if (Math.hypot(localX - tip.x, localY - tip.y) < 10) {
        state.draggingObjective = true;
        return;
      }
    }

    // Check for vertex dragging
    const idx = state.vertices.findIndex(
      (v) => distance(logicalCoords, v) < 0.5,
    );
    if (idx !== -1) {
      state.potentialDragPointIndex = idx;
      state.dragStartPos = { x: e.clientX, y: e.clientY };
      return;
    }

    // Handle panning
    if (state.objectiveVector !== null) {
      state.isPanning = true;
      state.lastPan = { x: e.clientX, y: e.clientY };
    }
  }

  function handleDragMove(e: PointerEvent) {
    const logicalCoords = getLogicalCoords(canvasManager, e);

    // Check if we should start dragging a point (after some movement)
    if (
      state.potentialDragPointIndex !== null &&
      state.draggingPointIndex === null
    ) {
      if (exceedsDragThreshold(e)) {
        state.draggingPointIndex = state.potentialDragPointIndex;
        state.potentialDragPointIndex = null;
      }
    }

    // Handle active dragging states
    if (state.draggingPointIndex !== null) {
      state.vertices[state.draggingPointIndex] = logicalCoords;
      canvasManager.draw();
      return;
    }

    if (state.draggingObjective) {
      state.objectiveVector = logicalCoords;
      canvasManager.draw();
      return;
    }

    if (state.isPanning) {
      const dx = e.clientX - state.lastPan.x;
      const dy = e.clientY - state.lastPan.y;
      canvasManager.offset.x +=
        dx / (canvasManager.gridSpacing * canvasManager.scaleFactor);
      canvasManager.offset.y -=
        dy / (canvasManager.gridSpacing * canvasManager.scaleFactor);
      state.lastPan = { x: e.clientX, y: e.clientY };
      canvasManager.draw();
      setButtonState("unzoomButton", true);
      return;
    }

    // Default mouse move behavior (not dragging or panning)
    if (helpPopup?.isTouring) {
      return;
    }

    if (!state.polygonComplete) {
      state.currentMouse = logicalCoords;
      canvasManager.draw();
    } else if (state.polygonComplete && state.objectiveVector === null) {
      state.currentObjective = logicalCoords;
      canvasManager.draw();
    }
  }

  function handleDragEnd() {
    cleanupDragState();

    if (state.isPanning) {
      state.isPanning = false;
      state.wasPanning = true;
      return;
    }

    if (state.draggingPointIndex !== null) {
      saveToHistory();
      state.draggingPointIndex = null;
      state.wasDraggingPoint = true;
      sendPolytope();
    }

    if (state.draggingObjective) {
      saveToHistory();
      state.draggingObjective = false;
      state.wasDraggingObjective = true;
      sendPolytope();
    }
  }

  return {
    start: handleDragStart,
    move: handleDragMove,
    end: handleDragEnd,
  };
}

export function setupDragEventListeners(
  canvas: HTMLCanvasElement,
  dragHandlers: DragHandlers,
  canvasManager: CanvasManager,
): void {
  // ===== MOUSE EVENT LISTENERS =====

  canvas.addEventListener("mousedown", (e) => {
    if (state.is3DMode && e.shiftKey && !state.isTransitioning3D) {
      state.isRotatingCamera = true;
      state.lastRotationMouse = { x: e.clientX, y: e.clientY };
      return;
    }
    dragHandlers.start(e);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (state.isRotatingCamera) {
      const deltaX = e.clientX - state.lastRotationMouse.x;
      const deltaY = e.clientY - state.lastRotationMouse.y;

      state.viewAngle.y += deltaX * 0.01;
      state.viewAngle.x += deltaY * 0.01;
      state.viewAngle.x = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, state.viewAngle.x),
      );

      state.lastRotationMouse = { x: e.clientX, y: e.clientY };
      canvasManager.draw();
      return;
    }
    dragHandlers.move(e);
  });

  canvas.addEventListener("mouseup", () => {
    if (state.isRotatingCamera) {
      state.isRotatingCamera = false;
      return;
    }
    dragHandlers.end();
  });

  // ===== TOUCH EVENT LISTENERS =====

  canvas.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        dragHandlers.start(touch);
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (
          state.isPanning ||
          state.draggingPointIndex !== null ||
          state.draggingObjective
        ) {
          e.preventDefault();
        }
        const touch = e.touches[0];
        dragHandlers.move(touch);
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      if (
        state.isPanning ||
        state.draggingPointIndex !== null ||
        state.draggingObjective
      ) {
        e.preventDefault();
      }
      dragHandlers.end();
    },
    { passive: false },
  );
}
