import { state } from "../state/state";
import { PointXY } from "../types/arrays";
import {
  distance,
  isPointInsidePolygon,
  isPointNearSegment,
  isPolygonConvex,
  pointCentroid,
} from "../utils/math2d";
import { CanvasManager } from "./canvasManager";
import {
  hideNullStateMessage,
  updateSolverButtonStates,
  updateZoomButtonStates,
} from "../state/uiActions";

export function setupCanvasInteractions(
  canvasManager: CanvasManager,
  saveToHistory: () => void,
  sendPolytope: () => void,
): void {
  const canvas = canvasManager.canvas;

  const getLogicalCoords = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    return canvasManager.toLogicalCoords(localX, localY);
  };

  function handlePolygonConstruction(pt: PointXY) {
    if (state.vertices.length >= 3) {
      // Check if clicking near first vertex to close polygon
      if (distance(pt, state.vertices[0]) < 0.5) {
        state.polygonComplete = true;
        state.interiorPoint = pointCentroid(state.vertices);
    canvasManager.draw();
    updateZoomButtonStates(canvasManager);
    sendPolytope();
    return;
  }

      // Check if clicking inside polygon to close it
      if (isPointInsidePolygon(pt, state.vertices)) {
        state.polygonComplete = true;
        state.interiorPoint = pt;
    canvasManager.draw();
    updateZoomButtonStates(canvasManager);
    sendPolytope();
    return;
  }
    }

    // Validate convexity before adding vertex
    const tentative = [...state.vertices, pt];
    if (tentative.length >= 3 && !isPolygonConvex(tentative)) {
      alert(
        "Adding this vertex would make the polygon nonconvex. Please choose another point.",
      );
      return;
    }

    saveToHistory();
    state.vertices.push(pt);
    hideNullStateMessage();
    state.uiButtons["zoomButton"] = true;
    canvasManager.draw();
    updateZoomButtonStates(canvasManager);
    sendPolytope();
  }

  function handleObjectiveSelection(pt: PointXY) {
    saveToHistory();
    state.objectiveVector = state.currentObjective || pt;
    state.uiButtons["traceButton"] = true;
    state.uiButtons["zoomButton"] = true;
    updateSolverButtonStates();
    canvasManager.draw();
  }

  // ===== CANVAS INTERACTION HANDLERS =====

  canvas.addEventListener("dblclick", (e) => {

    const logicalMouse = getLogicalCoords(e);

    for (let i = 0; i < state.vertices.length; i++) {
      const v1 = state.vertices[i];
      const v2 = state.vertices[(i + 1) % state.vertices.length];

      if (isPointNearSegment(logicalMouse, v1, v2)) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const len = Math.hypot(dx, dy);
        const normal = { x: -dy / len, y: dx / len };
        const newPoint = {
          x: logicalMouse.x - normal.x * 0.1,
          y: logicalMouse.y - normal.y * 0.1,
        };
        saveToHistory();
        state.vertices.splice(i + 1, 0, newPoint);
        canvasManager.draw();
        updateZoomButtonStates(canvasManager);
        sendPolytope();
        break;
      }
    }
  });

  canvas.addEventListener("click", (e) => {

    // Ignore clicks that were part of drag operations
    if (
      state.wasPanning ||
      state.wasDraggingPoint ||
      state.wasDraggingObjective
    ) {
      state.wasPanning = false;
      state.wasDraggingPoint = false;
      state.wasDraggingObjective = false;
      return;
    }

    const pt = getLogicalCoords(e);

    if (!state.polygonComplete) {
      handlePolygonConstruction(pt);
    } else if (state.objectiveVector === null) {
      handleObjectiveSelection(pt);
    }
  });

  // ===== WHEEL EVENT HANDLER =====

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const oldScale = canvasManager.scaleFactor;
    const zoomFactor = 1.05;

    const newScale = Math.min(
      100,
      Math.max(
        0.1,
        e.deltaY < 0 ? oldScale * zoomFactor : oldScale / zoomFactor,
      ),
    );

    if (state.is3DMode || state.isTransitioning3D) {
      const worldX =
        (mouseX - canvasManager.centerX) /
          (canvasManager.gridSpacing * oldScale) -
        canvasManager.offset.x;
      const worldY =
        (canvasManager.centerY - mouseY) /
          (canvasManager.gridSpacing * oldScale) -
        canvasManager.offset.y;
      canvasManager.scaleFactor = newScale;
      canvasManager.offset.x =
        (mouseX - canvasManager.centerX) /
          (canvasManager.gridSpacing * newScale) -
        worldX;
      canvasManager.offset.y =
        (canvasManager.centerY - mouseY) /
          (canvasManager.gridSpacing * newScale) -
        worldY;
    } else {
      const logical = canvasManager.toLogicalCoords(mouseX, mouseY);
      canvasManager.scaleFactor = newScale;
      canvasManager.offset.x =
        (mouseX - canvasManager.centerX) /
          (canvasManager.gridSpacing * newScale) -
        logical.x;
      canvasManager.offset.y =
        (canvasManager.centerY - mouseY) /
          (canvasManager.gridSpacing * newScale) -
        logical.y;
    }
    canvasManager.draw();
    updateZoomButtonStates(canvasManager);
  });
}
