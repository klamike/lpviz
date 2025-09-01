import { state } from "../state/state";
import { PointXY } from "../types/arrays";
import {
  fetchPolytope,
  fetchCentralPath,
  fetchSimplex,
  fetchIPM,
  fetchPDHG,
} from "../services/apiClient";
import { start3DTransition } from "../utils/transitions";
import JSONCrush from "jsoncrush";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";

interface Settings {
  alphaMax?: number;
  maxitIPM?: number;
  pdhgEta?: number;
  pdhgTau?: number;
  maxitPDHG?: number;
  pdhgIneqMode?: boolean;
  centralPathIter?: number;
  objectiveAngleStep?: number;
}

interface ShareState {
  vertices: { x: number; y: number }[];
  objective: { x: number; y: number } | null;
  solverMode: string;
  settings: Settings;
}

export function setupEventHandlers(canvasManager: CanvasManager, uiManager: UIManager) {
  const canvas = canvasManager.canvas;

  const distance = (p1: { x: number; y: number; }, p2: PointXY) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const computeCentroid = (pts: PointXY[]) => ({
    x: pts.reduce((s: number, pt: PointXY) => s + pt.x, 0) / pts.length,
    y: pts.reduce((s: number, pt: PointXY) => s + pt.y, 0) / pts.length,
  });
  const isPolygonConvex = (pts: PointXY[]) => {
    if (pts.length < 3) return true;
    let prevCross = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      const p2 = pts[(i + 2) % n];
      const cross =
        (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (cross !== 0) {
        if (prevCross === 0) prevCross = cross;
        else if (Math.sign(cross) !== Math.sign(prevCross)) return false;
      }
    }
    return true;
  };
  const isPointInsidePolygon = (point: PointXY, poly: PointXY[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      if (
        (yi > point.y) !== (yj > point.y) &&
        point.x <
          ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  };
  const isPointNearSegment = (point: PointXY, v1: PointXY, v2: PointXY) => {
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const len2 = dx * dx + dy * dy;
    const t =
      ((point.x - v1.x) * dx + (point.y - v1.y) * dy) / len2;
    if (t < 0 || t > 1) return false;
    const proj = { x: v1.x + t * dx, y: v1.y + t * dy };
    const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
    return dist < 0.5;
  };

  // ----- Refactored Drag Handlers -----
  function handleDragStart(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const logicalCoords = canvasManager.toLogicalCoords(localX, localY);

    if (!state.polygonComplete) {
      const idx = state.vertices.findIndex(
        (v) => distance(logicalCoords, v) < 0.5
      );
      if (idx !== -1) {
        // Don't immediately set draggingPointIndex - wait for actual movement
        state.potentialDragPointIndex = idx;
        state.dragStartPos = { x: clientX, y: clientY };
      }
      return; // Don't allow panning or objective drag before polygon is complete
    } else {
      // Check for objective dragging first
      if (state.objectiveVector !== null) {
        const tip = canvasManager.toCanvasCoords(
          state.objectiveVector.x,
          state.objectiveVector.y
        );
        // Use localX, localY for objective tip check as it's in canvas pixel space
        if (Math.hypot(localX - tip.x, localY - tip.y) < 10) { 
          state.draggingObjective = true;
          return;
        }
      }

      // Check for vertex dragging
      const idx = state.vertices.findIndex(
        (v) => distance(logicalCoords, v) < 0.5
      );
      if (idx !== -1) {
        state.potentialDragPointIndex = idx;
        state.dragStartPos = { x: clientX, y: clientY };
        return;
      }

      // If not dragging objective or vertex:
      if (state.objectiveVector !== null) {
        // If objective is already set, this tap/drag on empty space is a pan.
        state.isPanning = true;
        state.lastPan = { x: clientX, y: clientY };
      } else {
        // Polygon is complete, but objective is NOT set.
        // This tap is intended for the click handler to set the objective.
        // Do not set isPanning, so the click event can proceed.
      }
    }
  }

  function handleDragMove(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    // Check if we should start dragging a point (after some movement)
    if (state.potentialDragPointIndex !== null && state.draggingPointIndex === null) {
      const dragDistance = Math.hypot(
        clientX - (state.dragStartPos?.x || 0),
        clientY - (state.dragStartPos?.y || 0)
      );
      if (dragDistance > 5) { // Threshold to distinguish click from drag
        state.draggingPointIndex = state.potentialDragPointIndex;
        state.potentialDragPointIndex = null;
      }
    }

    if (state.draggingPointIndex !== null) {
      state.vertices[state.draggingPointIndex] = canvasManager.toLogicalCoords(localX, localY);
      canvasManager.draw();
      return;
    }
    if (state.draggingObjective) {
      state.objectiveVector = canvasManager.toLogicalCoords(localX, localY);
      uiManager.updateObjectiveDisplay();
      canvasManager.draw();
      return;
    }
    if (state.isPanning) {
      const dx = clientX - state.lastPan.x;
      const dy = clientY - state.lastPan.y;
      canvasManager.offset.x += dx / (canvasManager.gridSpacing * canvasManager.scaleFactor);
      canvasManager.offset.y -= dy / (canvasManager.gridSpacing * canvasManager.scaleFactor);
      state.lastPan = { x: clientX, y: clientY };
      canvasManager.draw();
      (document.getElementById("unzoomButton") as HTMLButtonElement).disabled = false;
      return;
    }

    // Default mouse move behavior (not dragging or panning)
    if (!state.polygonComplete) {
      state.currentMouse = canvasManager.toLogicalCoords(localX, localY);
      canvasManager.draw();
    } else if (state.polygonComplete && state.objectiveVector === null) {
      state.currentObjective = canvasManager.toLogicalCoords(localX, localY);
      canvasManager.draw();
    }
  }

  function handleDragEnd() {
    // Clear potential drag state
    state.potentialDragPointIndex = null;
    state.dragStartPos = null;
    
    if (state.isPanning) {
      state.isPanning = false;
      state.wasPanning = true; // Keep track for click event logic
      return;
    }
    if (state.draggingPointIndex !== null) {
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.draggingPointIndex = null;
      state.wasDraggingPoint = true; // Set flag for click handler
      sendPolytope(); 
    }
    if (state.draggingObjective) {
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.draggingObjective = false;
      state.wasDraggingObjective = true; // Set flag for click handler
      sendPolytope(); 
    }
  }

  // ----- Canvas Event Listeners -----
  canvas.addEventListener("mousedown", (e: { shiftKey: boolean; clientX: number; clientY: number; }) => {
    if (state.is3DMode && e.shiftKey && !state.isTransitioning3D) {
      state.isRotatingCamera = true;
      state.lastRotationMouse = { x: e.clientX, y: e.clientY };
      return;
    }
    handleDragStart(e.clientX, e.clientY);
  });

  canvas.addEventListener("mousemove", (e: { clientX: number; clientY: number; }) => {
    if (state.isRotatingCamera) {
      const deltaX = e.clientX - state.lastRotationMouse.x;
      const deltaY = e.clientY - state.lastRotationMouse.y;
      
      state.viewAngle.y += deltaX * 0.01;
      state.viewAngle.x += deltaY * 0.01;
      
      state.viewAngle.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, state.viewAngle.x));
      
      state.lastRotationMouse = { x: e.clientX, y: e.clientY };
      canvasManager.draw();
      return;
    }
    handleDragMove(e.clientX, e.clientY);
  });

  canvas.addEventListener("mouseup", () => {
    if (state.isRotatingCamera) {
      state.isRotatingCamera = false;
      return;
    }
    handleDragEnd();
  });
  // Touch event listeners
  canvas.addEventListener("touchstart", (e: TouchEvent) => {
    if (e.touches.length === 1) { // Handle single touch for dragging
      const touch = e.touches[0];
      handleDragStart(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e: TouchEvent) => {
    if (e.touches.length === 1) {
      // Only prevent default if a drag/pan is actually happening
      if (state.isPanning || state.draggingPointIndex !== null || state.draggingObjective) {
        e.preventDefault(); // Prevent page scroll during drag
      }
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  canvas.addEventListener("touchend", (e: TouchEvent) => {
    // touchend doesn't have e.touches for the ended touch, 
    // but handleDragEnd() relies on state flags, not coordinates.
    // e.changedTouches[0] could provide the last point if needed.
    if (state.isPanning || state.draggingPointIndex !== null || state.draggingObjective) {
        e.preventDefault(); // Prevent potential click events after drag
    }
    handleDragEnd();
  }, { passive: false });

  canvas.addEventListener("dblclick", (e: { clientX: number; clientY: number; }) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const logicalMouse = canvasManager.toLogicalCoords(mouseX, mouseY);
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
        state.historyStack.push({
          vertices: JSON.parse(JSON.stringify(state.vertices)),
          objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
        });
        state.vertices.splice(i + 1, 0, newPoint);
        canvasManager.draw();
        sendPolytope();
        break;
      }
    }
  });
  canvas.addEventListener("click", (e: { clientX: number; clientY: number; }) => {
    if (state.wasPanning) {
      state.wasPanning = false;
      return;
    }
    // If click happened after a drag, ignore it.
    if (state.wasDraggingPoint) {
      state.wasDraggingPoint = false;
      return;
    }
    if (state.wasDraggingObjective) {
      state.wasDraggingObjective = false;
      return;
    }

    // Proceed with click logic only if it wasn't part of a pan or drag
    const rect = canvas.getBoundingClientRect();
    const pt = canvasManager.toLogicalCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (!state.polygonComplete) {
      if (state.vertices.length >= 3) {
        if (distance(pt, state.vertices[0]) < 0.5) {
          state.polygonComplete = true;
          state.interiorPoint = computeCentroid(state.vertices);
          canvasManager.draw();
          sendPolytope();
          return;
        }
        if (isPointInsidePolygon(pt, state.vertices)) {
          state.polygonComplete = true;
          state.interiorPoint = pt;
          canvasManager.draw();
          sendPolytope();
          return;
        }
      }
      const tentative = [...state.vertices, pt];
      if (tentative.length >= 3 && !isPolygonConvex(tentative)) {
        alert("Adding this vertex would make the polygon nonconvex. Please choose another point.");
        return;
      }
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.vertices.push(pt);
      uiManager.hideNullStateMessage();
      canvasManager.draw();
      sendPolytope();
    } else if (state.polygonComplete && state.objectiveVector === null) {
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? JSON.parse(JSON.stringify(state.objectiveVector)) : null,
      });
      state.objectiveVector = state.currentObjective || pt;
      (document.getElementById("maximize") as HTMLElement).style.display = "block";
      (document.getElementById("ipmButton") as HTMLButtonElement).disabled = false;
      (document.getElementById("simplexButton") as HTMLButtonElement).disabled = false;
      (document.getElementById("pdhgButton") as HTMLButtonElement).disabled = false;
      (document.getElementById("iteratePathButton") as HTMLButtonElement).disabled = true;
      (document.getElementById("traceButton") as HTMLButtonElement).disabled = false;
      (document.getElementById("animateButton") as HTMLButtonElement).disabled = false;
      (document.getElementById("startRotateObjectiveButton") as HTMLButtonElement).disabled = false;
      (document.getElementById("zoomButton") as HTMLButtonElement).disabled = false;
      uiManager.updateObjectiveDisplay();
      canvasManager.draw();
    }
  });

  // ----- Global Keyboard Handlers -----
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        if (state.redoStack.length) {
          const nextState = state.redoStack.pop();
          state.historyStack.push({
            vertices: JSON.parse(JSON.stringify(state.vertices)),
            objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
          });
          state.vertices = nextState.vertices;
          state.objectiveVector = nextState.objectiveVector;
          canvasManager.draw();
          sendPolytope();
        }
      } else {
        if (state.historyStack.length) {
          const lastState = state.historyStack.pop();
          state.redoStack.push({
            vertices: JSON.parse(JSON.stringify(state.vertices)),
            objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
          });
          state.vertices = lastState.vertices;
          state.objectiveVector = lastState.objectiveVector;
          canvasManager.draw();
          sendPolytope();
        }
      }
    }
    if (e.key.toLowerCase() === "s") {
      state.snapToGrid = !state.snapToGrid;
    }
  });
  window.addEventListener("load", () => {
    const canvas = document.getElementById("gridCanvas");
    canvas?.focus();
  });

  // ----- UI Button Handlers -----
  uiManager.zoomButton?.addEventListener("click", () => {
    if (state.vertices.length > 0) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      state.vertices.forEach((v) => {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      });
      const polyWidth = maxX - minX;
      const polyHeight = maxY - minY;
      const centroid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      canvasManager.offset.x = -centroid.x;
      canvasManager.offset.y = -centroid.y;
      const padding = 50;
      const sidebarWidth = document.getElementById("sidebar")?.offsetWidth ?? 0;
      const availWidth = (window.innerWidth - sidebarWidth) - 2 * padding;
      const availHeight = window.innerHeight - 2 * padding;
      if (polyWidth > 0 && polyHeight > 0) {
        canvasManager.scaleFactor = Math.min(
          availWidth / (polyWidth * canvasManager.gridSpacing),
          availHeight / (polyHeight * canvasManager.gridSpacing)
        );
      }
      canvasManager.centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
      canvasManager.centerY = window.innerHeight / 2;
      canvasManager.draw();
      uiManager.updateZoomButtonsState(canvasManager);
    }
  });

  uiManager.unzoomButton?.addEventListener("click", () => {
    canvasManager.scaleFactor = 1;
    canvasManager.offset.x = 0;
    canvasManager.offset.y = 0;
    state.viewAngle.x = -1.15;
    state.viewAngle.y = 0.4;
    state.viewAngle.z = 0;
    canvasManager.draw();
    uiManager.updateZoomButtonsState(canvasManager);
  });
  uiManager.toggle3DButton?.addEventListener("click", () => {
    if (state.isTransitioning3D) {
      return;
    }
    
    const targetMode = !state.is3DMode;
    start3DTransition(canvasManager, uiManager, targetMode);
  });
  uiManager.zScaleSlider?.addEventListener("input", () => {
    state.zScale = parseFloat(uiManager.zScaleSlider?.value || "0.1");
    uiManager.updateZScaleValue();
    if (state.is3DMode || state.isTransitioning3D) {
      canvasManager.draw();
    }
  });

  // Solver Mode Buttons
  const iteratePathButton = document.getElementById("iteratePathButton") as HTMLButtonElement;
  const ipmButton = document.getElementById("ipmButton") as HTMLButtonElement;
  const simplexButton = document.getElementById("simplexButton") as HTMLButtonElement;
  const pdhgButton = document.getElementById("pdhgButton") as HTMLButtonElement;

  iteratePathButton.addEventListener("click", () => {
    state.solverMode = "central";
    iteratePathButton.disabled = true;
    ipmButton.disabled = false;
    simplexButton.disabled = false;
    pdhgButton.disabled = false;
    (document.getElementById("ipmSettings") as HTMLElement).style.display = "none";
    (document.getElementById("pdhgSettings") as HTMLElement).style.display = "none";
    (document.getElementById("centralPathSettings") as HTMLElement).style.display = "block";
  });
  ipmButton.addEventListener("click", () => {
    state.solverMode = "ipm";
    ipmButton.disabled = true;
    iteratePathButton.disabled = false;
    simplexButton.disabled = false;
    pdhgButton.disabled = false;
    (document.getElementById("ipmSettings") as HTMLElement).style.display = "block";
    (document.getElementById("pdhgSettings") as HTMLElement).style.display = "none";
    (document.getElementById("centralPathSettings") as HTMLElement).style.display = "none";
  });
  simplexButton.addEventListener("click", () => {
    state.solverMode = "simplex";
    simplexButton.disabled = true;
    ipmButton.disabled = false;
    iteratePathButton.disabled = false;
    pdhgButton.disabled = false;
    (document.getElementById("ipmSettings") as HTMLElement).style.display = "none";
    (document.getElementById("pdhgSettings") as HTMLElement).style.display = "none";
    (document.getElementById("centralPathSettings") as HTMLElement).style.display = "none";
  });
  pdhgButton.addEventListener("click", () => {
    state.solverMode = "pdhg";
    pdhgButton.disabled = true;
    simplexButton.disabled = false;
    ipmButton.disabled = false;
    iteratePathButton.disabled = false;
    (document.getElementById("ipmSettings") as HTMLElement).style.display = "none";
    (document.getElementById("pdhgSettings") as HTMLElement).style.display = "block";
    (document.getElementById("centralPathSettings") as HTMLElement).style.display = "none";
  });

  // Input event listeners for IPM and PDHG settings
  const alphaMaxSlider = document.getElementById("alphaMaxSlider") as HTMLInputElement;
  const pdhgEtaSlider = document.getElementById("pdhgEtaSlider") as HTMLInputElement;
  const pdhgTauSlider = document.getElementById("pdhgTauSlider") as HTMLInputElement;
  const maxitInput = document.getElementById("maxitInput") as HTMLInputElement;
  const maxitInputPDHG = document.getElementById("maxitInputPDHG") as HTMLInputElement;
  const pdhgIneqMode = document.getElementById("pdhgIneqMode") as HTMLInputElement;
  const objectiveAngleStepSlider = document.getElementById("objectiveAngleStepSlider") as HTMLInputElement;
  const objectiveAngleStepValue = document.getElementById("objectiveAngleStepValue") as HTMLElement;
  const centralPathIterSlider = document.getElementById("centralPathIterSlider") as HTMLInputElement;
  const centralPathIterValue = document.getElementById("centralPathIterValue") as HTMLElement;

  alphaMaxSlider.addEventListener("input", () => {
    (document.getElementById("alphaMaxValue") as HTMLElement).textContent = parseFloat(alphaMaxSlider.value).toFixed(3);
    if (state.solverMode === "ipm") computePath();
  });
  pdhgEtaSlider.addEventListener("input", () => {
    (document.getElementById("pdhgEtaValue") as HTMLElement).textContent = parseFloat(pdhgEtaSlider.value).toFixed(3);
    if (state.solverMode === "pdhg") computePath();
  });
  pdhgTauSlider.addEventListener("input", () => {
    (document.getElementById("pdhgTauValue") as HTMLElement).textContent = parseFloat(pdhgTauSlider.value).toFixed(3);
    if (state.solverMode === "pdhg") computePath();
  });
  maxitInput.addEventListener("input", () => {
    if (state.solverMode === "ipm") computePath();
  });
  maxitInputPDHG.addEventListener("input", () => {
    if (state.solverMode === "pdhg") computePath();
  });
  pdhgIneqMode.addEventListener("change", () => {
    if (state.solverMode === "pdhg") computePath();
  });
  objectiveAngleStepSlider.addEventListener("input", () => {
    objectiveAngleStepValue.textContent = parseFloat(objectiveAngleStepSlider.value).toFixed(2);
    if (state.traceEnabled) {
      state.traceBuffer = [];
      state.totalRotationAngle = 0;
      state.rotationCount = 0;
      canvasManager.draw();
    }
  });
  centralPathIterSlider.addEventListener("input", () => {
    centralPathIterValue.textContent = centralPathIterSlider.value;
    if (state.solverMode === "central") computePath();
  });


  // Trace/Solve Button
  const traceButton = document.getElementById("traceButton") as HTMLButtonElement;
  traceButton.addEventListener("click", () => {
    computePath();
    state.iteratePathComputed = true;
  });

  // Rotate Objective Buttons
  const startRotateObjectiveButton = document.getElementById("startRotateObjectiveButton") as HTMLButtonElement;
  const stopRotateObjectiveButton = document.getElementById("stopRotateObjectiveButton") as HTMLButtonElement;
  const objectiveRotationSettings = document.getElementById("objectiveRotationSettings") as HTMLElement;

  startRotateObjectiveButton.addEventListener("click", () => {
    state.rotateObjectiveMode = true;
    state.traceBuffer = [];
    state.totalRotationAngle = 0;
    state.rotationCount = 0;
    if (!state.objectiveVector) {
      state.objectiveVector = { x: 1, y: 0 };
      uiManager.updateObjectiveDisplay();
    }
    if (state.animationIntervalId !== null) {
      clearInterval(state.animationIntervalId);
      state.animationIntervalId = null;
    }
    objectiveRotationSettings.style.display = "block";
    startRotateObjectiveButton.disabled = true;
    stopRotateObjectiveButton.disabled = false;
    computeAndRotate();
  });
  stopRotateObjectiveButton.addEventListener("click", () => {
    state.rotateObjectiveMode = false;
    state.totalRotationAngle = 0;
    objectiveRotationSettings.style.display = "none";
    startRotateObjectiveButton.disabled = false;
    stopRotateObjectiveButton.disabled = true;
  });

  // Trace Checkbox
  const traceCheckbox = document.getElementById("traceCheckbox") as HTMLInputElement;
  traceCheckbox.checked = false;
  traceCheckbox.addEventListener("change", () => {
    state.traceEnabled = traceCheckbox.checked;
    if (!state.traceEnabled) {
      state.traceBuffer = [];
      state.totalRotationAngle = 0;
      state.rotationCount = 0;
      canvasManager.draw();
    }
  });

  // Animate Button
  const animateButton = document.getElementById("animateButton") as HTMLButtonElement;
  const replaySpeedSlider = document.getElementById("replaySpeedSlider") as HTMLInputElement;
  const shareButton = document.getElementById("shareButton") as HTMLButtonElement;
  animateButton.addEventListener("click", () => {
    if (state.rotateObjectiveMode) return;
    if (state.animationIntervalId !== null) {
      clearInterval(state.animationIntervalId);
      state.animationIntervalId = null;
    }
    const intervalTime = parseInt(replaySpeedSlider.value, 10) || 500;
    const iteratesToAnimate = [...state.originalIteratePath];
    state.iteratePath = [];
    state.highlightIteratePathIndex = null;
    canvasManager.draw();
    let currentIndex = 0;
    const intervalId = window.setInterval(() => {
      if (state.animationIntervalId !== intervalId) {
        return;
      }
      if (currentIndex >= iteratesToAnimate.length) {
        clearInterval(intervalId);
        state.animationIntervalId = null;
        return;
      }
      state.iteratePath.push(iteratesToAnimate[currentIndex]);
      state.highlightIteratePathIndex = currentIndex;
      currentIndex++;
      canvasManager.draw();
    }, intervalTime);
    state.animationIntervalId = intervalId;
  });

  shareButton.addEventListener("click", () => {
    const url = generateShareLink();
    window.prompt("Share this link:", url);
  });

  // Sidebar Resize
  const sidebar = document.getElementById("sidebar") as HTMLElement;
  const handle = document.getElementById("sidebarHandle") as HTMLElement;
  let isResizing = false;
  handle.addEventListener("mousedown", (e) => {
    isResizing = true;
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    let newWidth = e.clientX;
    newWidth = Math.max(200, Math.min(newWidth, 1000));
    sidebar.style.width = `${newWidth}px`;
    handle.style.left = `${newWidth}px`;
    canvasManager.centerX = newWidth + (window.innerWidth - newWidth) / 2;
    canvasManager.draw();
  });
  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      adjustFontSize();
    }
  });

  // Result Hover (for central path items)
  let cpMouseX = 0;
  let cpMouseY = 0;
  let cpCurrentHovered: HTMLElement | null = null;
  const resultDiv = document.getElementById("result") as HTMLElement;
  document.addEventListener("mousemove", (e) => {
    cpMouseX = e.clientX;
    cpMouseY = e.clientY;
    updateHoverState();
  });
  function updateHoverState() {
    const el = document.elementFromPoint(cpMouseX, cpMouseY);
    if (el && el.classList.contains("iterate-item")) {
      if (cpCurrentHovered !== el) {
        if (cpCurrentHovered) {
          cpCurrentHovered.classList.remove("hover");
          cpCurrentHovered.dispatchEvent(new Event("mouseleave", { bubbles: true }));
        }
        el.classList.add("hover");
        el.dispatchEvent(new Event("mouseenter", { bubbles: true }));
        cpCurrentHovered = el as HTMLElement;
      }
    } else if (cpCurrentHovered) {
      cpCurrentHovered.classList.remove("hover");
      cpCurrentHovered.dispatchEvent(new Event("mouseleave", { bubbles: true }));
      cpCurrentHovered = null;
    }
  }

  resultDiv.addEventListener("scroll", updateHoverState);

  function addTraceToBuffer(iteratesArray: number[][]) {
    if (!state.traceEnabled || iteratesArray.length === 0) return;
    
    const objectiveAngleStepSlider = document.getElementById("objectiveAngleStepSlider") as HTMLInputElement;
    const angleStep = parseFloat(objectiveAngleStepSlider.value);

    const maxTracesPerRotation = Math.ceil((2 * Math.PI) / angleStep);
    state.maxTraceCount = maxTracesPerRotation;
    
    state.traceBuffer.push({
      path: [...iteratesArray],
      angle: state.totalRotationAngle
    });
    
    while (state.traceBuffer.length > state.maxTraceCount) {
      state.traceBuffer.shift();
    }
    
    if (state.totalRotationAngle >= 2 * Math.PI) {
      state.rotationCount = Math.floor(state.totalRotationAngle / (2 * Math.PI));
    }
  }

  // Helper: computePath calls the appropriate API based on solver mode
  async function computePath() {
    animateButton.disabled = false;
    if (state.animationIntervalId !== null) {
      clearInterval(state.animationIntervalId);
      state.animationIntervalId = null;
    }
    if (state.solverMode === "ipm") {
      const alphaMax = parseFloat(alphaMaxSlider.value);
      const maxit = parseInt(maxitInput.value, 10);
      const result = await fetchIPM(
        state.computedLines,
        [state.objectiveVector!.x, state.objectiveVector!.y],
        getBarrierWeights(),
        alphaMax,
        maxit
      );
      const sol = result.iterates.solution;
      const logArray = sol.log;
      const iteratesArray = sol.x.map((val, i) => sol.x[i]);
      // @ts-ignore
      state.originalIteratePath = [...iteratesArray];  
      // @ts-ignore
      state.iteratePath = iteratesArray;
      if (state.traceEnabled && iteratesArray.length > 0) {
        // @ts-ignore - IPM case has different format, skip for now
        // TODO: Convert IPM format to work with optimized buffer
      }
      let html = "";
      html += `<div class="iterate-header">${logArray[0]}</div>`;
      for (let i = 1; i < logArray.length - 1; i++) {
        html += `<div class="iterate-item" data-index="${i-1}">${logArray[i]}</div>`;
      }
      if (logArray.length > 1) {
        html += `<div class="iterate-footer">${logArray[logArray.length - 1]}</div>`;
      }
      updateResult(html);
    } else if (state.solverMode === "simplex") {
      const result = await fetchSimplex(
        state.computedLines,
        [state.objectiveVector!.x, state.objectiveVector!.y]
      );
      const iteratesArray = result.iterations;
      const phase1logs = result.logs[0];
      const phase2logs = result.logs[1];
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
      if (state.traceEnabled && iteratesArray.length > 0) {
        // Use optimized trace buffer
        addTraceToBuffer(iteratesArray);
      }
      
      let html = "";
      html += `<div class="iterate-header">Phase 1\n${phase1logs[0]}</div>`;

      for (let i = 1; i < phase1logs.length - 1; i++) {
        html += `<div class="iterate-item-nohover">${phase1logs[i]}</div>`;
      }
      html += `<div class="iterate-footer">${phase1logs[phase1logs.length - 1]}</div>`;
      html += `<div class="iterate-header">Phase 2\n${phase2logs[0]}</div>`;
      for (let i = 1; i < phase2logs.length - 1; i++) {
        html += `<div class="iterate-item" data-index="${i -1}">${phase2logs[i]}</div>`;
      }
      html += `<div class="iterate-footer">${phase2logs[phase2logs.length - 1]}</div>`;
      updateResult(html);
    } else if (state.solverMode === "pdhg") {
      const maxitPDHG = parseInt(maxitInputPDHG.value, 10);
      const pdhgIneq = (document.getElementById("pdhgIneqMode") as HTMLInputElement).checked;
      const eta = parseFloat(pdhgEtaSlider.value);
      const tau = parseFloat(pdhgTauSlider.value);
      const result = await fetchPDHG(
        state.computedLines,
        [state.objectiveVector!.x, state.objectiveVector!.y],
        pdhgIneq,
        maxitPDHG,
        eta,
        tau
      );
      const iteratesArray = result.iterations;
      const logArray = result.logs;
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
      if (state.traceEnabled && iteratesArray.length > 0) {
        // Use optimized trace buffer
        addTraceToBuffer(iteratesArray);
      }
      let html = "";
      html += `<div class="iterate-header">${logArray[0]}</div>`;
      for (let i = 1; i < logArray.length - 1; i++) {
        html += `<div class="iterate-item" data-index="${i-1}">${logArray[i]}</div>`;
      }
      if (logArray.length > 1) {
        html += `<div class="iterate-footer">${logArray[logArray.length - 1]}</div>`;
      }
      updateResult(html);
    } else {
      // Central path
      const weights = getBarrierWeights();
      const maxitCentral = parseInt(centralPathIterSlider.value, 10);
      const result = await fetchCentralPath(
        state.computedVertices,
        state.computedLines,
        [state.objectiveVector!.x, state.objectiveVector!.y],
        weights,
        maxitCentral
      );
      const iteratesArray = result.iterations;
      const logArray = result.logs;
      const tsolve = result.tsolve;
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
      
      if (state.traceEnabled && iteratesArray.length > 0) {
        if (state.rotateObjectiveMode && state.totalRotationAngle >= 2 * Math.PI + 0.9*parseFloat(objectiveAngleStepSlider.value)) {
        } else {
          // Use optimized trace buffer
          addTraceToBuffer(iteratesArray);
        }
      }
      let html = "";
      html += `<div class="iterate-header">${logArray[0]}</div>`;
      for (let i = 1; i < logArray.length; i++) {
        html += `<div class="iterate-item" data-index="${i-1}">${logArray[i]}</div>`;
      }
      if (logArray.length > 1) {
        html += `<div class="iterate-footer">Traced central path in ${Math.round(tsolve * 1000)}ms</div>`;
      }
      updateResult(html);
    }
  }

  function getBarrierWeights() {
    const items = document.querySelectorAll(".inequality-item");
    let weights: number[] = [];
    items.forEach((item) => {
      const input = item.querySelector("input");
      weights.push(input ? parseFloat(input.value) : 1);
    });
    return weights;
  }
  function adjustFontSize() {
    const container = document.getElementById("result");
    if (!container) {
      return;
    }
    if (container.querySelector("#usageTips")) {
      return;
    }

    
    const containerStyle = window.getComputedStyle(container);
    const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
    const effectiveContainerWidth = container.clientWidth - paddingLeft - paddingRight;
    
    const texts = container.querySelectorAll("div");
    if (texts.length === 0) {
      return;
    }
    
    const measurementDiv = document.createElement("div");
    measurementDiv.style.position = "absolute";
    measurementDiv.style.visibility = "hidden";
    measurementDiv.style.fontFamily = containerStyle.fontFamily;
    measurementDiv.style.fontWeight = containerStyle.fontWeight;
    measurementDiv.style.fontStyle = containerStyle.fontStyle;
    measurementDiv.style.whiteSpace = "pre-wrap";
    document.body.appendChild(measurementDiv);
    
    const baselineFontSize = 18;
    let minScaleFactor = Infinity;
    
    texts.forEach(text => {
      measurementDiv.style.fontSize = `${baselineFontSize}px`;
      measurementDiv.textContent = text.textContent;
      const measuredWidth = measurementDiv.getBoundingClientRect().width;  // adjust for padding on both sides
      const scaleFactor = (effectiveContainerWidth - 10) / measuredWidth;
      
      if (scaleFactor < minScaleFactor && scaleFactor < 4) {
        minScaleFactor = scaleFactor;
      }
    });
    const newFontSize = Math.min(24, baselineFontSize * minScaleFactor * 0.875);
    
    texts.forEach(text => {
      text.style.fontSize = `${newFontSize}px`;
    });
    
    document.body.removeChild(measurementDiv);
  }
  
  
  function updateResult(html: string) {
    resultDiv.innerHTML = html;
    document.querySelectorAll(".iterate-header, .iterate-item, .iterate-footer")
      .forEach((item) => {
        item.addEventListener("mouseenter", () => {
          state.highlightIteratePathIndex = parseInt(item.getAttribute("data-index") || "0");
          canvasManager.draw();
        });
        item.addEventListener("mouseleave", () => {
          state.highlightIteratePathIndex = null;
          canvasManager.draw();
        });
      });
    canvasManager.draw();
    adjustFontSize();
  }

  async function sendPolytope() {
    const points = state.vertices.map((pt) => [pt.x, pt.y]);
    try {
      const result = await fetchPolytope(points);
      if (result.inequalities) {
        if (!isPolygonConvex(state.vertices)) {
          (uiManager.inequalitiesDiv as HTMLElement).innerHTML = "Nonconvex";
          return;
        }
        (uiManager.inequalitiesDiv as HTMLElement).innerHTML = result.inequalities
          .slice(0, state.polygonComplete ? result.inequalities.length : result.inequalities.length - 1)
          .map(
            (ineq, index) => `
            <div class="inequality-item" data-index="${index}">
              ${ineq}<br>
              <span class="barrier-weight-container" style="display: ${
                state.barrierWeightsVisible ? "inline" : "none"
              };">
                <span style="font-family: sans-serif;">Barrier weight:</span>
                <input type="number" id="weight-${index}" value="${
              state.barrierWeights[index] !== undefined ? state.barrierWeights[index] : 1
            }" step="any" autocomplete="off" style="width:60px" />
              </span>
            </div>
          `
          )
          .join("");
        document.querySelectorAll(".inequality-item").forEach((item) => {
          item.addEventListener("mouseenter", () => {
            state.highlightIndex = parseInt(item.getAttribute("data-index") || "0");
            canvasManager.draw();
          });
          item.addEventListener("mouseleave", () => {
            state.highlightIndex = null;
            canvasManager.draw();
          });
          item.querySelectorAll('input[type="number"]').forEach((el) => {
            const inputEl = el as HTMLInputElement;
            inputEl.addEventListener("change", () => {
              const index = parseInt(inputEl.id.split("-")[1]);
              state.barrierWeights[index] = parseFloat(inputEl.value);
            });
          });
        });
        if (result.lines.length > 0) {
          (document.getElementById("subjectTo") as HTMLElement).style.display = "block";
        }
        state.computedVertices = result.vertices;
        state.computedLines = result.lines;
        uiManager.updateSolverModeButtons();
        if (state.iteratePathComputed && state.objectiveVector && state.computedLines.length > 0) {
          computePath();
        }
      } else {
        (uiManager.inequalitiesDiv as HTMLElement).textContent = "No inequalities returned.";
      }
    } catch (err) {
      console.error("Error:", err);
      (uiManager.inequalitiesDiv as HTMLElement).textContent = "Error computing inequalities.";
    }
  }

  function computeAndRotate() {
    const MIN_WAIT = 30;
    if (!isPolygonConvex(state.vertices)) {
      setTimeout(computeAndRotate, MIN_WAIT);
      return;
    }
    if (!state.rotateObjectiveMode) return;
    
    const angleStep = parseFloat(objectiveAngleStepSlider.value);
    
    const angle = Math.atan2(state.objectiveVector!.y, state.objectiveVector!.x);
    const magnitude = Math.hypot(state.objectiveVector!.x, state.objectiveVector!.y);
    
    state.objectiveVector = {
      x: magnitude * Math.cos(angle + angleStep),
      y: magnitude * Math.sin(angle + angleStep),
    };
    
    if (state.traceEnabled) {
      state.totalRotationAngle += angleStep;
    }
    
    uiManager.updateObjectiveDisplay();
    canvasManager.draw();
    
    if (state.polygonComplete && state.computedLines && state.computedLines.length > 0) {
      try {
        computePath().then(() => {
          if (state.rotateObjectiveMode) {
            setTimeout(computeAndRotate, MIN_WAIT);
          }
        }).catch((error) => {
          console.error("Error in computePath:", error);
          if (state.rotateObjectiveMode) {
            setTimeout(computeAndRotate, MIN_WAIT);
          }
        });
      } catch (error) {
        console.error("Synchronous error in computePath:", error);
        if (state.rotateObjectiveMode) {
          setTimeout(computeAndRotate, MIN_WAIT);
        }
      }
    } else {
      if (state.rotateObjectiveMode) {
        setTimeout(computeAndRotate, MIN_WAIT);
      }
    }
  }
  canvas.addEventListener("wheel", (e: { preventDefault: () => void; clientX: number; clientY: number; deltaY: number; }) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const oldScale = canvasManager.scaleFactor;
    const zoomFactor = 1.05;
    let newScale = oldScale;
    if (e.deltaY < 0) {
      newScale = oldScale * zoomFactor;
    } else {
      newScale = oldScale / zoomFactor;
    }
    newScale = Math.min(100, Math.max(0.1, newScale));
    const logical = canvasManager.toLogicalCoords(mouseX, mouseY);
    canvasManager.scaleFactor = newScale;
    canvasManager.offset.x = (mouseX - canvasManager.centerX) / (canvasManager.gridSpacing * newScale) - logical.x;
    canvasManager.offset.y = (canvasManager.centerY - mouseY) / (canvasManager.gridSpacing * newScale) - logical.y;
    canvasManager.draw();
  });

  // Manual Input Event Handlers
  // setupManualInputHandlers(canvasManager, uiManager);

  function generateShareLink() {
    const settings: Settings = {};
    switch (state.solverMode) {
      case "ipm":
        settings.alphaMax = parseFloat(alphaMaxSlider.value);
        settings.maxitIPM = parseInt(maxitInput.value, 10);
        break;
      case "pdhg":
        settings.pdhgEta = parseFloat(pdhgEtaSlider.value);
        settings.pdhgTau = parseFloat(pdhgTauSlider.value);
        settings.maxitPDHG = parseInt(maxitInputPDHG.value, 10);
        settings.pdhgIneqMode = pdhgIneqMode.checked;
        break;
      case "central":
        settings.centralPathIter = parseInt(centralPathIterSlider.value, 10);
        break;
    }
    const data: ShareState = {
      vertices: state.vertices,
      objective: state.objectiveVector,
      solverMode: state.solverMode,
      settings
    };
    const json = JSON.stringify(data);
    const crushed = JSONCrush.crush(json);
    const encoded = encodeURIComponent(crushed);
    return `${window.location.origin}${window.location.pathname}?s=${encoded}`;
  }

  function loadStateFromObject(obj: ShareState) {
    if (!obj) return;
    if (Array.isArray(obj.vertices)) {
      state.vertices = obj.vertices.map((v: PointXY) => ({ x: v.x, y: v.y }));
      state.polygonComplete = state.vertices.length > 2;
    }
    if (obj.objective) {
      state.objectiveVector = { x: obj.objective.x, y: obj.objective.y };
    }
    if (obj.solverMode) {
      state.solverMode = obj.solverMode;
    }
    const settings = obj.settings || {};
    if (settings.alphaMax !== undefined) {
      alphaMaxSlider.value = settings.alphaMax.toString();
      (document.getElementById("alphaMaxValue") as HTMLElement).textContent = parseFloat(alphaMaxSlider.value).toFixed(3);
    }
    if (settings.maxitIPM !== undefined) {
      maxitInput.value = settings.maxitIPM.toString();
    }
    if (settings.pdhgEta !== undefined) {
      pdhgEtaSlider.value = settings.pdhgEta.toString();
      (document.getElementById("pdhgEtaValue") as HTMLElement).textContent = parseFloat(pdhgEtaSlider.value).toFixed(3);
    }
    if (settings.pdhgTau !== undefined) {
      pdhgTauSlider.value = settings.pdhgTau.toString();
      (document.getElementById("pdhgTauValue") as HTMLElement).textContent = parseFloat(pdhgTauSlider.value).toFixed(3);
    }
    if (settings.maxitPDHG !== undefined) {
      maxitInputPDHG.value = settings.maxitPDHG.toString();
    }
    if (settings.pdhgIneqMode !== undefined) {
      pdhgIneqMode.checked = settings.pdhgIneqMode;
    }
    if (settings.centralPathIter !== undefined) {
      centralPathIterSlider.value = settings.centralPathIter.toString();
      centralPathIterValue.textContent = settings.centralPathIter.toString();
    }
    if (settings.objectiveAngleStep !== undefined) {
      objectiveAngleStepSlider.value = settings.objectiveAngleStep.toString();
      objectiveAngleStepValue.textContent = settings.objectiveAngleStep.toFixed(2);
    }
    uiManager.hideNullStateMessage();

    if (state.polygonComplete && state.objectiveVector) {
      (document.getElementById("maximize") as HTMLElement).style.display = "block";
      
      iteratePathButton.disabled = state.solverMode === "central";
      ipmButton.disabled = state.solverMode === "ipm";
      simplexButton.disabled = state.solverMode === "simplex";
      pdhgButton.disabled = state.solverMode === "pdhg";
      
      traceButton.disabled = false;
      animateButton.disabled = false;
      startRotateObjectiveButton.disabled = false;
      (document.getElementById("zoomButton") as HTMLButtonElement).disabled = false;
    } else {
      traceButton.disabled = true;
      animateButton.disabled = true;
      startRotateObjectiveButton.disabled = true;
    }

    (document.getElementById("ipmSettings") as HTMLElement).style.display = state.solverMode === "ipm" ? "block" : "none";
    (document.getElementById("pdhgSettings") as HTMLElement).style.display = state.solverMode === "pdhg" ? "block" : "none";
    (document.getElementById("centralPathSettings") as HTMLElement).style.display = state.solverMode === "central" ? "block" : "none";

    uiManager.updateObjectiveDisplay();
    uiManager.updateSolverModeButtons();
    canvasManager.draw();

    if (state.polygonComplete) {
      sendPolytope();
    }
  }

  return { loadStateFromObject, generateShareLink };
  
}

