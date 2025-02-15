(() => {
  const canvas = document.getElementById('gridCanvas');
  const ctx = canvas.getContext('2d');
  const inequalitiesDiv = document.getElementById('inequalities');
  const zoomButton = document.getElementById('zoomButton');
  const unzoomButton = document.getElementById('unzoomButton');
  const traceButton = document.getElementById('traceButton');
  const analyticResultDiv = document.getElementById('analyticResult');
  const objectiveDisplay = document.getElementById('objectiveDisplay');
  const centralPathButton = document.getElementById('centralPathButton');
  const ipmButton = document.getElementById('ipmButton');
  const simplexButton = document.getElementById('simplexButton');
  const ipmSettingsDiv = document.getElementById('ipmSettings');

  const startRotateObjectiveButton = document.getElementById('startRotateObjectiveButton');
  const stopRotateObjectiveButton = document.getElementById('stopRotateObjectiveButton');
  const objectiveRotationSettings = document.getElementById('objectiveRotationSettings');
  const objectiveAngleStepSlider = document.getElementById('objectiveAngleStepSlider');
  const objectiveAngleStepValue = document.getElementById('objectiveAngleStepValue');

  let centerX, centerY;
  const gridSpacing = 20;
  let offset = { x: 0, y: 0 };
  let scaleFactor = 1;
  let vertices = [];
  let currentMouse = null;
  let polygonComplete = false;
  let interiorPoint = null;
  let objectiveVector = null;
  let currentObjective = null;
  let computedVertices = [];
  let computedLines = [];
  let snapToGrid = false;
  let highlightIndex = null;
  let analyticCenter = null;
  let centralPath = [];
  let centralPathComputed = false;
  let historyStack = [];
  let redoStack = [];
  let highlightCentralPathIndex = null;
  let isCentralPathComputing = false;
  let rotateObjectiveMode = false;
  let barrierWeightsVisible = false;
  let draggingPointIndex = null;
  let draggingObjective = false;
  let barrierWeights = [];
  let solverMode = "central";

  const distance = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const computeCentroid = pts =>
  ({
    x: pts.reduce((s, pt) => s + pt.x, 0) / pts.length,
    y: pts.reduce((s, pt) => s + pt.y, 0) / pts.length
  });
  const isPolygonConvex = pts => {
    if (pts.length < 3) return true;
    let prevCross = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const p2 = pts[(i + 2) % pts.length];
      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
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
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };
  const isPointNearSegment = (point, v1, v2) => {
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const len2 = dx * dx + dy * dy;
    const t = ((point.x - v1.x) * dx + (point.y - v1.y) * dy) / len2;
    if (t < 0 || t > 1) return false;
    const proj = { x: v1.x + t * dx, y: v1.y + t * dy };
    const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
    return dist < 0.5;
  };
  const toLogicalCoords = (x, y) => {
    let logical = {
      x: (x - centerX) / (gridSpacing * scaleFactor) - offset.x,
      y: (centerY - y) / (gridSpacing * scaleFactor) - offset.y
    };
    if (snapToGrid) {
      logical.x = Math.round(logical.x);
      logical.y = Math.round(logical.y);
    }
    return logical;
  };
  const toCanvasCoords = (x, y) =>
  ({
    x: centerX + (x + offset.x) * gridSpacing * scaleFactor,
    y: centerY - (y + offset.y) * gridSpacing * scaleFactor
  });

  const updateSidebarUI = () => {
    const uiContainer = document.getElementById('uiContainer');
    const nullStateMessage = document.getElementById('nullStateMessage');
    if (vertices.length === 0) {
      uiContainer.style.display = 'none';
      nullStateMessage.style.display = 'block';
    } else {
      uiContainer.style.display = 'block';
      nullStateMessage.style.display = 'none';
    }
  };
  const updateZoomButtonsState = () => {
    if (scaleFactor === 1 && offset.x === 0 && offset.y === 0) {
      unzoomButton.disabled = true;
      zoomButton.disabled = false;
    } else {
      unzoomButton.disabled = false;
      zoomButton.disabled = true;
    }
  };
  const updateObjectiveDisplay = () => {
    if (objectiveVector) {
      const a = Math.round(objectiveVector.x * 1000) / 1000;
      const b = Math.round(objectiveVector.y * 1000) / 1000;
      objectiveDisplay.classList.add('objective-item');
      objectiveDisplay.innerHTML = `Max ${a}x ${b >= 0 ? "+ " + b + "y" : "- " + (-b) + "y"}`;
    } else {
      objectiveDisplay.classList.remove('objective-item');
      objectiveDisplay.innerHTML = "";
    }
  };

  const saveState = () => {
    historyStack.push({
      vertices: JSON.parse(JSON.stringify(vertices)),
      objectiveVector: objectiveVector ? { ...objectiveVector } : null
    });
    redoStack = [];
  };
  const undo = () => {
    if (historyStack.length) {
      const lastState = historyStack.pop();
      redoStack.push({
        vertices: JSON.parse(JSON.stringify(vertices)),
        objectiveVector: objectiveVector ? { ...objectiveVector } : null
      });
      vertices = lastState.vertices;
      objectiveVector = lastState.objectiveVector;
      updateSidebarUI();
      draw();
      sendPolytope();
    }
  };
  const redo = () => {
    if (redoStack.length) {
      const nextState = redoStack.pop();
      historyStack.push({
        vertices: JSON.parse(JSON.stringify(vertices)),
        objectiveVector: objectiveVector ? { ...objectiveVector } : null
      });
      vertices = nextState.vertices;
      objectiveVector = nextState.objectiveVector;
      updateSidebarUI();
      draw();
      sendPolytope();
    }
  };
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
    if (e.key.toLowerCase() === 's') snapToGrid = !snapToGrid;
  });

  const drawGrid = () => {
    const width = window.innerWidth, height = window.innerHeight;
    const originX = centerX + offset.x * gridSpacing * scaleFactor;
    const originY = centerY - offset.y * gridSpacing * scaleFactor;
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    for (let x = originX; x <= width; x += gridSpacing * scaleFactor) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let x = originX; x >= 0; x -= gridSpacing * scaleFactor) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = originY; y <= height; y += gridSpacing * scaleFactor) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let y = originY; y >= 0; y -= gridSpacing * scaleFactor) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#707070';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();
  };

  const drawPolygon = () => {
    if (vertices.length === 0) return;
    if (polygonComplete) {
      vertices.forEach((v, i) => {
        const cp1 = toCanvasCoords(v.x, v.y);
        const cp2 = toCanvasCoords(vertices[(i + 1) % vertices.length].x, vertices[(i + 1) % vertices.length].y);
        ctx.beginPath();
        ctx.strokeStyle = highlightIndex === i ? 'red' : 'black';
        ctx.lineWidth = highlightIndex === i ? 4 : 2;
        ctx.moveTo(cp1.x, cp1.y);
        ctx.lineTo(cp2.x, cp2.y);
        ctx.stroke();
      });
      vertices.forEach(pt => {
        const cp = toCanvasCoords(pt.x, pt.y);
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
      if (!isPolygonConvex(vertices)) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.beginPath();
        const start = toCanvasCoords(vertices[0].x, vertices[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < vertices.length; i++) {
          const cp = toCanvasCoords(vertices[i].x, vertices[i].y);
          ctx.lineTo(cp.x, cp.y);
        }
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      const start = toCanvasCoords(vertices[0].x, vertices[0].y);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < vertices.length; i++) {
        const cp = toCanvasCoords(vertices[i].x, vertices[i].y);
        ctx.lineTo(cp.x, cp.y);
      }
      if (currentMouse) {
        const rbEnd = toCanvasCoords(currentMouse.x, currentMouse.y);
        ctx.lineTo(rbEnd.x, rbEnd.y);
      }
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.stroke();
      vertices.forEach(pt => {
        const cp = toCanvasCoords(pt.x, pt.y);
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  };

  const drawAnalyticCenter = () => {
    if (analyticCenter) {
      const ac = toCanvasCoords(analyticCenter[0], analyticCenter[1]);
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(ac.x, ac.y, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const drawObjective = () => {
    const target = objectiveVector ?? (polygonComplete && currentObjective ? currentObjective : null);
    if (target) {
      const origin = toCanvasCoords(0, 0);
      const end = toCanvasCoords(target.x, target.y);
      ctx.strokeStyle = 'green';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
      const headLength = 10;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6),
        end.y - headLength * Math.sin(angle + Math.PI / 6));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6),
        end.y - headLength * Math.sin(angle - Math.PI / 6));
      ctx.stroke();
    }
  };

const drawStar = (ctx, cx, cy, spikes, outerRadius, innerRadius, fillStyle) => {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
};

const drawCentralPath = () => {
  if (centralPath && centralPath.length > 0) {
    ctx.strokeStyle = 'purple';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const start = toCanvasCoords(centralPath[0][0][0], centralPath[0][0][1]);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < centralPath.length; i++) {
      const pt = toCanvasCoords(centralPath[i][0][0], centralPath[i][0][1]);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    centralPath.forEach((entry, i) => {
      const cp = toCanvasCoords(entry[0][0], entry[0][1]);
      if (i === centralPath.length - 1) {
        drawStar(ctx, cp.x, cp.y, 5, 8, 4, 'green');
      } else {
        ctx.beginPath();
        ctx.fillStyle = highlightCentralPathIndex === i ? 'green' : 'purple';
        ctx.arc(cp.x, cp.y, highlightCentralPathIndex === i ? 5 : 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }
};


  const draw = () => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawGrid();
    drawPolygon();
    drawAnalyticCenter();
    drawObjective();
    drawCentralPath();
  };

  zoomButton.addEventListener('click', () => {
    if (vertices.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      vertices.forEach(v => {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      });
      const polyWidth = maxX - minX;
      const polyHeight = maxY - minY;
      const centroid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

      offset.x = -centroid.x;
      offset.y = -centroid.y;

      const padding = 50;
      const sidebarWidth = document.getElementById('sidebar').offsetWidth;
      const availWidth = (window.innerWidth - sidebarWidth) - 2 * padding;
      const availHeight = window.innerHeight - 2 * padding;

      if (polyWidth > 0 && polyHeight > 0) {
        scaleFactor = Math.min(availWidth / (polyWidth * gridSpacing),
          availHeight / (polyHeight * gridSpacing));
      }

      centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
      centerY = window.innerHeight / 2;

      draw();
      updateZoomButtonsState();
      updateSolverModeButtons();
    }
  });
  unzoomButton.addEventListener('click', () => {
    scaleFactor = 1;
    offset.x = 0;
    offset.y = 0;
    draw();
    updateZoomButtonsState();
    updateSolverModeButtons();
  });
  centralPathButton.addEventListener('click', () => {
    solverMode = "central";
    centralPathButton.disabled = true;
    ipmButton.disabled = false;
    simplexButton.disabled = false;
    ipmSettingsDiv.style.display = 'none';
  });
  ipmButton.addEventListener('click', () => {
    solverMode = "ipm";
    ipmButton.disabled = true;
    centralPathButton.disabled = false;
    simplexButton.disabled = false;
    ipmSettingsDiv.style.display = 'block';
  });
  simplexButton.addEventListener('click', () => {
    solverMode = "simplex";
    simplexButton.disabled = true;
    ipmButton.disabled = false;
    centralPathButton.disabled = false;
    ipmSettingsDiv.style.display = 'none';
  });

  const updateSolverModeButtons = () => {
    if (!computedLines || computedLines.length === 0) {
      centralPathButton.disabled = true;
      ipmButton.disabled = true;
      simplexButton.disabled = true;
    } else {
      if (solverMode !== "central") centralPathButton.disabled = false;
      if (solverMode !== "ipm") ipmButton.disabled = false;
      if (solverMode !== "simplex") simplexButton.disabled = false;
    }
  };

  document.getElementById('alphaMaxSlider').addEventListener('input', function () {
    document.getElementById('alphaMaxValue').textContent = parseFloat(this.value).toFixed(3);
  });
  objectiveAngleStepSlider.addEventListener('input', function () {
    objectiveAngleStepValue.textContent = parseFloat(this.value).toFixed(2);
  });
  canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const logicalMouse = toLogicalCoords(mouseX, mouseY);
    const idx = vertices.findIndex(v => distance(logicalMouse, v) < 0.5);
    if (idx !== -1) {
      draggingPointIndex = idx;
      return;
    }
    if (polygonComplete && objectiveVector !== null) {
      const tip = toCanvasCoords(objectiveVector.x, objectiveVector.y);
      if (Math.hypot(mouseX - tip.x, mouseY - tip.y) < 10) {
        draggingObjective = true;
        return;
      }
    }
  });
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (draggingPointIndex !== null) {
      vertices[draggingPointIndex] = toLogicalCoords(mouseX, mouseY);
      draw();
      return;
    }
    if (draggingObjective) {
      objectiveVector = toLogicalCoords(mouseX, mouseY);
      updateObjectiveDisplay();
      draw();
      return;
    }
    if (!polygonComplete) {
      currentMouse = toLogicalCoords(mouseX, mouseY);
      draw();
    } else if (polygonComplete && objectiveVector === null) {
      currentObjective = toLogicalCoords(mouseX, mouseY);
      draw();
    }
  });
  canvas.addEventListener('mouseup', () => {
    if (draggingPointIndex !== null) {
      saveState();
      draggingPointIndex = null;
      sendPolytope();
    }
    if (draggingObjective) {
      saveState();
      draggingObjective = false;
      sendPolytope();
    }
  });
  canvas.addEventListener('dblclick', e => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const logicalMouse = toLogicalCoords(mouseX, mouseY);

    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      if (isPointNearSegment(logicalMouse, v1, v2)) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const len = Math.hypot(dx, dy);
        const normal = { x: -dy / len, y: dx / len };
        // Adjust the new point slightly along the normal direction.
        const newPoint = { x: logicalMouse.x - normal.x * 0.1, y: logicalMouse.y - normal.y * 0.1 };
        saveState();
        vertices.splice(i + 1, 0, newPoint);
        updateSidebarUI();
        draw();
        sendPolytope();
        break;
      }
    }
  });

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const pt = toLogicalCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (!polygonComplete) {
      if (vertices.length >= 3) {
        if (distance(pt, vertices[0]) < 0.5) {
          polygonComplete = true;
          interiorPoint = computeCentroid(vertices);
          updateSidebarUI();
          draw();
          sendPolytope();
          return;
        }
        if (isPointInsidePolygon(pt, vertices)) {
          polygonComplete = true;
          interiorPoint = pt;
          updateSidebarUI();
          draw();
          sendPolytope();
          return;
        }
      }
      const tentative = [...vertices, pt];
      if (tentative.length >= 3 && !isPolygonConvex(tentative)) {
        alert("Adding this vertex would make the polygon nonconvex. Please choose another point.");
        return;
      }
      saveState();
      vertices.push(pt);
      updateSidebarUI();
      draw();
      sendPolytope();
    } else if (polygonComplete && objectiveVector === null) {
      saveState();
      objectiveVector = currentObjective ?? pt;
      updateObjectiveDisplay();
      draw();
    }
  });

  const sendPolytope = () => {
    const data = {
      points: vertices.map(pt => [pt.x, pt.y]),
      interior: interiorPoint ? [interiorPoint.x, interiorPoint.y] : null
    };
    fetch('/polytope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(res => res.json())
      .then(result => {
        if (result.inequalities) {
          if (!isPolygonConvex(vertices)) {
            inequalitiesDiv.innerHTML = "Nonconvex";
            return;
          }
          inequalitiesDiv.innerHTML = result.inequalities
            .slice(0, polygonComplete ? result.inequalities.length : result.inequalities.length - 1)
            .map((ineq, index) => {
              const currentWeight = barrierWeights[index] !== undefined ? barrierWeights[index] : 1;
              return `
              <div class="inequality-item" data-index="${index}">
                ${ineq}<br>
                <span class="barrier-weight-container" style="display: ${barrierWeightsVisible ? "inline" : "none"};">
                  <span style="font-family: sans-serif;">Barrier weight:</span>
                  <input type="number" id="weight-${index}" value="${currentWeight}" step="any" style="width:60px" />
                </span>
              </div>
              `;
            })
            .join('');
          document.querySelectorAll('.inequality-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
              highlightIndex = parseInt(item.getAttribute('data-index'));
              draw();
            });
            document.querySelectorAll('input[type="number"]').forEach(input => {
              input.addEventListener('change', () => {
                const index = parseInt(input.id.split('-')[1]);
                barrierWeights[index] = parseFloat(input.value);
              });
            });
            item.addEventListener('mouseleave', () => {
              highlightIndex = null;
              draw();
            });
          });
        } else {
          inequalitiesDiv.textContent = "No inequalities returned.";
        }
        computedVertices = result.vertices;
        computedLines = result.lines;
        updateSolverModeButtons();
        if (centralPathComputed && objectiveVector && computedLines.length > 0) {
          computePath();
        }
      })
      .catch(err => {
        console.error('Error:', err);
        inequalitiesDiv.textContent = "Error computing inequalities.";
      });
  };

  const computeCentralPath = () => {
    if (isCentralPathComputing) return Promise.resolve();
    isCentralPathComputing = true;
    if (!isPolygonConvex(vertices)) {
      analyticResultDiv.innerHTML = "Nonconvex";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    if (!computedLines || computedLines.length === 0) {
      analyticResultDiv.innerHTML = "No computed lines available.";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    if (!objectiveVector) {
      analyticResultDiv.innerHTML = "Objective vector not defined.";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    const weights = Array.from(document.querySelectorAll('.inequality-item')).map(item => {
      const input = item.querySelector("input");
      return input ? parseFloat(input.value) : 1;
    });
    return fetch('/trace_central_path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: computedLines,
        objective: [objectiveVector.x, objectiveVector.y],
        weights: weights,
      })
    })
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          analyticResultDiv.innerHTML = "Error: " + result.error;
          isCentralPathComputing = false;
          return;
        }
        centralPath = result.central_path;
        analyticResultDiv.innerHTML = centralPath.map((entry, i, arr) => {
          const [point, mu] = entry;
          const logMuRounded = parseFloat(Math.log10(mu).toFixed(1));
          const x = point[0].toFixed(2);
          const y = point[1].toFixed(2);
          const logmupadding = '&nbsp;'.repeat(Math.max(0, 5 - logMuRounded.toString().length));
          let extra = "";
          if (i > 0) {
            const [prevPoint, prevMu] = arr[i - 1];
            const deltaLog = Math.abs(Math.log10(mu) - Math.log10(prevMu));
            const stepDistance = Math.hypot(point[0] - prevPoint[0], point[1] - prevPoint[1]);
            if (deltaLog > 1e-6) {
              const ratio = stepDistance;
              const pointpadding = '&nbsp;'.repeat(Math.max(0, 17 - `(${x}, ${y})`.length));
              extra = `${pointpadding}Δx: ${ratio.toFixed(2)}`;
            }
          }
          return `<div class="central-path-item" data-index="${i}">log(μ)=${logMuRounded}:${logmupadding}(${x}, ${y})${extra}</div>`;
        }).join('');
        document.querySelectorAll('.central-path-item').forEach(item => {
          item.addEventListener('mouseenter', () => {
            highlightCentralPathIndex = parseInt(item.getAttribute('data-index'));
            draw();
          });
          item.addEventListener('mouseleave', () => {
            highlightCentralPathIndex = null;
            draw();
          });
        });
        draw();
        isCentralPathComputing = false;
      })
      .catch(err => {
        console.error('Error:', err);
        analyticResultDiv.innerHTML = "Error computing central path.";
        isCentralPathComputing = false;
      });
  };

  const computeSimplexIterates = () => {
    if (isCentralPathComputing) return Promise.resolve();
    isCentralPathComputing = true;
    if (!isPolygonConvex(vertices)) {
      analyticResultDiv.innerHTML = "Nonconvex";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    if (!computedLines || computedLines.length === 0) {
      analyticResultDiv.innerHTML = "No computed lines available.";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    if (!objectiveVector) {
      analyticResultDiv.innerHTML = "Objective vector not defined.";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    const weights = Array.from(document.querySelectorAll('.inequality-item')).map(item => {
      const input = item.querySelector("input");
      return input ? parseFloat(input.value) : 1;
    });
    return fetch('/simplex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: computedLines,
        objective: [objectiveVector.x, objectiveVector.y],
        weights: weights,
      })
    })
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          analyticResultDiv.innerHTML = "Error: " + result.error;
          isCentralPathComputing = false;
          return;
        }
        const iteratesArray = result;
        centralPath = iteratesArray.map(entry => [entry, 1]);
        analyticResultDiv.innerHTML = iteratesArray.map((entry, i, arr) => {
          const point = entry;
          const x = point[0].toFixed(2);
          const y = point[1].toFixed(2);
          return `<div class="central-path-item" data-index="${i}">(${x}, ${y})</div>`;
        }).join('');
        document.querySelectorAll('.central-path-item').forEach(item => {
          item.addEventListener('mouseenter', () => {
            highlightCentralPathIndex = parseInt(item.getAttribute('data-index'));
            draw();
          });
          item.addEventListener('mouseleave', () => {
            highlightCentralPathIndex = null;
            draw();
          });
        });
        draw();
        isCentralPathComputing = false;
      })
      .catch(err => {
        console.error('Error:', err);
        analyticResultDiv.innerHTML = "Error computing simplex iterates.";
        isCentralPathComputing = false;
      });
  };


  const computeIPMIterates = () => {
    if (isCentralPathComputing) return Promise.resolve();
    isCentralPathComputing = true;
    if (!isPolygonConvex(vertices)) {
      analyticResultDiv.innerHTML = "Nonconvex";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    if (!computedLines || computedLines.length === 0) {
      analyticResultDiv.innerHTML = "No computed lines available.";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    if (!objectiveVector) {
      analyticResultDiv.innerHTML = "Objective vector not defined.";
      isCentralPathComputing = false;
      return Promise.resolve();
    }
    const weights = Array.from(document.querySelectorAll('.inequality-item')).map(item => {
      const input = item.querySelector("input");
      return input ? parseFloat(input.value) : 1;
    });
    const alphaMax = parseFloat(document.getElementById('alphaMaxSlider').value);
    const nitermax = parseInt(document.getElementById('nitermaxInput').value, 10);

    return fetch('/ipm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: computedLines,
        objective: [objectiveVector.x, objectiveVector.y],
        weights: weights,
        αmax: alphaMax,
        nitermax: nitermax,
      })
    })
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          analyticResultDiv.innerHTML = "Error: " + result.error;
          isCentralPathComputing = false;
          return;
        }
        const sol = result.iterates.solution;
        const iteratesArray = sol.x.map((val, i) => {
          return [sol.x[i], sol["µ"][i]];
        });
        centralPath = iteratesArray;

        analyticResultDiv.innerHTML = iteratesArray.map((entry, i, arr) => {
          const [point, mu] = entry;
          const logMuRounded = parseFloat(Math.log10(mu).toFixed(1));
          const x = point[0].toFixed(2);
          const y = point[1].toFixed(2);
          let extra = "";
          if (i > 0) {
            const [prevPoint, prevMu] = arr[i - 1];
            const deltaLog = Math.abs(Math.log10(mu) - Math.log10(prevMu));
            const stepDistance = Math.hypot(point[0] - prevPoint[0], point[1] - prevPoint[1]);
            if (deltaLog > 1e-6) {
              extra = ` Δx: ${stepDistance.toFixed(2)}`;
            }
          }
          return `<div class="central-path-item" data-index="${i}">log(μ)=${logMuRounded}: (${x}, ${y})${extra}</div>`;
        }).join('');
        document.querySelectorAll('.central-path-item').forEach(item => {
          item.addEventListener('mouseenter', () => {
            highlightCentralPathIndex = parseInt(item.getAttribute('data-index'));
            draw();
          });
          item.addEventListener('mouseleave', () => {
            highlightCentralPathIndex = null;
            draw();
          });
        });
        draw();
        isCentralPathComputing = false;
      })
      .catch(err => {
        console.error('Error:', err);
        analyticResultDiv.innerHTML = "Error computing IPM iterates.";
        isCentralPathComputing = false;
      });
  };

  const computePath = () => {
    if (solverMode === "ipm") {
      return computeIPMIterates();
    } else if (solverMode === "simplex") {
      return computeSimplexIterates();
    } else {
      return computeCentralPath();
    }
  };

  traceButton.addEventListener('click', () => {
    computePath();
    centralPathComputed = true;
  });

  const rotateAndComputeStep = () => {
    const MIN_WAIT = 30;
    if (!isPolygonConvex(vertices)) {
      setTimeout(rotateAndComputeStep, MIN_WAIT);
      return;
    }
    if (!rotateObjectiveMode) return;
    const angle = Math.atan2(objectiveVector.y, objectiveVector.x);
    const magnitude = Math.hypot(objectiveVector.x, objectiveVector.y);
    const angleStep = parseFloat(objectiveAngleStepSlider.value);
    objectiveVector = { x: magnitude * Math.cos(angle + angleStep), y: magnitude * Math.sin(angle + angleStep) };
    updateObjectiveDisplay();
    draw();
    if (polygonComplete && computedLines.length > 0) {
      computePath().then(() => {
        if (rotateObjectiveMode) setTimeout(rotateAndComputeStep, MIN_WAIT);
      });
    } else {
      if (rotateObjectiveMode) setTimeout(rotateAndComputeStep, MIN_WAIT);
    }
  };

  startRotateObjectiveButton.addEventListener('click', () => {
    rotateObjectiveMode = true;
    if (!objectiveVector) {
      objectiveVector = { x: 1, y: 0 };
      updateObjectiveDisplay();
    }
    objectiveRotationSettings.style.display = 'block';
    startRotateObjectiveButton.disabled = true;
    stopRotateObjectiveButton.disabled = false;
    rotateAndComputeStep();
  });
  stopRotateObjectiveButton.addEventListener('click', () => {
    rotateObjectiveMode = false;
    objectiveRotationSettings.style.display = 'none';
    startRotateObjectiveButton.disabled = false;
    stopRotateObjectiveButton.disabled = true;
  });

  const updateCenter = () => {
    const sidebarWidth = document.getElementById('sidebar').offsetWidth;
    centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    centerY = window.innerHeight / 2;
  };
  const resizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCenter();
    draw();
    updateZoomButtonsState();
    updateSolverModeButtons();
  };
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebarHandle');
  let isResizing = false;
  handle.addEventListener('mousedown', e => {
    isResizing = true;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    let newWidth = e.clientX;
    newWidth = Math.max(200, Math.min(newWidth, 600));
    sidebar.style.width = `${newWidth}px`;
    handle.style.left = `${newWidth}px`;
    updateCenter();
    draw();
  });
  document.addEventListener('mouseup', () => {
    if (isResizing) isResizing = false;
  });
  toggleBarrierWeightsButton.addEventListener('click', () => {
    barrierWeightsVisible = !barrierWeightsVisible;
    document.querySelectorAll('.barrier-weight-container').forEach(container => {
      container.style.display = barrierWeightsVisible ? "inline" : "none";
    });
    toggleBarrierWeightsButton.textContent = barrierWeightsVisible ? "Hide Barrier Weights" : "Show Barrier Weights";
  });
})();
