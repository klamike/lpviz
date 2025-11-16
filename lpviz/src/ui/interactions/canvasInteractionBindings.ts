import { getState, mutate, setState, setFields } from "../../state/store";
import { computeDrawingSnapshot } from "../../state/drawing";
import type { Line, PointXY } from "../../types/arrays";
import { VRep, verticesFromLines } from "../../utils/math2d";
import { showElement, setButtonsEnabled } from "../../state/utils";
import { CanvasViewportManager } from "../managers/canvasViewportManager";
import { InterfaceLayoutManager } from "../managers/interfaceLayoutManager";
import { InactivityHelpOverlay } from "../overlays/guidedExperience";

export function registerCanvasInteractions(canvasManager: CanvasViewportManager, uiManager: InterfaceLayoutManager, saveToHistory: () => void, sendPolytope: () => void, recomputeSolver?: () => void, helpPopup?: InactivityHelpOverlay): void {
  const canvas = canvasManager.canvas;
  let constraintDragContext: Line[] | null = null;
  const setButtonState = (id: string, enabled: boolean) => {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = !enabled;
  };

  const getLogicalFromClient = (clientX: number, clientY: number): PointXY => {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return canvasManager.toLogicalCoords(localX, localY);
  };

  const cleanupDragState = () => {
    setFields({
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
  };

  const exceedsDragThreshold = (clientX: number, clientY: number) => {
    const { dragStartPos } = getState();
    if (!dragStartPos) return false;
    return Math.hypot(clientX - dragStartPos.x, clientY - dragStartPos.y) > 5;
  };

  function handleDragStart(clientX: number, clientY: number) {
    const logicalCoords = getLogicalFromClient(clientX, clientY);
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const state = getState();
    const phaseSnapshot = computeDrawingSnapshot(state);

    if (phaseSnapshot.phase === "empty" || phaseSnapshot.phase === "sketching_polytope") {
      const idx = state.vertices.findIndex((v) => VRep.distance(logicalCoords, v) < 0.5);
      if (idx !== -1) {
        setFields({
          potentialDragPointIndex: idx,
          potentialDragPoint: true,
          dragStartPos: { x: clientX, y: clientY },
        });
      }
      return;
    }

    if (state.objectiveVector) {
      const tip = canvasManager.toCanvasCoords(state.objectiveVector.x, state.objectiveVector.y);
      if (Math.hypot(localX - tip.x, localY - tip.y) < 10) {
        setState({ draggingObjective: true });
        return;
      }
    }

    const idx = state.vertices.findIndex((v) => VRep.distance(logicalCoords, v) < 0.5);
    if (idx !== -1) {
      setFields({
        potentialDragPointIndex: idx,
        potentialDragPoint: true,
        dragStartPos: { x: clientX, y: clientY },
      });
      return;
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
            return;
          }
          const line = lineContext[edgeIndex];
          if (!line) return;
          const normal: PointXY = { x: line[0], y: line[1] };
          constraintDragContext = lineContext.map(([A, B, C]) => [A, B, C]);
          setFields({
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
        }
        return;
      }
    }

    if (state.objectiveVector) {
      setFields({
        isPanning: true,
        lastPan: { x: clientX, y: clientY },
      });
    }
  }

  function handleDragMove(clientX: number, clientY: number) {
    const logicalCoords = getLogicalFromClient(clientX, clientY);
    let interaction = getState();
    const phaseSnapshot = computeDrawingSnapshot(getState());

    if (interaction.potentialDragPoint && !interaction.draggingPoint) {
      if (exceedsDragThreshold(clientX, clientY)) {
        const dragIndex = interaction.potentialDragPointIndex;
        setFields({
          draggingPointIndex: dragIndex,
          draggingPoint: true,
          potentialDragPointIndex: null,
          potentialDragPoint: false,
        });
        interaction = getState();
      }
    }

    if (interaction.potentialDragConstraint && !interaction.draggingConstraint) {
      if (exceedsDragThreshold(clientX, clientY)) {
        setFields({
          draggingConstraint: true,
          potentialDragConstraint: false,
        });
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
      const delta =
        (logicalCoords.x - start.x) * normal.x + (logicalCoords.y - start.y) * normal.y;
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
        setFields({ constraintDragStart: logicalCoords });
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

    if (interaction.isPanning && interaction.lastPan) {
      const dx = clientX - interaction.lastPan.x;
      const dy = clientY - interaction.lastPan.y;
      canvasManager.panByScreenDelta(dx, dy);
      setState({ lastPan: { x: clientX, y: clientY } });
      canvasManager.draw();
      setButtonState("unzoomButton", true);
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

    if (interaction.isPanning) {
      setFields({ isPanning: false, wasPanning: true });
      cleanupDragState();
      return;
    }

    if (interaction.draggingConstraint) {
      saveToHistory();
      setFields({
        draggingConstraintIndex: null,
        draggingConstraint: false,
        wasDraggingConstraint: true,
      });
      sendPolytope();
    }

    if (interaction.draggingPoint) {
      saveToHistory();
      setFields({
        draggingPointIndex: null,
        draggingPoint: false,
        wasDraggingPoint: true,
      });
      sendPolytope();
    }

    if (interaction.draggingObjective) {
      saveToHistory();
      setFields({
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
        setFields({
          polytopeComplete: true,
          interiorPoint: VRep.fromPoints(vertices).centroidPoint(),
        });
        canvasManager.draw();
        sendPolytope();
        return;
      }

      // Check if clicking inside polytope to close it
      if (polytope.contains(pt)) {
        setFields({ polytopeComplete: true, interiorPoint: { x: pt.x, y: pt.y } });
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
    showElement("maximize");
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
  }

  // ===== POINTER EVENTS =====

  canvas.addEventListener("mousedown", (e) => {
    const { is3DMode, isTransitioning3D } = getState();
    if (is3DMode && e.shiftKey && !isTransitioning3D) {
      setFields({
        isRotatingCamera: true,
        lastRotationMouse: { x: e.clientX, y: e.clientY },
      });
      return;
    }
    handleDragStart(e.clientX, e.clientY);
  });

  canvas.addEventListener("mousemove", (e) => {
    const { isRotatingCamera, lastRotationMouse, viewAngle } = getState();
    if (isRotatingCamera && lastRotationMouse) {
      const deltaX = e.clientX - lastRotationMouse.x;
      const deltaY = e.clientY - lastRotationMouse.y;

      setFields({
        viewAngle: {
          ...viewAngle,
          y: viewAngle.y + deltaX * 0.01,
          x: Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, viewAngle.x + deltaY * 0.01)),
        },
        lastRotationMouse: { x: e.clientX, y: e.clientY },
      });
      canvasManager.draw();
      return;
    }

    handleDragMove(e.clientX, e.clientY);
  });

  canvas.addEventListener("mouseup", () => {
    if (getState().isRotatingCamera) {
      setState({ isRotatingCamera: false });
      return;
    }
    handleDragEnd();
  });

  canvas.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleDragStart(touch.clientX, touch.clientY);
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const interaction = getState();
        if (interaction.isPanning || interaction.draggingPoint || interaction.draggingObjective) {
          e.preventDefault();
        }
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      const interaction = getState();
      if (interaction.isPanning || interaction.draggingPoint || interaction.draggingObjective) {
        e.preventDefault();
      }
      handleDragEnd();
    },
    { passive: false },
  );

  // ===== CANVAS INTERACTION HANDLERS =====

  canvas.addEventListener("dblclick", (e) => {
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
        setFields({
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
      const dx = v2.x - v1.x, dy = v2.y - v1.y;
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
    if (helpPopup?.isTouring()) {
      return;
    }

    // Ignore clicks that were part of drag operations
    const { wasPanning, wasDraggingPoint, wasDraggingObjective, wasDraggingConstraint } = getState();
    if (wasPanning || wasDraggingPoint || wasDraggingObjective || wasDraggingConstraint) {
      setFields({
        wasPanning: false,
        wasDraggingPoint: false,
        wasDraggingObjective: false,
        wasDraggingConstraint: false,
      });
      return;
    }

    const pt = getLogicalFromClient(e.clientX, e.clientY);

    const phaseSnapshot = computeDrawingSnapshot(getState());

    if (phaseSnapshot.phase === "empty" || phaseSnapshot.phase === "sketching_polytope") {
      handlePolytopeConstruction(pt);
    } else if (phaseSnapshot.phase === "awaiting_objective" || phaseSnapshot.phase === "objective_preview") {
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

    const newScale = Math.min(MAX_SCALE_FACTOR, Math.max(0.05, e.deltaY < 0 ? canvasManager.scaleFactor * zoomFactor : canvasManager.scaleFactor / zoomFactor));

    const focusPoint = canvasManager.toLogicalCoords(mouseX, mouseY);
    canvasManager.scaleFactor = newScale;
    canvasManager.setOffsetForAnchor(mouseX, mouseY, focusPoint);
    canvasManager.draw();
  });
}