function setupManualInputHandlers(canvasManager: CanvasManager, uiManager: UIManager) {
  const inputModeToggle = document.getElementById("inputModeToggle") as HTMLElement;
  const manualInputControls = document.getElementById("manualInputControls") as HTMLElement;
  const applyConstraintsButton = document.getElementById("applyConstraintsButton") as HTMLElement;
  inputModeToggle.addEventListener("click", () => {
    console.log('Toggling input mode, current mode:', state.inputMode);
    if (state.inputMode === 'visual') {
      state.inputMode = 'manual';
      inputModeToggle.textContent = 'Visual Mode';
      manualInputControls.style.display = 'block';
      console.log('Switched to manual input mode');
    } else {
      state.inputMode = 'visual';
      inputModeToggle.textContent = 'Manual Input Mode';
      manualInputControls.style.display = 'none';
      console.log('Switched to visual input mode');
    }
  });

  applyConstraintsButton?.addEventListener("click", () => {
    applyManualConstraints(canvasManager, uiManager);
    applyManualConstraints(canvasManager, uiManager); // FIXME: why does it not work the first time...
  });
}

async function applyManualConstraints(canvasManager: CanvasManager, uiManager: UIManager) {
  console.log('Apply constraints button clicked');
  const constraintsInput = document.getElementById("constraintsInput") as HTMLTextAreaElement;
  const objectiveInput = document.getElementById("objectiveInput") as HTMLInputElement;
  const objectiveDirection = document.getElementById("objectiveDirection") as HTMLSelectElement;
  const constraintErrors = document.getElementById("constraintErrors") as HTMLElement;

  console.log('Constraints input:', constraintsInput.value);
  console.log('Objective input:', objectiveInput.value);

  constraintErrors.style.display = 'none';
  constraintErrors.innerHTML = '';

  try {
    const { parseConstraints, parseObjective } = await import('../utils/constraintParser');

    const constraintLines = constraintsInput.value.split('\n').filter(line => line.trim() !== '');
    const constraintResult = parseConstraints(constraintLines);

    if (!constraintResult.success) {
      constraintErrors.innerHTML = constraintResult.errors.join('<br>');
      constraintErrors.style.display = 'block';
      return;
    }

    const objectiveStr = objectiveInput.value.trim();
    let objectiveResult = null;
    if (objectiveStr) {
      const fullObjectiveStr = objectiveDirection.value + ' ' + objectiveStr;
      objectiveResult = parseObjective(fullObjectiveStr);
      if (!objectiveResult.success) {
        constraintErrors.innerHTML = 'Objective error: ' + objectiveResult.error;
        constraintErrors.style.display = 'block';
        return;
      }
    }
    state.manualConstraints = constraintLines;
    state.parsedConstraints = constraintResult.constraints as number[][];
    state.objectiveDirection = objectiveDirection.value as 'max' | 'min';
    
    if (objectiveResult) {
      state.manualObjective = objectiveStr;
      const sign = objectiveResult.direction === 'min' ? -1 : 1;
      state.objectiveVector = { x: objectiveResult.x! * sign, y: objectiveResult.y! * sign };
    }

    state.computedLines = constraintResult.constraints as number[][];
    
    const vertices = computeVerticesFromConstraints(constraintResult.constraints as number[][]);
    if (vertices.length > 0) {
      state.computedVertices = vertices;
      
      const sortedVertices = sortVerticesCounterClockwise(vertices);
      state.vertices = sortedVertices.map((v: number[]) => ({ x: v[0], y: v[1] } as PointXY));
      
      updateConstraintDisplay(constraintResult.constraints as number[][], canvasManager);
      
      const maximizeDiv = document.getElementById("maximize") as HTMLElement;
      if (objectiveResult) {
        maximizeDiv.textContent = objectiveResult.direction === 'min' ? 'minimize' : 'maximize';
        maximizeDiv.style.display = "block";
      }
      
      uiManager.updateObjectiveDisplay();
      uiManager.updateSolverModeButtons();
      canvasManager.draw();
      
      state.polygonComplete = true;
      uiManager.hideNullStateMessage();
      
      console.log('Manual constraints applied successfully');
      console.log('Vertices:', state.vertices);
    } else {
      constraintErrors.innerHTML = 'No feasible region found or unbounded region (not supported in MVP)';
      constraintErrors.style.display = 'block';
    }

  } catch (error) {
    console.error('Error applying constraints:', error);
    const msg = (error as Error).message;
    constraintErrors.innerHTML = 'Error parsing constraints: ' + msg;
    constraintErrors.style.display = 'block';
  }
}

