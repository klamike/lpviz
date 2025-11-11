import { state } from "../state/state";
import { PointXY } from "../types/arrays";
import { distance, pointCentroid, isPolygonConvex, isPointInsidePolygon, isPointNearSegment } from "../utils/math2d";
import { showElement, setButtonsEnabled } from "../utils/uiHelpers";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";
import { PointerEvent } from "./dragHandlers";
import { HelpPopup } from "./guidedTour";

export function setupCanvasInteractions(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  saveToHistory: () => void,
  sendPolytope: () => void,
  getLogicalCoords: (canvasManager: CanvasManager, e: PointerEvent) => PointXY,
  helpPopup?: HelpPopup
): void {
  const canvas = canvasManager.canvas;

  function handlePolygonConstruction(pt: PointXY) {
    if (state.vertices.length >= 3) {
      // Check if clicking near first vertex to close polygon
      if (distance(pt, state.vertices[0]) < 0.5) {
        state.polygonComplete = true;
        state.interiorPoint = pointCentroid(state.vertices);
        canvasManager.draw();
        sendPolytope();
        return;
      }
      
      // Check if clicking inside polygon to close it
      if (isPointInsidePolygon(pt, state.vertices)) {
        state.polygonComplete = true;
        state.interiorPoint = pt;
        canvasManager.draw();
        sendPolytope();
        return;
      }
    }
    
    // Validate convexity before adding vertex
    const tentative = [...state.vertices, pt];
    if (tentative.length >= 3 && !isPolygonConvex(tentative)) {
      alert("Adding this vertex would make the polygon nonconvex. Please choose another point.");
      return;
    }
    
    saveToHistory();
    state.vertices.push(pt);
    uiManager.hideNullStateMessage();
    canvasManager.draw();
    sendPolytope();
  }

  function handleObjectiveSelection(pt: PointXY) {
    saveToHistory();
    state.objectiveVector = state.currentObjective || pt;
    showElement("maximize");
    setButtonsEnabled({
      "ipmButton": true,
      "simplexButton": true,
      "pdhgButton": true,
      "iteratePathButton": false,
      "traceButton": true,
      "zoomButton": true
    });
    uiManager.updateSolverModeButtons();
    uiManager.updateObjectiveDisplay();
    canvasManager.draw();
  }

  // ===== CANVAS INTERACTION HANDLERS =====
  
  canvas.addEventListener("dblclick", (e) => {
    if (helpPopup?.isTouring()) {
      return;
    }

    const logicalMouse = getLogicalCoords(canvasManager, e);
    
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
        sendPolytope();
        break;
      }
    }
  });

  canvas.addEventListener("click", (e) => {
    if (helpPopup?.isTouring()) {
      return;
    }

    // Ignore clicks that were part of drag operations
    if (state.wasPanning || state.wasDraggingPoint || state.wasDraggingObjective) {
      state.wasPanning = false;
      state.wasDraggingPoint = false;
      state.wasDraggingObjective = false;
      return;
    }

    const pt = getLogicalCoords(canvasManager, e);
    
    if (!state.polygonComplete) {
      handlePolygonConstruction(pt);
    } else if (state.objectiveVector === null) {
      handleObjectiveSelection(pt);
    }
  });

  // ===== WHEEL EVENT HANDLER =====
  
  const MAX_SCALE_FACTOR = 400;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = 1.05;
    
    const newScale = Math.min(MAX_SCALE_FACTOR, Math.max(0.05, 
      e.deltaY < 0 ? canvasManager.scaleFactor * zoomFactor : canvasManager.scaleFactor / zoomFactor
    ));
    
    const focusPoint = canvasManager.toLogicalCoords(mouseX, mouseY);
    canvasManager.scaleFactor = newScale;
    canvasManager.setOffsetForAnchor(mouseX, mouseY, focusPoint);
    canvasManager.draw();
  });
}
