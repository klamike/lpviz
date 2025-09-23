import { state } from "../state/state";
import { distance, isPolygonConvex, polytope } from "../utils/math2d";
import { setButtonState } from "../utils/uiHelpers";
import { CanvasManager } from "./canvasManager";
import {
  createUndoRedoHandler,
  saveToHistory,
  setupKeyboardHandlers,
} from "../state/history";
import {
  ShareState,
  generateShareLink as generateShareLinkFromState,
  loadStateFromObject as loadSharedState,
} from "../state/sharing";
import { updateSolverButtonStates } from "../state/uiActions";
import { setResultHtml, setInequalitiesHtml } from "../state/uiDisplay";
import { setupCanvasInteractions } from "./canvasInteractions";

export function setupEventHandlers(
  canvasManager: CanvasManager,
) {
  const canvas = canvasManager.canvas;

  const getLogicalCoords = (point: { clientX: number; clientY: number }) => {
    const rect = canvas.getBoundingClientRect();
    const localX = point.clientX - rect.left;
    const localY = point.clientY - rect.top;
    return canvasManager.toLogicalCoords(localX, localY);
  };

  const cleanupDragState = () => {
    state.potentialDragPointIndex = null;
    state.dragStartPos = null;
  };

  const exceedsDragThreshold = (point: { clientX: number; clientY: number }) => {
    if (!state.dragStartPos) return false;
    const dragDistance = Math.hypot(
      point.clientX - state.dragStartPos.x,
      point.clientY - state.dragStartPos.y,
    );
    return dragDistance > 5;
  };

  const beginDrag = (point: { clientX: number; clientY: number }) => {
    const logicalCoords = getLogicalCoords(point);
    const rect = canvas.getBoundingClientRect();
    const localX = point.clientX - rect.left;
    const localY = point.clientY - rect.top;

    if (!state.polygonComplete) {
      const idx = state.vertices.findIndex((v) => distance(logicalCoords, v) < 0.5);
      if (idx !== -1) {
        state.potentialDragPointIndex = idx;
        state.dragStartPos = { x: point.clientX, y: point.clientY };
      }
      return;
    }

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

    const idx = state.vertices.findIndex((v) => distance(logicalCoords, v) < 0.5);
    if (idx !== -1) {
      state.potentialDragPointIndex = idx;
      state.dragStartPos = { x: point.clientX, y: point.clientY };
      return;
    }

    if (state.objectiveVector !== null) {
      state.isPanning = true;
      state.lastPan = { x: point.clientX, y: point.clientY };
    }
  };

  const continueDrag = (point: { clientX: number; clientY: number }) => {
    const logicalCoords = getLogicalCoords(point);

    if (
      state.potentialDragPointIndex !== null &&
      state.draggingPointIndex === null &&
      exceedsDragThreshold(point)
    ) {
      state.draggingPointIndex = state.potentialDragPointIndex;
      state.potentialDragPointIndex = null;
    }

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
      const dx = point.clientX - state.lastPan.x;
      const dy = point.clientY - state.lastPan.y;
      canvasManager.offset.x +=
        dx / (canvasManager.gridSpacing * canvasManager.scaleFactor);
      canvasManager.offset.y -=
        dy / (canvasManager.gridSpacing * canvasManager.scaleFactor);
      state.lastPan = { x: point.clientX, y: point.clientY };
      canvasManager.draw();
      setButtonState("unzoomButton", true);
      return;
    }


    if (!state.polygonComplete) {
      state.currentMouse = logicalCoords;
      canvasManager.draw();
    } else if (state.objectiveVector === null) {
      state.currentObjective = logicalCoords;
      canvasManager.draw();
    }
  };

  const endDrag = () => {
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
  };

  function sendPolytope() {
    const points = state.vertices.map((pt) => [pt.x, pt.y]);
    try {
      const result = polytope(points);

      if (!result.inequalities) {
      setInequalitiesHtml("No inequalities returned.");
      state.computedVertices = [];
      state.computedLines = [];
      state.highlightIndex = null;
      updateSolverButtonStates();
      return;
      }

      if (!isPolygonConvex(state.vertices)) {
        setInequalitiesHtml("Nonconvex");
        state.computedVertices = [];
        state.computedLines = [];
        state.highlightIndex = null;
        updateSolverButtonStates();
        return;
      }

      const inequalitiesHtml = result.inequalities
        .slice(
          0,
          state.polygonComplete
            ? result.inequalities.length
            : result.inequalities.length - 1,
        )
        .map(
          (ineq, index) =>
            `<div class="inequality-item" data-index="${index}">${ineq}</div>`,
        )
        .join("");

      setInequalitiesHtml(inequalitiesHtml);
      state.computedVertices = result.vertices;
      state.computedLines = result.lines;
      state.highlightIndex = null;
      updateSolverButtonStates();
    } catch (err) {
      console.error("Error:", err);
      setInequalitiesHtml("Error computing inequalities.");
      state.computedVertices = [];
      state.computedLines = [];
      state.highlightIndex = null;
      updateSolverButtonStates();
    }
  }

  function updateResult(html: string) {
    setResultHtml(html);
  }

  // Create and setup supporting handlers
  const handleUndoRedo = createUndoRedoHandler(
    canvasManager,
    saveToHistory,
    sendPolytope,
  );

  const loadStateFromObject = (shareState: ShareState) =>
    loadSharedState(shareState, { canvasManager, sendPolytope });

  const generateShareLink = () => generateShareLinkFromState();

  // Setup all event listeners
  const handleMouseDown = (e: MouseEvent) => {
    if (state.is3DMode && e.shiftKey && !state.isTransitioning3D) {
      state.isRotatingCamera = true;
      state.lastRotationMouse = { x: e.clientX, y: e.clientY };
      return;
    }
    beginDrag(e);
  };

  const handleMouseMove = (e: MouseEvent) => {
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
    continueDrag(e);
  };

  const stopRotationOrDrag = () => {
    if (state.isRotatingCamera) {
      state.isRotatingCamera = false;
      return;
    }
    endDrag();
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", stopRotationOrDrag);
  canvas.addEventListener("mouseleave", stopRotationOrDrag);

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      beginDrag(touch);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      if (
        state.isPanning ||
        state.draggingPointIndex !== null ||
        state.draggingObjective
      ) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      continueDrag(touch);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (
      state.isPanning ||
      state.draggingPointIndex !== null ||
      state.draggingObjective
    ) {
      e.preventDefault();
    }
    endDrag();
  };

  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
  setupCanvasInteractions(canvasManager, saveToHistory, sendPolytope);
  setupKeyboardHandlers(
    canvasManager,
    saveToHistory,
    sendPolytope,
    handleUndoRedo,
  );

  return {
    loadStateFromObject,
    generateShareLink,
    sendPolytope,
    saveToHistory,
  };
}