function computeVerticesFromConstraints(constraints: number[][]) {
  const vertices = [];
  const tol = 1e-6;
  
  for (let i = 0; i < constraints.length - 1; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      const [A1, B1, C1] = constraints[i];
      const [A2, B2, C2] = constraints[j];
      const det = A1 * B2 - A2 * B1;

      if (Math.abs(det) < tol) continue;

      const x = (C1 * B2 - C2 * B1) / det;
      const y = (A1 * C2 - A2 * C1) / det;

      let feasible = true;
      for (const [A, B, C] of constraints) {
        if (A * x + B * y > C + tol) {
          feasible = false;
          break;
        }
      }

      if (feasible) {
        vertices.push([parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))]);
      }
    }
  }

  return vertices;
}

function sortVerticesCounterClockwise(vertices: number[][]) {
  if (vertices.length <= 2) return vertices;  
  const cx = vertices.reduce((sum: number, v: number[]) => sum + v[0], 0) / vertices.length;
  const cy = vertices.reduce((sum: number, v: number[]) => sum + v[1], 0) / vertices.length;
  return vertices.slice().sort((a: number[], b: number[]) => {
    const angleA = Math.atan2(a[1] - cy, a[0] - cx);
    const angleB = Math.atan2(b[1] - cy, b[0] - cx);
    return angleA - angleB;
  });
}

