import { getState, mutate, setState } from "../../state/store";
import type { Line, PointXY } from "../../solvers/utils/blas";
import { VRep, verticesFromLines } from "../../solvers/utils/polytope";
import { setButtonsEnabled, setElementDisplay } from "../../state/utils";
import { ViewportManager } from "../viewport";
import { LayoutManager } from "../layout";
import { InactivityHelpOverlay } from "../tour/tour";

export function registerCanvasInteractions(canvasManager: ViewportManager, uiManager: LayoutManager, saveToHistory: () => void, sendPolytope: () => void, recomputeSolver?: () => void, helpPopup?: InactivityHelpOverlay): void {
  const canvas = canvasManager.canvas;
  let constraintDragContext: Line[] | null = null;

  // const setButtonState = (id: string, enabled: boolean) => {
  //   const button = document.getElementById(id) as HTMLButtonElement | null;
  //   if (button) button.disabled = !enabled;
  // };

  const VERTEX_HIT_RADIUS = 12;
  const updatePanControls = () => {
    const drawingPhase = getState().snapshot.phase !== "ready_for_solvers";
    if (drawingPhase) {
      canvasManager.suspend2DPan();
    } else {
      canvasManager.resume2DPan();
    }
  };
  updatePanControls();

  const getLogicalFromClient = (clientX: number, clientY: number): PointXY => {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return canvasManager.toLogicalCoords(localX, localY);
  };

  const cleanupDragState = () => {
    setState({
      potentialDragPointIndex: null,
      potentialDragPoint: false,
      draggingPoint: false,
      dragStartPos: null,
      potentialDragConstraint: false,
      draggingConstraint: false,
      draggingConstraintIndex: null,
      constraintDragStart: null,
      constraintDragNormal: null,
    });
    constraintDragContext = null;
    canvasManager.enable2DControls();
    updatePanControls();
  };

  const exceedsDragThreshold = (clientX: number, clientY: number) => {
    const { dragStartPos } = getState();
    if (!dragStartPos) return false;
    return Math.hypot(clientX - dragStartPos.x, clientY - dragStartPos.y) > 5;
  };

  const findVertexNearLocalPoint = (localX: number, localY: number, rect: DOMRect, vertices: PointXY[]) => {
    return vertices.findIndex((vertex) => {
      const canvasPoint = canvasManager.toCanvasCoords(vertex.x, vertex.y);
      const hitX = canvasPoint.x - rect.left;
      const hitY = canvasPoint.y - rect.top;
      return Math.hypot(localX - hitX, localY - hitY) <= VERTEX_HIT_RADIUS;
    });
  };

  function handleDragStart(clientX: number, clientY: number): boolean {
    const logicalCoords = getLogicalFromClient(clientX, clientY);
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const state = getState();
    const phaseSnapshot = state.snapshot;

    if (phaseSnapshot.phase === "empty" || phaseSnapshot.phase === "sketching_polytope") {
      const idx = findVertexNearLocalPoint(localX, localY, rect, state.vertices);
      if (idx !== -1) {
        setState({
          potentialDragPointIndex: idx,
          potentialDragPoint: true,
          dragStartPos: { x: clientX, y: clientY },
        });
        canvasManager.disable2DControls();
        return true;
      }
      return false;
    }

    if (state.objectiveVector) {
      const tip = canvasManager.getObjectiveScreenPosition(state.objectiveVector);
      if (Math.hypot(localX - tip.x, localY - tip.y) < 10) {
        setState({ draggingObjective: true });
        canvasManager.disable2DControls();
        return true;
      }
    }

    const idx = findVertexNearLocalPoint(localX, localY, rect, state.vertices);
    if (idx !== -1) {
      setState({
        potentialDragPointIndex: idx,
        potentialDragPoint: true,
        dragStartPos: { x: clientX, y: clientY },
      });
      canvasManager.disable2DControls();
      return true;
    }

    if (state.polytopeComplete && state.vertices.length >= 3) {
      const polytope = VRep.fromPoints(state.vertices);
      const edgeIndex = polytope.findEdgeNearPoint(logicalCoords);
      if (edgeIndex !== null) {
        const nextIndex = (edgeIndex + 1) % state.vertices.length;
        const start = state.vertices[edgeIndex];
        const end = state.vertices[nextIndex];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length > 1e-6) {
          const lineContext = getState().polytope?.lines;
          if (!lineContext || lineContext.length === 0) {
            return false;
          }
          const line = lineContext[edgeIndex];
          if (!line) {
            return false;
          }
          const normal: PointXY = { x: line[0], y: line[1] };
          constraintDragContext = lineContext.map(([A, B, C]) => [A, B, C]);
          setState({
            potentialDragConstraint: true,
            draggingConstraintIndex: edgeIndex,
            constraintDragStart: logicalCoords,
            constraintDragNormal: normal,
            dragStartPos: { x: clientX, y: clientY },
            wasDraggingConstraint: false,
            potentialDragPoint: false,
            potentialDragPointIndex: null,
            draggingPoint: false,
            draggingPointIndex: null,
          });
          return true;
        }
      }
    }

    return false;
  }

  function handleDragMove(clientX: number, clientY: number) {
    const logicalCoords = getLogicalFromClient(clientX, clientY);
    let interaction = getState();
    const phaseSnapshot = interaction.snapshot;

    if (interaction.potentialDragPoint && !interaction.draggingPoint) {
      if (exceedsDragThreshold(clientX, clientY)) {
        const dragIndex = interaction.potentialDragPointIndex;
        setState({
          draggingPointIndex: dragIndex,
          draggingPoint: true,
          potentialDragPointIndex: null,
          potentialDragPoint: false,
        });
        canvasManager.disable2DControls();
        interaction = getState();
      }
    }

    if (interaction.potentialDragConstraint && !interaction.draggingConstraint) {
      if (exceedsDragThreshold(clientX, clientY)) {
        setState({
          draggingConstraint: true,
          potentialDragConstraint: false,
        });
        canvasManager.disable2DControls();
        interaction = getState();
      }
    }

    if (interaction.draggingPoint) {
      const index = interaction.draggingPointIndex ?? 0;
      mutate((draft) => {
        draft.vertices[index] = logicalCoords;
      });
      sendPolytope();
      recomputeSolver?.();
      canvasManager.draw();
      return;
    }

    if (interaction.draggingConstraint && interaction.constraintDragNormal && interaction.constraintDragStart && constraintDragContext) {
      const normal = interaction.constraintDragNormal;
      const start = interaction.constraintDragStart;
      const delta = (logicalCoords.x - start.x) * normal.x + (logicalCoords.y - start.y) * normal.y;
      const index = interaction.draggingConstraintIndex ?? 0;
      const line = constraintDragContext[index];
      const length = Math.hypot(line[0], line[1]);
      if (length <= 0) return;
      const shift = delta * length;
      const updatedLines = constraintDragContext.slice();
      updatedLines[index] = [line[0], line[1], line[2] + shift];
      const updatedVertices = verticesFromLines(updatedLines);
      if (updatedVertices.length >= 2) {
        mutate((draft) => {
          draft.vertices = updatedVertices.map(([x, y]) => ({ x, y }));
        });
        constraintDragContext = updatedLines;
        setState({ constraintDragStart: logicalCoords });
        sendPolytope();
        recomputeSolver?.();
        canvasManager.draw();
      }
      return;
    }

    if (interaction.draggingObjective) {
      setState({ objectiveVector: logicalCoords });
      uiManager.updateObjectiveDisplay();
      sendPolytope();
      recomputeSolver?.();
      canvasManager.draw();
      return;
    }

    if (helpPopup?.isTouring()) {
      return;
    }

    if (phaseSnapshot.phase === "empty" || phaseSnapshot.phase === "sketching_polytope") {
      setState({ currentMouse: logicalCoords });
      canvasManager.draw();
    } else if (phaseSnapshot.phase === "awaiting_objective" || phaseSnapshot.phase === "objective_preview") {
      setState({ currentObjective: logicalCoords });
      canvasManager.draw();
    }
  }

  function handleDragEnd() {
    const interaction = getState();

    if (interaction.draggingConstraint) {
      saveToHistory();
      setState({
        draggingConstraintIndex: null,
        draggingConstraint: false,
        wasDraggingConstraint: true,
      });
      sendPolytope();
    }

    if (interaction.draggingPoint) {
      saveToHistory();
      setState({
        draggingPointIndex: null,
        draggingPoint: false,
        wasDraggingPoint: true,
      });
      sendPolytope();
    }

    if (interaction.draggingObjective) {
      saveToHistory();
      setState({
        draggingObjective: false,
        wasDraggingObjective: true,
      });
      sendPolytope();
    }

    cleanupDragState();
  }

  function handlePolytopeConstruction(pt: PointXY) {
    const { vertices } = getState();
    const polytope = VRep.fromPoints(vertices);
    if (vertices.length >= 3) {
      // Check if clicking near first vertex to close polytope
      if (VRep.distance(pt, vertices[0]) < 0.5) {
        setState({
          polytopeComplete: true,
          interiorPoint: VRep.fromPoints(vertices).centroidPoint(),
        });
        canvasManager.draw();
        sendPolytope();
        return;
      }

      // Check if clicking inside polytope to close it
      if (polytope.contains(pt)) {
        setState({ polytopeComplete: true, interiorPoint: { x: pt.x, y: pt.y } });
        canvasManager.draw();
        sendPolytope();
        return;
      }
    }

    // Validate convexity before adding vertex
    const tentative = [...vertices, pt];
    if (tentative.length >= 3 && !VRep.fromPoints(tentative).isConvex()) {
      alert("Adding this vertex would make the polytope nonconvex. Please choose another point.");
      return;
    }

    saveToHistory();
    mutate((draft) => {
      draft.vertices.push({ x: pt.x, y: pt.y });
    });
    uiManager.hideNullStateMessage();
    canvasManager.draw();
    sendPolytope();
  }

  function handleObjectiveSelection(pt: PointXY) {
    saveToHistory();
    const { currentObjective } = getState();
    setState({ objectiveVector: currentObjective || pt });
    setElementDisplay("maximize", "block");
    setButtonsEnabled({
      ipmButton: true,
      simplexButton: true,
      pdhgButton: true,
      iteratePathButton: false,
      traceButton: true,
      zoomButton: true,
    });
    uiManager.updateSolverModeButtons();
    uiManager.updateObjectiveDisplay();
    canvasManager.draw();
    updatePanControls();
  }

  // ===== POINTER EVENTS =====

  canvas.addEventListener(
    "mousedown",
    (e) => {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) {
        return;
      }
      const handled = handleDragStart(e.clientX, e.clientY);
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );

  canvas.addEventListener(
    "mousemove",
    (e) => {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) {
        return;
      }

      handleDragMove(e.clientX, e.clientY);
      const interaction = getState();
      const shouldBlock = interaction.potentialDragPoint || interaction.draggingPoint || interaction.potentialDragConstraint || interaction.draggingConstraint || interaction.draggingObjective;
      if (shouldBlock) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );

  canvas.addEventListener(
    "mouseup",
    (e) => {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) {
        return;
      }
      const interaction = getState();
      handleDragEnd();
      const shouldBlock = interaction.potentialDragPoint || interaction.draggingPoint || interaction.potentialDragConstraint || interaction.draggingConstraint || interaction.draggingObjective;
      if (shouldBlock) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );

  canvas.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) return;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const handled = handleDragStart(touch.clientX, touch.clientY);
        if (handled) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    },
    { passive: false, capture: true },
  );

  canvas.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) return;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
        const interaction = getState();
        const shouldBlock = interaction.potentialDragPoint || interaction.draggingPoint || interaction.potentialDragConstraint || interaction.draggingConstraint || interaction.draggingObjective;
        if (shouldBlock) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    },
    { passive: false, capture: true },
  );

  canvas.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) return;
      const interaction = getState();
      handleDragEnd();
      const shouldBlock = interaction.potentialDragPoint || interaction.draggingPoint || interaction.potentialDragConstraint || interaction.draggingConstraint || interaction.draggingObjective;
      if (shouldBlock) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { passive: false, capture: true },
  );

  canvas.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      const { is3DMode, isTransitioning3D, zScale } = getState();
      const is3D = is3DMode || isTransitioning3D;
      if (!is3D || !e.shiftKey || isTransitioning3D) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const zoomFactor = 1.05;
      const dominantDelta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (dominantDelta === 0) return;
      const effectiveScale = (zScale || 0.1) * (dominantDelta < 0 ? 1 / zoomFactor : zoomFactor);
      const clampedScale = Math.max(0.01, Math.min(100, effectiveScale));
      setState({ zScale: clampedScale });
      canvasManager.draw();
      uiManager.updateZScaleValue();
    },
    { passive: false, capture: true },
  );

  // ===== CANVAS INTERACTION HANDLERS =====

  canvas.addEventListener("dblclick", (e) => {
    const { isTransitioning3D } = getState();
    if (isTransitioning3D) {
      return;
    }
    if (helpPopup?.isTouring()) {
      return;
    }

    const logicalMouse = getLogicalFromClient(e.clientX, e.clientY);
    const { vertices, polytopeComplete } = getState();
    const polytope = VRep.fromPoints(vertices);

    if (polytopeComplete && vertices.length >= 3 && !polytope.isConvex() && polytope.contains(logicalMouse)) {
      const hull = polytope.computeConvexHull();
      if (hull.length >= 3) {
        saveToHistory();
        setState({
          vertices: hull,
          interiorPoint: VRep.fromPoints(hull).centroidPoint(),
        });
        canvasManager.draw();
        sendPolytope();
        return;
      }
    }

    const edgeIndex = polytope.findEdgeNearPoint(logicalMouse);
    if (edgeIndex !== null) {
      const v1 = vertices[edgeIndex];
      const v2 = vertices[(edgeIndex + 1) % vertices.length];
      const dx = v2.x - v1.x,
        dy = v2.y - v1.y;
      const len = Math.hypot(dx, dy);
      const normal = { x: -dy / len, y: dx / len };
      const newPoint = { x: logicalMouse.x - normal.x * 0.1, y: logicalMouse.y - normal.y * 0.1 };
      saveToHistory();
      mutate((draft) => {
        draft.vertices.splice(edgeIndex + 1, 0, newPoint);
      });
      canvasManager.draw();
      sendPolytope();
    }
  });

  canvas.addEventListener("click", (e) => {
    const initialState = getState();
    if (initialState.isTransitioning3D) {
      return;
    }
    if (helpPopup?.isTouring()) {
      return;
    }

    // Ignore clicks that were part of drag operations
    const { wasDraggingPoint, wasDraggingObjective, wasDraggingConstraint } = initialState;
    if (wasDraggingPoint || wasDraggingObjective || wasDraggingConstraint) {
      setState({
        wasDraggingPoint: false,
        wasDraggingObjective: false,
        wasDraggingConstraint: false,
      });
      return;
    }

    const state = getState();
    const phaseSnapshot = state.snapshot;
    const drawingPhase = phaseSnapshot.phase === "empty" || phaseSnapshot.phase === "sketching_polytope";
    const objectivePhase = phaseSnapshot.phase === "awaiting_objective" || phaseSnapshot.phase === "objective_preview";
    if (state.is3DMode && !drawingPhase && !objectivePhase) {
      return;
    }

    const pt = getLogicalFromClient(e.clientX, e.clientY);

    if (drawingPhase) {
      handlePolytopeConstruction(pt);
    } else if (objectivePhase) {
      handleObjectiveSelection(pt);
    }
  });
}
