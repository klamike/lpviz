import { state } from "../state/state.js";
import {
  fetchPolytope,
  fetchCentralPath,
  fetchSimplex,
  fetchIPM,
  fetchPDHG,
} from "../services/apiClient.js";

export function setupEventHandlers(canvasManager, uiManager) {
  const canvas = canvasManager.canvas;

  const distance = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const computeCentroid = (pts) => ({
    x: pts.reduce((s, pt) => s + pt.x, 0) / pts.length,
    y: pts.reduce((s, pt) => s + pt.y, 0) / pts.length,
  });
  const isPolygonConvex = (pts) => {
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
  const isPointInsidePolygon = (point, poly) => {
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
  const isPointNearSegment = (point, v1, v2) => {
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
  function handleDragStart(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const logicalCoords = canvasManager.toLogicalCoords(localX, localY);

    if (!state.polygonComplete) {
      const idx = state.vertices.findIndex(
        (v) => distance(logicalCoords, v) < 0.5
      );
      if (idx !== -1) {
        state.draggingPointIndex = idx;
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
        state.draggingPointIndex = idx;
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

  function handleDragMove(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

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
      document.getElementById("unzoomButton").disabled = false;
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
  canvas.addEventListener("mousedown", (e) => {
    if (state.is3DMode && e.shiftKey) {
      state.isRotatingCamera = true;
      state.lastRotationMouse = { x: e.clientX, y: e.clientY };
      return;
    }
    handleDragStart(e.clientX, e.clientY);
  });

  canvas.addEventListener("mousemove", (e) => {
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
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) { // Handle single touch for dragging
      const touch = e.touches[0];
      handleDragStart(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) { 
      // Only prevent default if a drag/pan is actually happening
      if (state.isPanning || state.draggingPointIndex !== null || state.draggingObjective) {
        e.preventDefault(); // Prevent page scroll during drag
      }
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    }
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    // touchend doesn't have e.touches for the ended touch, 
    // but handleDragEnd() relies on state flags, not coordinates.
    // e.changedTouches[0] could provide the last point if needed.
    if (state.isPanning || state.draggingPointIndex !== null || state.draggingObjective) {
        e.preventDefault(); // Prevent potential click events after drag
    }
    handleDragEnd();
  }, { passive: false });

  canvas.addEventListener("dblclick", (e) => {
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
  canvas.addEventListener("click", (e) => {
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
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.objectiveVector = state.currentObjective || pt;
      document.getElementById("maximize").style.display = "block";
      document.getElementById("ipmButton").disabled = false;
      document.getElementById("simplexButton").disabled = false;
      document.getElementById("pdhgButton").disabled = false;
      document.getElementById("iteratePathButton").disabled = true;
      document.getElementById("traceButton").disabled = false;
      document.getElementById("animateButton").disabled = false;
      document.getElementById("startRotateObjectiveButton").disabled = false;
      document.getElementById("zoomButton").disabled = false;
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
    canvas.focus();
  });

  // ----- UI Button Handlers -----
  uiManager.zoomButton.addEventListener("click", () => {
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
      const sidebarWidth = document.getElementById("sidebar").offsetWidth;
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

  uiManager.unzoomButton.addEventListener("click", () => {
    canvasManager.scaleFactor = 1;
    canvasManager.offset.x = 0;
    canvasManager.offset.y = 0;
    canvasManager.draw();
    uiManager.updateZoomButtonsState(canvasManager);
  });
  uiManager.toggle3DButton.addEventListener("click", () => {
    state.is3DMode = !state.is3DMode;
    uiManager.update3DButtonState();
    canvasManager.draw();
  });
  uiManager.zScaleSlider.addEventListener("input", () => {
    state.zScale = parseFloat(uiManager.zScaleSlider.value);
    uiManager.updateZScaleValue();
    if (state.is3DMode) {
      canvasManager.draw();
    }
  });

  // Solver Mode Buttons
  const iteratePathButton = document.getElementById("iteratePathButton");
  const ipmButton = document.getElementById("ipmButton");
  const simplexButton = document.getElementById("simplexButton");
  const pdhgButton = document.getElementById("pdhgButton");

  iteratePathButton.addEventListener("click", () => {
    state.solverMode = "central";
    iteratePathButton.disabled = true;
    ipmButton.disabled = false;
    simplexButton.disabled = false;
    pdhgButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "none";
    document.getElementById("pdhgSettings").style.display = "none";
    document.getElementById("centralPathSettings").style.display = "block";
  });
  ipmButton.addEventListener("click", () => {
    state.solverMode = "ipm";
    ipmButton.disabled = true;
    iteratePathButton.disabled = false;
    simplexButton.disabled = false;
    pdhgButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "block";
    document.getElementById("pdhgSettings").style.display = "none";
    document.getElementById("centralPathSettings").style.display = "none";
  });
  simplexButton.addEventListener("click", () => {
    state.solverMode = "simplex";
    simplexButton.disabled = true;
    ipmButton.disabled = false;
    iteratePathButton.disabled = false;
    pdhgButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "none";
    document.getElementById("pdhgSettings").style.display = "none";
    document.getElementById("centralPathSettings").style.display = "none";
  });
  pdhgButton.addEventListener("click", () => {
    state.solverMode = "pdhg";
    pdhgButton.disabled = true;
    simplexButton.disabled = false;
    ipmButton.disabled = false;
    iteratePathButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "none";
    document.getElementById("pdhgSettings").style.display = "block";
    document.getElementById("centralPathSettings").style.display = "none";
  });

  // Input event listeners for IPM and PDHG settings
  const alphaMaxSlider = document.getElementById("alphaMaxSlider");
  const pdhgEtaSlider = document.getElementById("pdhgEtaSlider");
  const pdhgTauSlider = document.getElementById("pdhgTauSlider");
  const maxitInput = document.getElementById("maxitInput");
  const maxitInputPDHG = document.getElementById("maxitInputPDHG");
  const pdhgIneqMode = document.getElementById("pdhgIneqMode");
  const objectiveAngleStepSlider = document.getElementById("objectiveAngleStepSlider");
  const objectiveAngleStepValue = document.getElementById("objectiveAngleStepValue");
  const centralPathIterSlider = document.getElementById("centralPathIterSlider");
  const centralPathIterValue = document.getElementById("centralPathIterValue");

  alphaMaxSlider.addEventListener("input", () => {
    document.getElementById("alphaMaxValue").textContent = parseFloat(alphaMaxSlider.value).toFixed(3);
    if (state.solverMode === "ipm") computePath();
  });
  pdhgEtaSlider.addEventListener("input", () => {
    document.getElementById("pdhgEtaValue").textContent = parseFloat(pdhgEtaSlider.value).toFixed(3);
    if (state.solverMode === "pdhg") computePath();
  });
  pdhgTauSlider.addEventListener("input", () => {
    document.getElementById("pdhgTauValue").textContent = parseFloat(pdhgTauSlider.value).toFixed(3);
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
  });
  centralPathIterSlider.addEventListener("input", () => {
    centralPathIterValue.textContent = centralPathIterSlider.value;
    if (state.solverMode === "central") computePath();
  });


  // Trace/Solve Button
  const traceButton = document.getElementById("traceButton");
  traceButton.addEventListener("click", () => {
    computePath();
    state.iteratePathComputed = true;
    // document.getElementById("terminal-container").style.display = "initial";
  });

  // Rotate Objective Buttons
  const startRotateObjectiveButton = document.getElementById("startRotateObjectiveButton");
  const stopRotateObjectiveButton = document.getElementById("stopRotateObjectiveButton");
  const objectiveRotationSettings = document.getElementById("objectiveRotationSettings");

  startRotateObjectiveButton.addEventListener("click", () => {
    state.rotateObjectiveMode = true;
    // document.getElementById("terminal-container").style.display = "initial";
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
    objectiveRotationSettings.style.display = "none";
    startRotateObjectiveButton.disabled = false;
    stopRotateObjectiveButton.disabled = true;
  });

  // Animate Button
  const animateButton = document.getElementById("animateButton");
  const replaySpeedSlider = document.getElementById("replaySpeedSlider");
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
    state.animationIntervalId = setInterval(() => {
      if (currentIndex >= iteratesToAnimate.length) {
        clearInterval(state.animationIntervalId);
        state.animationIntervalId = null;
        return;
      }
      state.iteratePath.push(iteratesToAnimate[currentIndex]);
      state.highlightIteratePathIndex = currentIndex;
      currentIndex++;
      canvasManager.draw();
    }, intervalTime);
  });

  // Sidebar Resize
  const sidebar = document.getElementById("sidebar");
  const handle = document.getElementById("sidebarHandle");
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
  let cpCurrentHovered = null;
  const resultDiv = document.getElementById("result");
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
        cpCurrentHovered = el;
      }
    } else if (cpCurrentHovered) {
      cpCurrentHovered.classList.remove("hover");
      cpCurrentHovered.dispatchEvent(new Event("mouseleave", { bubbles: true }));
      cpCurrentHovered = null;
    }
  }

  resultDiv.addEventListener("scroll", updateHoverState);

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
        [state.objectiveVector.x, state.objectiveVector.y],
        getBarrierWeights(),
        alphaMax,
        maxit
      );
      const sol = result.iterates.solution;
      const logArray = sol.log;
      const iteratesArray = sol.x.map((val, i) => sol.x[i]);
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
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
        [state.objectiveVector.x, state.objectiveVector.y]
      );
      const iteratesArray = result[0].map((entry) => entry);
      const phase1logs = result[1][0];
      const phase2logs = result[1][1];
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
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
      const pdhgIneq = document.getElementById("pdhgIneqMode").checked;
      const eta = parseFloat(pdhgEtaSlider.value);
      const tau = parseFloat(pdhgTauSlider.value);
      const result = await fetchPDHG(
        state.computedLines,
        [state.objectiveVector.x, state.objectiveVector.y],
        pdhgIneq,
        maxitPDHG,
        eta,
        tau
      );
      const iteratesArray = result[0].map((entry) => entry);
      const logArray = result[1];
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
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
        [state.objectiveVector.x, state.objectiveVector.y],
        weights,
        maxitCentral
      );
      const iteratesArray = result.central_path.map((entry) => entry);
      const logArray = result.logs;
      const tsolve = result.tsolve;
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
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
    let weights = [];
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
  
  
  function updateResult(html) {
    resultDiv.innerHTML = html;
    document.querySelectorAll(".iterate-header, .iterate-item, .iterate-footer")
      .forEach((item) => {
        item.addEventListener("mouseenter", () => {
          state.highlightIteratePathIndex = parseInt(item.getAttribute("data-index"));
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
          uiManager.inequalitiesDiv.innerHTML = "Nonconvex";
          return;
        }
        uiManager.inequalitiesDiv.innerHTML = result.inequalities
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
            state.highlightIndex = parseInt(item.getAttribute("data-index"));
            canvasManager.draw();
          });
          item.addEventListener("mouseleave", () => {
            state.highlightIndex = null;
            canvasManager.draw();
          });
          item.querySelectorAll('input[type="number"]').forEach((input) => {
            input.addEventListener("change", () => {
              const index = parseInt(input.id.split("-")[1]);
              state.barrierWeights[index] = parseFloat(input.value);
            });
          });
        });
        if (result.lines.length > 0) {
          document.getElementById("subjectTo").style.display = "block";
        }
        state.computedVertices = result.vertices;
        state.computedLines = result.lines;
        uiManager.updateSolverModeButtons();
        if (state.iteratePathComputed && state.objectiveVector && state.computedLines.length > 0) {
          computePath();
        }
      } else {
        uiManager.inequalitiesDiv.textContent = "No inequalities returned.";
      }
    } catch (err) {
      console.error("Error:", err);
      uiManager.inequalitiesDiv.textContent = "Error computing inequalities.";
    }
  }

  function computeAndRotate() {
    const MIN_WAIT = 30;
    if (!isPolygonConvex(state.vertices)) {
      setTimeout(computeAndRotate, MIN_WAIT);
      return;
    }
    if (!state.rotateObjectiveMode) return;
    const angle = Math.atan2(state.objectiveVector.y, state.objectiveVector.x);
    const magnitude = Math.hypot(state.objectiveVector.x, state.objectiveVector.y);
    const angleStep = parseFloat(objectiveAngleStepSlider.value);
    state.objectiveVector = {
      x: magnitude * Math.cos(angle + angleStep),
      y: magnitude * Math.sin(angle + angleStep),
    };
    uiManager.updateObjectiveDisplay();
    canvasManager.draw();
    if (state.polygonComplete && state.computedLines && state.computedLines.length > 0) {
      computePath().then(() => {
        if (state.rotateObjectiveMode) setTimeout(computeAndRotate, MIN_WAIT);
      });
    } else {
      if (state.rotateObjectiveMode) setTimeout(computeAndRotate, MIN_WAIT);
    }
  }
  canvas.addEventListener("wheel", (e) => {
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
  
}

