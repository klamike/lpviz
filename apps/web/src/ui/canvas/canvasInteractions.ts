import { setCurrentMouse } from "@/features/core/currentMouse";
import {
  DEFAULT_Z_SCALE,
  computeDrawingPhase,
  getState,
  setState,
  type DrawingPhase,
  type EditorInteractionState,
  type HistoryEntry,
  type State,
} from "@/features/core/store";
import type {
  HandleUndoRedo,
  SaveHistory,
} from "@/features/history/historyService";
import {
  getEditorContext,
  getEditorTransition,
} from "@/features/polytope-editor/editorSession";
import {
  exceedsDragThreshold,
  findBoundaryRayNearPoint,
  findEdgeNearPoint,
  findVertexNearLocalPoint,
  getDragStartTarget,
  getLocalFromClient,
  getLogicalFromClient,
  type ConstraintDragTarget,
} from "@/features/polytope-editor/interactionState";
import type { ViewportApi } from "@/features/viewport/runtime";
import { verticesFromLines } from "@lpviz/math/geometry";
import type { PointXY } from "@lpviz/math/types";

export function attachCanvasInteractions({
  canvasManager,
  saveHistory,
  sendPolytope,
  handleUndoRedo,
}: {
  canvasManager: ViewportApi;
  saveHistory: SaveHistory;
  sendPolytope: () => void;
  handleUndoRedo: HandleUndoRedo;
}): () => void {
  let pendingDragHistory: HistoryEntry | null = null;
  const canvas = canvasManager.getCanvasElement();
  const cleanupHandlers: Array<() => void> = [];

  const bindEvent = (
    target: EventTarget,
    eventName: string,
    handler: (event: never) => void,
    options?: boolean | AddEventListenerOptions,
  ) => {
    const listener = handler as EventListener;
    target.addEventListener(eventName, listener, options);
    cleanupHandlers.push(() =>
      target.removeEventListener(eventName, listener, options),
    );
  };

  const captureHistoryEntry = (
    state: Pick<State, "vertices" | "objectiveVector" | "completionMode">,
  ): HistoryEntry => ({
    vertices: state.vertices.map((v) => ({ x: v.x, y: v.y })),
    objectiveVector: state.objectiveVector
      ? { ...state.objectiveVector }
      : null,
    completionMode: state.completionMode,
  });

  const persistPendingDragHistory = () => {
    if (!pendingDragHistory) return;
    saveHistory(pendingDragHistory);
    pendingDragHistory = null;
  };

  const updatePanControls = () => {
    canvasManager.set2DPanEnabled(
      computeDrawingPhase(getState()) === "ready_for_solvers",
    );
  };

  const restoreViewportControls = () => {
    canvasManager.setControlsBlocked(false);
    updatePanControls();
  };

  const cleanupDragState = () => {
    pendingDragHistory = null;
    setState(
      {
        editorInteraction: { kind: "idle" },
        lastCompletedInteraction: "none",
      },
      { viewportDirty: {} },
    );
    restoreViewportControls();
    requestAnimationFrame(restoreViewportControls);
  };

  const commitEdit = (
    result: {
      vertices: PointXY[];
      completionMode: "draft" | "open" | "closed";
      interiorPoint: PointXY | null;
    },
    options: {
      saveToHistory?: boolean;
      extraPatch?: Partial<State>;
    } = {},
  ) => {
    if (options.saveToHistory ?? true) {
      saveHistory();
    }
    setState(
      {
        vertices: result.vertices,
        completionMode: result.completionMode,
        interiorPoint: result.interiorPoint,
        polytope: null as null,
        inequalitiesMessage: null,
        highlightIndex: null,
        ...(options.extraPatch ?? {}),
      },
      { viewportDirty: canvasManager.getPolytopeDirtyFlags() },
    );
    canvasManager.draw();
    sendPolytope();
    updatePanControls();
  };

  const applyEditorTransition = (
    transition: ReturnType<typeof getEditorTransition>,
    rejectMessage: string,
  ) => {
    if (transition.kind === "reject-nonconvex") {
      alert(rejectMessage);
      return;
    }

    if (transition.kind === "edit") {
      commitEdit(transition.result, {
        saveToHistory: transition.saveToHistory,
      });
      return;
    }

    if (transition.kind === "select-objective") {
      if (transition.saveToHistory) {
        saveHistory();
      }
      setState(
        { objectiveVector: transition.objectiveVector },
        { viewportDirty: canvasManager.getObjectiveDirtyFlags() },
      );
      sendPolytope();
      canvasManager.draw();
      updatePanControls();
    }
  };

  const applyConstraintDrag = (
    target: ConstraintDragTarget,
    logicalCoords: PointXY,
  ) => {
    const delta =
      (logicalCoords.x - target.start.x) * target.normal.x +
      (logicalCoords.y - target.start.y) * target.normal.y;

    if (target.operation.kind === "closed-line") {
      const line = target.operation.lines[target.operation.lineIndex];
      const length = Math.hypot(line[0], line[1]);
      if (length <= 0) return;

      const shift = delta * length;
      const updatedLines = target.operation.lines.slice();
      updatedLines[target.operation.lineIndex] = [
        line[0],
        line[1],
        line[2] + shift,
      ];
      const updatedVertices = verticesFromLines(updatedLines);
      if (updatedVertices.length < 2) return;

      setState(
        { vertices: updatedVertices.map(([x, y]) => ({ x, y })) },
        { viewportDirty: canvasManager.getPolytopeDirtyFlags() },
      );

      setState(
        {
          editorInteraction: {
            kind: "dragging",
            target: {
              kind: "constraint",
              operation: {
                kind: "closed-line",
                lineIndex: target.operation.lineIndex,
                lines: updatedLines,
              },
              start: logicalCoords,
              normal: target.normal,
            },
          },
        },
        { viewportDirty: {} },
      );
    } else {
      const operation = target.operation;
      const shiftX = target.normal.x * delta;
      const shiftY = target.normal.y * delta;
      const indices = new Set(operation.vertexIndices);
      setState(
        {
          vertices: getState().vertices.map((v, i) =>
            indices.has(i) ? { x: v.x + shiftX, y: v.y + shiftY } : v,
          ),
        },
        { viewportDirty: canvasManager.getPolytopeDirtyFlags() },
      );
      setState(
        {
          editorInteraction: {
            kind: "dragging",
            target: {
              kind: "constraint",
              operation,
              start: logicalCoords,
              normal: target.normal,
            },
          },
        },
        { viewportDirty: {} },
      );
    }

    sendPolytope();
    canvasManager.draw();
  };

  const applyDraggingInteraction = (
    interaction: Extract<EditorInteractionState, { kind: "dragging" }>,
    logicalCoords: PointXY,
  ) => {
    persistPendingDragHistory();
    const dragTarget = interaction.target;
    if (dragTarget.kind === "point") {
      const pointIndex = dragTarget.index;
      setState(
        {
          vertices: getState().vertices.map((v, i) =>
            i === pointIndex ? logicalCoords : v,
          ),
        },
        { viewportDirty: canvasManager.getPolytopeDirtyFlags() },
      );
      sendPolytope();
      canvasManager.draw();
      return;
    }

    if (dragTarget.kind === "constraint") {
      applyConstraintDrag(dragTarget, logicalCoords);
      return;
    }

    setState(
      { objectiveVector: logicalCoords },
      { viewportDirty: canvasManager.getObjectiveDirtyFlags() },
    );
    sendPolytope();
    canvasManager.draw();
  };

  const updatePointerPreview = (
    phase: DrawingPhase,
    logicalCoords: PointXY,
  ) => {
    if (phase === "empty" || phase === "sketching_polytope") {
      setCurrentMouse(logicalCoords);
      canvasManager.draw();
      return;
    }

    if (phase === "awaiting_objective" || phase === "objective_preview") {
      setState(
        { currentObjective: logicalCoords },
        { viewportDirty: canvasManager.getObjectiveDirtyFlags() },
      );
      canvasManager.draw();
    }
  };

  const handleDragStart = (clientX: number, clientY: number): boolean => {
    const state = getState();
    const target = getDragStartTarget(canvasManager, state, clientX, clientY);
    if (!target) return false;

    if (target.kind === "objective") {
      pendingDragHistory = captureHistoryEntry(state);
      setState(
        {
          editorInteraction: { kind: "dragging", target },
        },
        { viewportDirty: {} },
      );
      canvasManager.setControlsBlocked(true);
      return true;
    }

    setState(
      {
        editorInteraction: {
          kind: "pending-drag",
          target,
          dragStartPos: { x: clientX, y: clientY },
        },
        lastCompletedInteraction: "none",
      },
      { viewportDirty: {} },
    );
    pendingDragHistory = captureHistoryEntry(state);
    if (target.kind === "point") {
      canvasManager.setControlsBlocked(true);
    }
    return true;
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    const initialState = getState();
    const initialInteraction = initialState.editorInteraction;
    const phaseSnapshot = computeDrawingPhase(initialState);
    if (
      initialInteraction.kind === "idle" &&
      phaseSnapshot === "ready_for_solvers"
    ) {
      return;
    }

    const logicalCoords = getLogicalFromClient(canvasManager, clientX, clientY);
    if (
      initialInteraction.kind === "pending-drag" &&
      exceedsDragThreshold(initialState, clientX, clientY)
    ) {
      setState(
        {
          editorInteraction: {
            kind: "dragging",
            target: initialInteraction.target,
          },
        },
        { viewportDirty: {} },
      );
      canvasManager.setControlsBlocked(true);
    }

    const state = getState();
    const interaction = state.editorInteraction;

    if (interaction.kind === "dragging") {
      applyDraggingInteraction(interaction, logicalCoords);
      return;
    }

    updatePointerPreview(phaseSnapshot, logicalCoords);
  };

  const handleDragEnd = () => {
    const interaction = getState().editorInteraction;
    if (interaction.kind === "dragging") {
      setState(
        {
          editorInteraction: { kind: "idle" },
          lastCompletedInteraction:
            interaction.target.kind === "point"
              ? "dragged-point"
              : interaction.target.kind === "constraint"
                ? "dragged-constraint"
                : "dragged-objective",
        },
        { viewportDirty: {} },
      );
      sendPolytope();
    }

    cleanupDragState();
  };

  const handlePointerRelease = (event: MouseEvent | TouchEvent) => {
    if (getState().isTransitioning3D) return;

    const interactionBeforeEnd = getState();
    handleDragEnd();
    if (interactionBeforeEnd.editorInteraction.kind !== "idle") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const stopBlockedPointerEvent = (event: MouseEvent | TouchEvent) => {
    if (getState().editorInteraction.kind === "idle") return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handlePointerStart = (
    clientX: number,
    clientY: number,
    event: MouseEvent | TouchEvent,
  ) => {
    if (getState().isTransitioning3D) return;
    const handled = handleDragStart(clientX, clientY);
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const handlePointerMove = (
    clientX: number,
    clientY: number,
    event: MouseEvent | TouchEvent,
  ) => {
    const state = getState();
    if (
      state.isTransitioning3D ||
      (state.isNavigatingViewport && state.editorInteraction.kind === "idle")
    ) {
      return;
    }
    handleDragMove(clientX, clientY);
    stopBlockedPointerEvent(event);
  };

  const handleWindowPointerEnd = (event: MouseEvent | TouchEvent) => {
    if (event.target === canvas) return;
    if (getState().editorInteraction.kind === "idle") return;
    handlePointerRelease(event);
  };

  const shouldIgnoreEditEvent = () => {
    const state = getState();
    return state.isTransitioning3D;
  };

  const finishOpenRegion = () => {
    const finishResult = getEditorTransition(getState(), {
      kind: "finish-open",
    });
    if (finishResult.kind === "noop") return;

    if (finishResult.kind === "reject-nonconvex") {
      alert(
        "This open region is nonconvex. Please adjust the vertices before pressing Enter.",
      );
      return;
    }

    if (finishResult.kind !== "edit") return;

    commitEdit(finishResult.result, {
      saveToHistory: finishResult.saveToHistory,
    });
    setCurrentMouse(null);
    canvasManager.set2DPanEnabled(true);
  };

  const handleWheel = (event: WheelEvent) => {
    const { is3DMode, isTransitioning3D, zScale } = getState();
    const is3D = is3DMode || isTransitioning3D;
    if (!is3D || !event.shiftKey || isTransitioning3D) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const zoomFactor = 1.05;
    const dominantDelta =
      Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
    if (dominantDelta === 0) return;

    const effectiveScale =
      (zScale || DEFAULT_Z_SCALE) *
      (dominantDelta < 0 ? 1 / zoomFactor : zoomFactor);
    const clampedScale = Math.max(0.01, Math.min(100, effectiveScale));
    setState(
      { zScale: clampedScale },
      { viewportDirty: canvasManager.getZScaleDirtyFlags() },
    );
    canvasManager.draw();
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (shouldIgnoreEditEvent()) return;

    const state = getState();
    const local = getLocalFromClient(
      canvasManager,
      event.clientX,
      event.clientY,
    );
    const {
      geometry: { vertices: displayVertices },
    } = getEditorContext(state);
    const deleteIndex = findVertexNearLocalPoint(
      canvasManager,
      local.x,
      local.y,
      displayVertices,
    );
    if (deleteIndex === -1) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const deletion = getEditorTransition(state, {
      kind: "delete-vertex",
      deleteIndex,
    });
    applyEditorTransition(
      deletion,
      "Deleting this vertex would make the region nonconvex.",
    );
  };

  const handleDoubleClick = (event: MouseEvent) => {
    if (shouldIgnoreEditEvent()) return;

    const logicalMouse = getLogicalFromClient(
      canvasManager,
      event.clientX,
      event.clientY,
    );
    const state = getState();
    const {
      geometry: { vertices: displayVertices, mode: displayMode },
    } = getEditorContext(state);
    const hullRepair = getEditorTransition(state, {
      kind: "repair-displayed-hull",
      point: logicalMouse,
    });
    if (hullRepair.kind !== "noop") {
      applyEditorTransition(
        hullRepair,
        "Repairing this region would make it nonconvex.",
      );
      return;
    }

    const edgeIndex = findEdgeNearPoint(
      logicalMouse,
      displayVertices,
      displayMode,
    );
    if (edgeIndex !== null) {
      const insertion = getEditorTransition(state, {
        kind: "insert-edge-point",
        edgeIndex,
        point: logicalMouse,
      });
      if (insertion.kind !== "noop") {
        applyEditorTransition(
          insertion,
          "Inserting this point would make the region nonconvex.",
        );
        return;
      }
    }

    const rayIndex = findBoundaryRayNearPoint(canvasManager, logicalMouse);
    if (rayIndex !== null) {
      const insertion = getEditorTransition(state, {
        kind: "insert-boundary-ray-point",
        rayIndex,
        point: { x: logicalMouse.x, y: logicalMouse.y },
      });
      if (insertion.kind !== "noop") {
        applyEditorTransition(
          insertion,
          "Inserting this point would make the region nonconvex.",
        );
      }
    }
  };

  const handleClick = (event: MouseEvent) => {
    const initialState = getState();
    if (shouldIgnoreEditEvent()) return;

    if (initialState.lastCompletedInteraction !== "none") {
      setState({ lastCompletedInteraction: "none" });
      return;
    }

    const state = getState();
    const { session } = getEditorContext(state);
    const drawingPhase = session.kind === "drafting";
    const objectivePhase = session.kind === "selecting-objective";
    if (state.is3DMode && !drawingPhase && !objectivePhase) return;

    if (drawingPhase || objectivePhase) {
      const point = getLogicalFromClient(
        canvasManager,
        event.clientX,
        event.clientY,
      );
      applyEditorTransition(
        getEditorTransition(state, { kind: "click", point }),
        "Adding this vertex would make the polytope nonconvex. Please choose another point.",
      );
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      handleUndoRedo(event.shiftKey);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finishOpenRegion();
    }
    if (event.key.toLowerCase() === "s") {
      const { snapToGrid } = getState();
      setState({ snapToGrid: !snapToGrid });
    }
    if (event.key.toLowerCase() === "h") {
      const { objectiveHidden } = getState();
      setState(
        { objectiveHidden: !objectiveHidden },
        { viewportDirty: canvasManager.getObjectiveDirtyFlags() },
      );
      canvasManager.draw();
    }
  };

  updatePanControls();

  bindEvent(
    canvas,
    "mousedown",
    (event: MouseEvent) => {
      if (event.button !== 0) return;
      handlePointerStart(event.clientX, event.clientY, event);
    },
    { capture: true },
  );
  bindEvent(
    canvas,
    "mousemove",
    (event: MouseEvent) => {
      handlePointerMove(event.clientX, event.clientY, event);
    },
    { capture: true },
  );
  bindEvent(
    canvas,
    "mouseup",
    (event: MouseEvent) => {
      if (event.button !== 0) return;
      handlePointerRelease(event);
    },
    { capture: true },
  );
  bindEvent(
    canvas,
    "touchstart",
    (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      handlePointerStart(touch.clientX, touch.clientY, event);
    },
    { passive: false, capture: true },
  );
  bindEvent(
    canvas,
    "touchmove",
    (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      handlePointerMove(touch.clientX, touch.clientY, event);
    },
    { passive: false, capture: true },
  );
  bindEvent(
    canvas,
    "touchend",
    (event: TouchEvent) => handlePointerRelease(event),
    { passive: false, capture: true },
  );
  bindEvent(
    window,
    "mouseup",
    (event: MouseEvent) => {
      if (event.button !== 0) return;
      handleWindowPointerEnd(event);
    },
    { capture: true },
  );
  bindEvent(
    window,
    "touchend",
    (event: TouchEvent) => handleWindowPointerEnd(event),
    { passive: false, capture: true },
  );
  bindEvent(window, "keydown", handleKeyDown, { capture: true });
  bindEvent(canvas, "wheel", handleWheel, { passive: false, capture: true });
  bindEvent(canvas, "contextmenu", handleContextMenu, { capture: true });
  bindEvent(canvas, "dblclick", handleDoubleClick);
  bindEvent(canvas, "click", handleClick);

  return () => {
    cleanupDragState();
    while (cleanupHandlers.length > 0) cleanupHandlers.pop()?.();
  };
}
