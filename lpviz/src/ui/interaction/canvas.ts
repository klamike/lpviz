import { ViewportManager } from "../viewport";
import { VRep } from "../../solvers/utils/polygon";
import { DEFAULT_Z_SCALE, computeDrawingPhase, getState, mutate, setState } from "../../state/store";
import type { DragTarget, DrawingPhase, EditorInteractionState, HistoryEntry, State } from "../../state/store";
import type { PointXY } from "../../solvers/utils/blas";
import { verticesFromLines } from "../../solvers/utils/halfPlaneIntersection";
import {
  getEditorContext,
  getEditorTransition,
} from "./editorSession";

const VERTEX_HIT_RADIUS = 12;
type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
type ConstraintDragTarget = Extract<DragTarget, { kind: "constraint" }>;
const EPS = 1e-10;
export function registerCanvasInteractions(
  canvasManager: ViewportManager,
  ui: {
    hideNullStateMessage(): void;
    updateSolverModeButtons(): void;
    updateObjectiveDisplay(): void;
    updateMaximizeVisibility(): void;
    updateZScaleValue(): void;
  },
  saveToHistory: (
    snapshotSource?: Pick<State, "vertices" | "objectiveVector" | "completionMode">,
    options?: { clearRedo?: boolean },
  ) => void,
  sendPolytope: () => void,
) {
  const canvas = canvasManager.canvas;
  const interactionController = {
    pendingDragHistoryEntry: null as HistoryEntry | null,

    captureHistoryEntry(state: Pick<State, "vertices" | "objectiveVector" | "completionMode">): HistoryEntry {
      return {
        vertices: state.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })),
        objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
        completionMode: state.completionMode,
      };
    },

    persistPendingDragHistory() {
      if (!this.pendingDragHistoryEntry) return;
      saveToHistory(this.pendingDragHistoryEntry);
      this.pendingDragHistoryEntry = null;
    },

    updatePanControls() {
      canvasManager.set2DPanEnabled(computeDrawingPhase(getState()) === "ready_for_solvers");
    },

    exceedsDragThreshold(clientX: number, clientY: number) {
      const dragStartPos =
        getState().editorInteraction.kind === "pending-drag" ? getState().editorInteraction.dragStartPos : null;
      if (!dragStartPos) return false;
      return Math.hypot(clientX - dragStartPos.x, clientY - dragStartPos.y) > 5;
    },

    getLogicalFromClient(clientX: number, clientY: number): PointXY {
      const rect = canvas.getBoundingClientRect();
      return canvasManager.toLogicalCoords(clientX - rect.left, clientY - rect.top);
    },

    getLocalFromClient(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },

    findVertexNearLocalPoint(localX: number, localY: number, vertices: PointXY[]) {
      return vertices.findIndex((vertex) => {
        const canvasPoint = canvasManager.toCanvasCoords(vertex.x, vertex.y);
        return Math.hypot(localX - canvasPoint.x, localY - canvasPoint.y) <= VERTEX_HIT_RADIUS;
      });
    },

    findEdgeNearPoint(point: PointXY, vertices: PointXY[], completionMode: "draft" | "closed" | "open", tolerance = 0.5) {
      const edgeCount = completionMode === "closed" ? vertices.length : Math.max(0, vertices.length - 1);
      for (let index = 0; index < edgeCount; index++) {
        const start = vertices[index];
        const end = vertices[index + 1] ?? (completionMode === "closed" ? vertices[0] : undefined);
        if (!start || !end) continue;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;

        const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2;
        if (t < 0 || t > 1) continue;

        const projection = { x: start.x + t * dx, y: start.y + t * dy };
        if (Math.hypot(point.x - projection.x, point.y - projection.y) < tolerance) {
          return index;
        }
      }
      return null;
    },

    getVisibleBounds(): Bounds {
      const margin = 50;
      const topLeft = canvasManager.toLogicalCoords(-margin, -margin);
      const bottomRight = canvasManager.toLogicalCoords(window.innerWidth + margin, window.innerHeight + margin);
      return {
        minX: Math.min(topLeft.x, bottomRight.x) - margin,
        maxX: Math.max(topLeft.x, bottomRight.x) + margin,
        minY: Math.min(topLeft.y, bottomRight.y) - margin,
        maxY: Math.max(topLeft.y, bottomRight.y) + margin,
      };
    },

    distanceToSegment(point: PointXY, start: PointXY, end: PointXY) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return Math.hypot(point.x - start.x, point.y - start.y);
      const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
      const projection = { x: start.x + t * dx, y: start.y + t * dy };
      return Math.hypot(point.x - projection.x, point.y - projection.y);
    },

    clipRayToBounds(start: PointXY, direction: PointXY, bounds: Bounds): [PointXY, PointXY] | null {
      const candidates: Array<{ t: number; point: PointXY }> = [];

      if (Math.abs(direction.x) > EPS) {
        for (const x of [bounds.minX, bounds.maxX]) {
          const t = (x - start.x) / direction.x;
          if (t <= EPS) continue;
          const y = start.y + t * direction.y;
          if (y >= bounds.minY - EPS && y <= bounds.maxY + EPS) {
            candidates.push({ t, point: { x, y } });
          }
        }
      }

      if (Math.abs(direction.y) > EPS) {
        for (const y of [bounds.minY, bounds.maxY]) {
          const t = (y - start.y) / direction.y;
          if (t <= EPS) continue;
          const x = start.x + t * direction.x;
          if (x >= bounds.minX - EPS && x <= bounds.maxX + EPS) {
            candidates.push({ t, point: { x, y } });
          }
        }
      }

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.t - a.t);
      return [start, candidates[0].point];
    },

    findBoundaryRayNearPoint(point: PointXY) {
      const { completionMode, polytope } = getState();
      if (completionMode !== "open" || !polytope?.boundaryRays?.length) return null;

      const bounds = this.getVisibleBounds();
      for (let index = 0; index < polytope.boundaryRays.length; index++) {
        const ray = polytope.boundaryRays[index];
        const clipped = this.clipRayToBounds(
          { x: ray.start[0], y: ray.start[1] },
          { x: ray.direction[0], y: ray.direction[1] },
          bounds,
        );
        if (!clipped) continue;
        const [start, end] = clipped;
        if (this.distanceToSegment(point, start, end) < 0.5) {
          return index;
        }
      }
      return null;
    },

    getDragStartTarget(state: State, clientX: number, clientY: number): DragTarget | null {
      const logicalCoords = this.getLogicalFromClient(clientX, clientY);
      const local = this.getLocalFromClient(clientX, clientY);
      const { session } = getEditorContext(state);

      if (session.kind === "drafting") {
        const index = this.findVertexNearLocalPoint(local.x, local.y, state.vertices);
        return index === -1 ? null : { kind: "point", index };
      }

      if (state.objectiveVector) {
        const tip = canvasManager.getObjectiveScreenPosition(state.objectiveVector);
        if (Math.hypot(local.x - tip.x, local.y - tip.y) < 10) {
          return { kind: "objective" };
        }
      }

      const vertexIndex = this.findVertexNearLocalPoint(local.x, local.y, state.vertices);
      if (vertexIndex !== -1) {
        return { kind: "point", index: vertexIndex };
      }

      if (session.kind === "editing-closed" && state.vertices.length >= 3) {
        const polytope = VRep.fromPoints(state.vertices);
        const edgeIndex = polytope.findEdgeNearPoint(logicalCoords);
        if (edgeIndex !== null) {
          const lineContext = state.polytope?.lines;
          if (!lineContext || lineContext.length === 0) {
            return null;
          }
          const line = lineContext[edgeIndex];
          if (!line) {
            return null;
          }
          const nextIndex = (edgeIndex + 1) % state.vertices.length;
          const start = state.vertices[edgeIndex];
          const end = state.vertices[nextIndex];
          if (Math.hypot(end.x - start.x, end.y - start.y) > 1e-6) {
            return {
              kind: "constraint",
              operation: {
                kind: "closed-line",
                lineIndex: edgeIndex,
                lines: lineContext.map(([A, B, C]) => [A, B, C]),
              },
              start: logicalCoords,
              normal: { x: line[0], y: line[1] },
            };
          }
        }
      }

      if (session.kind === "editing-open" && state.vertices.length >= 2) {
        const lineContext = state.polytope?.lines;
        if (!lineContext || lineContext.length === 0) {
          return null;
        }

        const edgeIndex = this.findEdgeNearPoint(logicalCoords, state.vertices, "open");
        if (edgeIndex !== null) {
          const line = lineContext[edgeIndex];
          if (!line) {
            return null;
          }
          return {
            kind: "constraint",
            operation: {
              kind: "open-vertices",
              vertexIndices: [edgeIndex, edgeIndex + 1],
            },
            start: logicalCoords,
            normal: { x: line[0], y: line[1] },
          };
        }

        const rayIndex = this.findBoundaryRayNearPoint(logicalCoords);
        if (rayIndex === null) {
          return null;
        }

        const line = lineContext[rayIndex === 0 ? 0 : lineContext.length - 1];
        if (!line) {
          return null;
        }

        return {
          kind: "constraint",
          operation: {
            kind: "open-vertices",
            vertexIndices: rayIndex === 0 ? [0, 1] : [state.vertices.length - 2, state.vertices.length - 1],
          },
          start: logicalCoords,
          normal: { x: line[0], y: line[1] },
        };
      }

      return null;
    },

    commitEdit(
      result: {
        vertices: PointXY[];
        completionMode: "draft" | "open" | "closed";
        interiorPoint: PointXY | null;
      },
      options: { saveToHistory?: boolean; extraPatch?: Partial<State> } = {},
    ) {
      if (options.saveToHistory ?? true) {
        saveToHistory();
      }
      setState({
        vertices: result.vertices,
        completionMode: result.completionMode,
        interiorPoint: result.interiorPoint,
        polytope: null as null,
        ...(options.extraPatch ?? {}),
      }, { viewportDirty: canvasManager.getPolytopeDirtyFlags() });
      ui.hideNullStateMessage();
      canvasManager.draw();
      sendPolytope();
      this.updatePanControls();
    },

    applyEditorTransition(transition: ReturnType<typeof getEditorTransition>, rejectMessage: string) {
      if (transition.kind === "reject-nonconvex") {
        alert(rejectMessage);
        return;
      }

      if (transition.kind === "edit") {
        this.commitEdit(transition.result, { saveToHistory: transition.saveToHistory });
        ui.hideNullStateMessage();
        return;
      }

      if (transition.saveToHistory) {
        saveToHistory();
      }
      setState({ objectiveVector: transition.objectiveVector }, { viewportDirty: canvasManager.getObjectiveDirtyFlags() });
      ui.updateMaximizeVisibility();
      ui.updateSolverModeButtons();
      ui.updateObjectiveDisplay();
      sendPolytope();
      canvasManager.draw();
      this.updatePanControls();
    },

    applyConstraintDrag(target: ConstraintDragTarget, logicalCoords: PointXY) {
      const delta =
        (logicalCoords.x - target.start.x) * target.normal.x +
        (logicalCoords.y - target.start.y) * target.normal.y;

      if (target.operation.kind === "closed-line") {
        const line = target.operation.lines[target.operation.lineIndex];
        const length = Math.hypot(line[0], line[1]);
        if (length <= 0) {
          return;
        }

        const shift = delta * length;
        const updatedLines = target.operation.lines.slice();
        updatedLines[target.operation.lineIndex] = [line[0], line[1], line[2] + shift];
        const updatedVertices = verticesFromLines(updatedLines);
        if (updatedVertices.length < 2) {
          return;
        }

        mutate((draft) => {
          draft.vertices = updatedVertices.map(([x, y]) => ({ x, y }));
        }, { viewportDirty: canvasManager.getPolytopeDirtyFlags() });

        setState({
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
        }, { viewportDirty: {} });
      } else {
        mutate((draft) => {
          const shiftX = target.normal.x * delta;
          const shiftY = target.normal.y * delta;
          for (const index of target.operation.vertexIndices) {
            if (draft.vertices[index]) {
              draft.vertices[index] = { x: draft.vertices[index].x + shiftX, y: draft.vertices[index].y + shiftY };
            }
          }
        }, { viewportDirty: canvasManager.getPolytopeDirtyFlags() });
        setState({
          editorInteraction: {
            kind: "dragging",
            target: {
              kind: "constraint",
              operation: target.operation,
              start: logicalCoords,
              normal: target.normal,
            },
          },
        }, { viewportDirty: {} });
      }

      sendPolytope();
      canvasManager.draw();
    },

    restoreViewportControls() {
      canvasManager.setControlsBlocked(false);
      this.updatePanControls();
    },

    cleanupDragState() {
      this.pendingDragHistoryEntry = null;
      setState({
        editorInteraction: { kind: "idle" },
        lastCompletedInteraction: "none",
      }, { viewportDirty: {} });
      this.restoreViewportControls();
      requestAnimationFrame(() => this.restoreViewportControls());
    },

    handleDragEnd() {
      const interaction = getState().editorInteraction;
      if (interaction.kind === "dragging") {
        setState({
          editorInteraction: { kind: "idle" },
          lastCompletedInteraction:
            interaction.target.kind === "point"
              ? "dragged-point"
              : interaction.target.kind === "constraint"
                ? "dragged-constraint"
                : "dragged-objective",
        }, { viewportDirty: {} });
        if (interaction.target.kind === "objective") {
          ui.updateMaximizeVisibility();
          ui.updateObjectiveDisplay();
          ui.updateSolverModeButtons();
        }
        sendPolytope();
      }

      this.cleanupDragState();
    },

    handlePointerRelease(event: MouseEvent | TouchEvent) {
      const { isTransitioning3D } = getState();
      if (isTransitioning3D) return;

      const interactionBeforeEnd = getState();
      this.handleDragEnd();
      if (interactionBeforeEnd.editorInteraction.kind !== "idle") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },

    finishOpenRegion() {
      if (getState().tourActive) {
        return;
      }

      const finishResult = getEditorTransition(getState(), { kind: "finish-open" });
      if (finishResult.kind === "noop") {
        return;
      }

      if (finishResult.kind === "reject-nonconvex") {
        alert("This open region is nonconvex. Please adjust the vertices before pressing Enter.");
        return;
      }

      this.commitEdit(finishResult.result, {
        saveToHistory: finishResult.saveToHistory,
        extraPatch: { currentMouse: null },
      });
      ui.updateSolverModeButtons();
      canvasManager.set2DPanEnabled(true);
    },

    handleDragStart(clientX: number, clientY: number): boolean {
      const state = getState();
      const target = this.getDragStartTarget(state, clientX, clientY);
      if (!target) {
        return false;
      }

      if (target.kind === "objective") {
        this.pendingDragHistoryEntry = this.captureHistoryEntry(state);
        setState({
          editorInteraction: {
            kind: "dragging",
            target,
          },
        }, { viewportDirty: {} });
        canvasManager.setControlsBlocked(true);
        return true;
      }

      setState({
        editorInteraction: {
          kind: "pending-drag",
          target,
          dragStartPos: { x: clientX, y: clientY },
        },
        lastCompletedInteraction: "none",
      }, { viewportDirty: {} });
      this.pendingDragHistoryEntry = this.captureHistoryEntry(state);
      if (target.kind === "point") {
        canvasManager.setControlsBlocked(true);
      }
      return true;
    },

    applyDraggingInteraction(interaction: Extract<EditorInteractionState, { kind: "dragging" }>, logicalCoords: PointXY) {
      this.persistPendingDragHistory();
      if (interaction.target.kind === "point") {
        mutate((draft) => {
          draft.vertices[interaction.target.index] = logicalCoords;
        }, { viewportDirty: canvasManager.getPolytopeDirtyFlags() });
        sendPolytope();
        canvasManager.draw();
        return;
      }

      if (interaction.target.kind === "constraint") {
        this.applyConstraintDrag(interaction.target, logicalCoords);
        return;
      }

      setState({ objectiveVector: logicalCoords }, { viewportDirty: canvasManager.getObjectiveDirtyFlags() });
      sendPolytope();
      canvasManager.draw();
    },

    updatePointerPreview(phase: DrawingPhase, logicalCoords: PointXY) {
      if (phase === "empty" || phase === "sketching_polytope") {
        setState({ currentMouse: logicalCoords }, { viewportDirty: canvasManager.getDraftPreviewDirtyFlags() });
        canvasManager.draw();
        return;
      }

      if (phase === "awaiting_objective" || phase === "objective_preview") {
        setState({ currentObjective: logicalCoords }, { viewportDirty: canvasManager.getObjectiveDirtyFlags() });
        canvasManager.draw();
      }
    },

    handleDragMove(clientX: number, clientY: number) {
      const logicalCoords = this.getLogicalFromClient(clientX, clientY);
      const initialInteraction = getState().editorInteraction;
      if (initialInteraction.kind === "pending-drag" && this.exceedsDragThreshold(clientX, clientY)) {
        setState({
          editorInteraction: {
            kind: "dragging",
            target: initialInteraction.target,
          },
        }, { viewportDirty: {} });
        canvasManager.setControlsBlocked(true);
      }

      const state = getState();
      const interaction = state.editorInteraction;
      const phaseSnapshot = computeDrawingPhase(state);

      if (interaction.kind === "dragging") {
        this.applyDraggingInteraction(interaction, logicalCoords);
        return;
      }

      if (getState().tourActive) {
        return;
      }

      this.updatePointerPreview(phaseSnapshot, logicalCoords);
    },

    stopBlockedPointerEvent(event: MouseEvent | TouchEvent) {
      if (getState().editorInteraction.kind === "idle") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    },

    handlePointerStart(clientX: number, clientY: number, event: MouseEvent | TouchEvent) {
      if (getState().isTransitioning3D) return;
      const handled = this.handleDragStart(clientX, clientY);
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },

    handlePointerMove(clientX: number, clientY: number, event: MouseEvent | TouchEvent) {
      if (getState().isTransitioning3D) return;
      this.handleDragMove(clientX, clientY);
      this.stopBlockedPointerEvent(event);
    },

    handlePointerEnd(event: MouseEvent | TouchEvent) {
      this.handlePointerRelease(event);
    },

    handleWindowPointerEnd(event: MouseEvent | TouchEvent) {
      if (event.target === canvas) return;
      if (getState().editorInteraction.kind === "idle") return;
      this.handlePointerRelease(event);
    },

    shouldIgnoreEditEvent() {
      const state = getState();
      return state.isTransitioning3D || state.tourActive;
    },

    handleWheel(event: WheelEvent) {
      const { is3DMode, isTransitioning3D, zScale } = getState();
      const is3D = is3DMode || isTransitioning3D;
      if (!is3D || !event.shiftKey || isTransitioning3D) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const zoomFactor = 1.05;
      const dominantDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (dominantDelta === 0) return;

      const effectiveScale = (zScale || DEFAULT_Z_SCALE) * (dominantDelta < 0 ? 1 / zoomFactor : zoomFactor);
      const clampedScale = Math.max(0.01, Math.min(100, effectiveScale));
      setState({ zScale: clampedScale }, { viewportDirty: canvasManager.getZScaleDirtyFlags() });
      canvasManager.draw();
      ui.updateZScaleValue();
    },

    handleContextMenu(event: MouseEvent) {
      if (this.shouldIgnoreEditEvent()) {
        return;
      }

      const state = getState();
      const local = this.getLocalFromClient(event.clientX, event.clientY);
      const { geometry: { vertices: displayVertices } } = getEditorContext(state);
      const deleteIndex = this.findVertexNearLocalPoint(local.x, local.y, displayVertices);
      if (deleteIndex === -1) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const deletion = getEditorTransition(state, { kind: "delete-vertex", deleteIndex });
      this.applyEditorTransition(deletion, "Deleting this vertex would make the region nonconvex.");
    },

    handleDoubleClick(event: MouseEvent) {
      if (this.shouldIgnoreEditEvent()) {
        return;
      }

      const logicalMouse = this.getLogicalFromClient(event.clientX, event.clientY);
      const state = getState();
      const { geometry: { vertices: displayVertices, mode: displayMode } } = getEditorContext(state);
      const hullRepair = getEditorTransition(state, { kind: "repair-displayed-hull", point: logicalMouse });
      if (hullRepair.kind !== "noop") {
        this.applyEditorTransition(hullRepair, "Repairing this region would make it nonconvex.");
        return;
      }

      const edgeIndex = this.findEdgeNearPoint(logicalMouse, displayVertices, displayMode);
      if (edgeIndex !== null) {
        const insertion = getEditorTransition(state, {
          kind: "insert-edge-point",
          edgeIndex,
          point: logicalMouse,
        });
        if (insertion.kind !== "noop") {
          this.applyEditorTransition(insertion, "Inserting this point would make the region nonconvex.");
          return;
        }
      }

      const rayIndex = this.findBoundaryRayNearPoint(logicalMouse);
      if (rayIndex !== null) {
        const insertion = getEditorTransition(state, {
          kind: "insert-boundary-ray-point",
          rayIndex,
          point: { x: logicalMouse.x, y: logicalMouse.y },
        });
        if (insertion.kind !== "noop") {
          this.applyEditorTransition(insertion, "Inserting this point would make the region nonconvex.");
        }
      }
    },

    handleClick(event: MouseEvent) {
      const initialState = getState();
      if (this.shouldIgnoreEditEvent()) {
        return;
      }

      if (initialState.lastCompletedInteraction !== "none") {
        setState({ lastCompletedInteraction: "none" });
        return;
      }

      const state = getState();
      const { session } = getEditorContext(state);
      const drawingPhase = session.kind === "drafting";
      const objectivePhase = session.kind === "selecting-objective";
      if (state.is3DMode && !drawingPhase && !objectivePhase) {
        return;
      }

      if (drawingPhase || objectivePhase) {
        const point = this.getLogicalFromClient(event.clientX, event.clientY);
        this.applyEditorTransition(
          getEditorTransition(state, { kind: "click", point }),
          "Adding this vertex would make the polytope nonconvex. Please choose another point.",
        );
      }
    },
  };
  interactionController.updatePanControls();

  canvas.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0) return;
      interactionController.handlePointerStart(event.clientX, event.clientY, event);
    },
    { capture: true },
  );

  canvas.addEventListener(
    "mousemove",
    (event) => {
      interactionController.handlePointerMove(event.clientX, event.clientY, event);
    },
    { capture: true },
  );

  canvas.addEventListener(
    "mouseup",
    (event) => {
      if (event.button !== 0) return;
      interactionController.handlePointerEnd(event);
    },
    { capture: true },
  );

  canvas.addEventListener(
    "touchstart",
    (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      interactionController.handlePointerStart(touch.clientX, touch.clientY, event);
    },
    { passive: false, capture: true },
  );

  canvas.addEventListener(
    "touchmove",
    (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      interactionController.handlePointerMove(touch.clientX, touch.clientY, event);
    },
    { passive: false, capture: true },
  );

  canvas.addEventListener(
    "touchend",
    (event: TouchEvent) => {
      interactionController.handlePointerEnd(event);
    },
    { passive: false, capture: true },
  );

  window.addEventListener(
    "mouseup",
    (event) => {
      if (event.button !== 0) return;
      interactionController.handleWindowPointerEnd(event);
    },
    { capture: true },
  );

  window.addEventListener(
    "touchend",
    (event: TouchEvent) => {
      interactionController.handleWindowPointerEnd(event);
    },
    { passive: false, capture: true },
  );
  canvas.addEventListener(
    "wheel",
    (event) => interactionController.handleWheel(event),
    { passive: false, capture: true },
  );
  canvas.addEventListener(
    "contextmenu",
    (event) => interactionController.handleContextMenu(event),
    { capture: true },
  );

  canvas.addEventListener("dblclick", (event) => interactionController.handleDoubleClick(event));

  canvas.addEventListener("click", (event) => interactionController.handleClick(event));

  return { finishOpenRegion: () => interactionController.finishOpenRegion() };
}
