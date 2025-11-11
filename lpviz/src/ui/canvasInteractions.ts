import {
  getGeometryState,
  getObjectiveState,
  getInteractionState,
  mutateGeometryState,
  mutateObjectiveState,
  mutateInteractionState,
} from "../state/state";
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
    const geometry = getGeometryState();
    if (geometry.vertices.length >= 3) {
      // Check if clicking near first vertex to close polygon
      if (distance(pt, geometry.vertices[0]) < 0.5) {
        mutateGeometryState((draft) => {
          draft.polygonComplete = true;
          draft.interiorPoint = pointCentroid(draft.vertices);
        });
        canvasManager.draw();
        sendPolytope();
        return;
      }
      
      // Check if clicking inside polygon to close it
      if (isPointInsidePolygon(pt, geometry.vertices)) {
        mutateGeometryState((draft) => {
          draft.polygonComplete = true;
          draft.interiorPoint = { x: pt.x, y: pt.y };
        });
        canvasManager.draw();
        sendPolytope();
        return;
      }
    }
    
    // Validate convexity before adding vertex
    const tentative = [...geometry.vertices, pt];
    if (tentative.length >= 3 && !isPolygonConvex(tentative)) {
      alert("Adding this vertex would make the polygon nonconvex. Please choose another point.");
      return;
    }
    
    saveToHistory();
    mutateGeometryState((draft) => {
      draft.vertices.push({ x: pt.x, y: pt.y });
    });
    uiManager.hideNullStateMessage();
    canvasManager.draw();
    sendPolytope();
  }

  function handleObjectiveSelection(pt: PointXY) {
    saveToHistory();
    const snapshot = getObjectiveState();
    const nextObjective = snapshot.currentObjective || pt;
    mutateObjectiveState((draft) => {
      draft.objectiveVector = { x: nextObjective.x, y: nextObjective.y };
    });
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
    
    const vertices = getGeometryState().vertices;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      
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
        mutateGeometryState((draft) => {
          draft.vertices.splice(i + 1, 0, newPoint);
        });
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
    const interaction = getInteractionState();
    if (interaction.wasPanning || interaction.wasDraggingPoint || interaction.wasDraggingObjective) {
      mutateInteractionState((draft) => {
        draft.wasPanning = false;
        draft.wasDraggingPoint = false;
        draft.wasDraggingObjective = false;
      });
      return;
    }

    const pt = getLogicalCoords(canvasManager, e);
    
    const geometry = getGeometryState();
    const objective = getObjectiveState();
    
    if (!geometry.polygonComplete) {
      handlePolygonConstruction(pt);
    } else if (objective.objectiveVector === null) {
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