function updateConstraintDisplay(constraints: number[][], canvasManager: { draw: () => void; }) {
  const inequalitiesDiv = document.getElementById("inequalities") as HTMLElement;
  
  const formattedConstraints = constraints.map(([A, B, C]) => {
    return formatConstraintForDisplay(A, B, C);
  });

  inequalitiesDiv.innerHTML = formattedConstraints
    .map((ineq: string, index: number) => `
      <div class="inequality-item" data-index="${index}">
        ${ineq}
      </div>
    `)
    .join("");

  document.querySelectorAll(".inequality-item").forEach((item) => {
    item.addEventListener("mouseenter", () => {
      state.highlightIndex = parseInt(item.getAttribute("data-index") || "0");
      canvasManager.draw();
    });
    item.addEventListener("mouseleave", () => {
      state.highlightIndex = null;
      canvasManager.draw();
    });
  });

  if (constraints.length > 0) {
    (document.getElementById("subjectTo") as HTMLElement).style.display = "block";
  }
}

function formatConstraintForDisplay(A: number, B: number, C: number) {
  const formatFloat = (x: number) => x === Math.floor(x) ? x : parseFloat(x.toFixed(3));
  
  let A_disp = formatFloat(A);
  let B_disp = formatFloat(B);
  let C_disp = formatFloat(C);

  let ineq_sign = "≤";
  if (A_disp <= 0 && B_disp <= 0 && C_disp <= 0 && !(A_disp === 0 && B_disp === 0 && C_disp === 0)) {
    A_disp = -A_disp;
    B_disp = -B_disp;
    C_disp = -C_disp;
    ineq_sign = "≥";
  }

  let Ax_str = "";
  if (A_disp === 1) Ax_str = "x";
  else if (A_disp === -1) Ax_str = "-x";
  else if (A_disp !== 0) Ax_str = `${A_disp}x`;

  let By_str = "";
  if (B_disp !== 0) {
    const B_abs_val = Math.abs(B_disp);
    const B_term_val = B_abs_val === 1 ? "y" : `${B_abs_val}y`;

    if (A_disp === 0) {
      By_str = B_disp < 0 ? `-${B_term_val}` : B_term_val;
    } else {
      By_str = B_disp < 0 ? ` - ${B_term_val}` : ` + ${B_term_val}`;
    }
  }
  
  if (Ax_str === "" && By_str === "") {
    return `0 ${ineq_sign} ${C_disp}`;
  }

  return `${Ax_str}${By_str} ${ineq_sign} ${C_disp}`.trim();
}

