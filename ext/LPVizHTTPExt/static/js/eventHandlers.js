import { state } from "./state.js";
import {
  fetchPolytope,
  fetchCentralPath,
  fetchSimplex,
  fetchIPM,
  fetchPDHG,
} from "./apiClient.js";

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

  // ----- Canvas Event Listeners -----
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const logicalMouse = canvasManager.toLogicalCoords(mouseX, mouseY);
    const idx = state.vertices.findIndex(
      (v) => distance(logicalMouse, v) < 0.5
    );
    if (idx !== -1) {
      state.draggingPointIndex = idx;
      return;
    }
    if (state.polygonComplete && state.objectiveVector !== null) {
      const tip = canvasManager.toCanvasCoords(
        state.objectiveVector.x,
        state.objectiveVector.y
      );
      if (Math.hypot(mouseX - tip.x, mouseY - tip.y) < 10) {
        state.draggingObjective = true;
        return;
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (state.draggingPointIndex !== null) {
      state.vertices[state.draggingPointIndex] = canvasManager.toLogicalCoords(
        mouseX,
        mouseY
      );
      canvasManager.draw();
      return;
    }
    if (state.draggingObjective) {
      state.objectiveVector = canvasManager.toLogicalCoords(mouseX, mouseY);
      uiManager.updateObjectiveDisplay();
      canvasManager.draw();
      return;
    }
    if (!state.polygonComplete) {
      state.currentMouse = canvasManager.toLogicalCoords(mouseX, mouseY);
      canvasManager.draw();
    } else if (state.polygonComplete && state.objectiveVector === null) {
      state.currentObjective = canvasManager.toLogicalCoords(mouseX, mouseY);
      canvasManager.draw();
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (state.draggingPointIndex !== null) {
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.draggingPointIndex = null;
      sendPolytope();
    }
    if (state.draggingObjective) {
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.draggingObjective = false;
      sendPolytope();
    }
  });

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
        uiManager.updateSidebarUI();
        canvasManager.draw();
        sendPolytope();
        break;
      }
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const pt = canvasManager.toLogicalCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (!state.polygonComplete) {
      if (state.vertices.length >= 3) {
        if (distance(pt, state.vertices[0]) < 0.5) {
          state.polygonComplete = true;
          state.interiorPoint = computeCentroid(state.vertices);
          uiManager.updateSidebarUI();
          canvasManager.draw();
          sendPolytope();
          return;
        }
        if (isPointInsidePolygon(pt, state.vertices)) {
          state.polygonComplete = true;
          state.interiorPoint = pt;
          uiManager.updateSidebarUI();
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
      uiManager.updateSidebarUI();
      canvasManager.draw();
      sendPolytope();
    } else if (state.polygonComplete && state.objectiveVector === null) {
      state.historyStack.push({
        vertices: JSON.parse(JSON.stringify(state.vertices)),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
      });
      state.objectiveVector = state.currentObjective || pt;
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
          uiManager.updateSidebarUI();
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
          uiManager.updateSidebarUI();
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
  });
  ipmButton.addEventListener("click", () => {
    state.solverMode = "ipm";
    ipmButton.disabled = true;
    iteratePathButton.disabled = false;
    simplexButton.disabled = false;
    pdhgButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "block";
    document.getElementById("pdhgSettings").style.display = "none";
  });
  simplexButton.addEventListener("click", () => {
    state.solverMode = "simplex";
    simplexButton.disabled = true;
    ipmButton.disabled = false;
    iteratePathButton.disabled = false;
    pdhgButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "none";
    document.getElementById("pdhgSettings").style.display = "none";
  });
  pdhgButton.addEventListener("click", () => {
    state.solverMode = "pdhg";
    pdhgButton.disabled = true;
    simplexButton.disabled = false;
    ipmButton.disabled = false;
    iteratePathButton.disabled = false;
    document.getElementById("ipmSettings").style.display = "none";
    document.getElementById("pdhgSettings").style.display = "block";
  });

  // Input event listeners for IPM and PDHG settings
  const alphaMaxSlider = document.getElementById("alphaMaxSlider");
  const pdhgEtaSlider = document.getElementById("pdhgEtaSlider");
  const pdhgTauSlider = document.getElementById("pdhgTauSlider");
  const maxitInput = document.getElementById("maxitInput");
  const maxitInputPDHG = document.getElementById("maxitInputPDHG");
  const objectiveAngleStepSlider = document.getElementById("objectiveAngleStepSlider");
  const objectiveAngleStepValue = document.getElementById("objectiveAngleStepValue");

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
  objectiveAngleStepSlider.addEventListener("input", () => {
    objectiveAngleStepValue.textContent = parseFloat(objectiveAngleStepSlider.value).toFixed(2);
  });

  // Trace/Solve Button
  const traceButton = document.getElementById("traceButton");
  traceButton.addEventListener("click", () => {
    computePath();
    state.iteratePathComputed = true;
    document.getElementById("terminal-container").style.display = "block";
  });

  // Rotate Objective Buttons
  const startRotateObjectiveButton = document.getElementById("startRotateObjectiveButton");
  const stopRotateObjectiveButton = document.getElementById("stopRotateObjectiveButton");
  const objectiveRotationSettings = document.getElementById("objectiveRotationSettings");

  startRotateObjectiveButton.addEventListener("click", () => {
    state.rotateObjectiveMode = true;
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
    newWidth = Math.max(200, Math.min(newWidth, 600));
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
    if (el && el.classList.contains("central-path-item")) {
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
      updateResult(iteratesArray, logArray);
    } else if (state.solverMode === "simplex") {
      const result = await fetchSimplex(
        state.computedLines,
        [state.objectiveVector.x, state.objectiveVector.y]
      );
      const iteratesArray = result.map((entry) => entry);
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
      updateResult(iteratesArray);
    } else if (state.solverMode === "pdhg") {
      const maxitPDHG = parseInt(maxitInputPDHG.value, 10);
      const eta = parseFloat(pdhgEtaSlider.value);
      const tau = parseFloat(pdhgTauSlider.value);
      const result = await fetchPDHG(
        state.computedLines,
        [state.objectiveVector.x, state.objectiveVector.y],
        maxitPDHG,
        eta,
        tau
      );
      const iteratesArray = result.map((entry) => entry);
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
      updateResult(iteratesArray);
    } else {
      // Central path
      const weights = getBarrierWeights();
      const result = await fetchCentralPath(
        state.computedLines,
        [state.objectiveVector.x, state.objectiveVector.y],
        weights
      );
      const iteratesArray = result.central_path.map((entry) => entry[0]);
      state.originalIteratePath = [...iteratesArray];
      state.iteratePath = iteratesArray;
      updateResult(iteratesArray);
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
    measurementDiv.style.whiteSpace = "nowrap";
    measurementDiv.style.fontFamily = containerStyle.fontFamily;
    measurementDiv.style.fontWeight = containerStyle.fontWeight;
    measurementDiv.style.fontStyle = containerStyle.fontStyle;
    document.body.appendChild(measurementDiv);
    
    const baselineFontSize = 18;
    let minScaleFactor = Infinity;
    
    texts.forEach(text => {
      measurementDiv.style.fontSize = `${baselineFontSize}px`;
      measurementDiv.textContent = text.textContent;
      const measuredWidth = measurementDiv.getBoundingClientRect().width;
      const scaleFactor = effectiveContainerWidth / measuredWidth;
      
      if (scaleFactor < minScaleFactor && scaleFactor < 1) {
        minScaleFactor = scaleFactor;
      }
    });
    const newFontSize = baselineFontSize * minScaleFactor * 0.9;
    
    texts.forEach(text => {
      text.style.fontSize = `${newFontSize}px`;
    });
    
    document.body.removeChild(measurementDiv);
  }
  
  
  function updateResult(iteratesArray, logArray) {
    let html = "";
    if (logArray && logArray.length > 0) {
      html += `<div class="central-path-header">${logArray[0]}</div>`;
      for (let i = 1; i < logArray.length - 1; i++) {
        html += `<div class="central-path-item" data-index="${i-1}">${logArray[i]}</div>`;
      }
      if (logArray.length > 1) {
        html += `<div class="central-path-footer">${logArray[logArray.length - 1]}</div>`;
      }
    } else if (iteratesArray) {
      html = iteratesArray
        .map((entry, i) => {
          const x = parseFloat(entry[0]).toFixed(2);
          const y = parseFloat(entry[1]).toFixed(2);
          return `<div class="central-path-item" data-index="${i}">(${x}, ${y})</div>`;
        })
        .join("");
    }
    resultDiv.innerHTML = html;
    document.querySelectorAll(".central-path-header, .central-path-item, .central-path-footer")
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
}
