import { clearIterateState, computeDrawingPhase, getState, mutate, prepareAnimationInterval, resetTraceState, setState, setTraceCapacity, type SolverMode, type State } from "../../state/store";
import { runSolverWorker } from "../../solvers/worker/client";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";
import type { SolverWorkerPayload, SolverWorkerSuccessResponse } from "../../solvers/worker/solverWorker";
import { isObjectiveDirectionUnbounded } from "../../solvers/utils/objectiveDirection";
import { hasPolytopeLines } from "../../solvers/utils/polytopeTypes";
import { computeObjectiveRotationStep } from "../../solvers/utils/objectiveDirection";
import { ViewportManager } from "../viewport";

type SolverControl = {
  mode: SolverMode;
  isSelectable: (state: State) => boolean;
  getRunBlock: (state: State) => ResultRenderPayload | null;
  buildRequest: (state: State) => SolverWorkerPayload | null;
  applyResult: (response: SolverWorkerSuccessResponse, updateResult: (payload: ResultRenderPayload) => void) => void;
};

export function createSolverRuntime({
  canvasManager,
  getSolverControl,
  objectiveAngleStepSlider,
  objectiveRotationSpeedSlider,
  replaySpeedSlider,
  rotationSettings,
  setElementVisibility,
  resultRuntime,
  uiRuntime,
}: {
  canvasManager: ViewportManager;
  getSolverControl: (mode: SolverMode) => SolverControl | undefined;
  objectiveAngleStepSlider: HTMLInputElement;
  objectiveRotationSpeedSlider: HTMLInputElement;
  replaySpeedSlider: HTMLInputElement;
  rotationSettings: HTMLElement;
  setElementVisibility: (element: HTMLElement, visible: boolean, visibleClass?: "is-block" | "is-flex" | null) => void;
  resultRuntime: {
    render: (payload: ResultRenderPayload, options?: { limitVirtualRows?: boolean }) => void;
    restoreFullVirtualResult: () => void;
    clear: () => void;
  };
  uiRuntime: {
    syncButtonStates: () => void;
    updateObjectiveDisplay: () => void;
  };
}) {
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  const runtime = {
    baseRotationWaitMs: 30,
    objectiveRotationDirection: 1 as 1 | -1,
    requestGeneration: 0,
    rotationRafId: null as number | null,
    rotationLastFrameTime: null as number | null,
    rotationElapsedMs: 0,
    rotationComputeInFlight: false,

    invalidatePendingSolveResults() {
      this.requestGeneration++;
    },

    clearComputedState() {
      clearIterateState();
      resultRuntime.clear();
    },

    cancelRotationLoop() {
      if (this.rotationRafId !== null) {
        cancelAnimationFrame(this.rotationRafId);
        this.rotationRafId = null;
      }
      this.rotationLastFrameTime = null;
      this.rotationElapsedMs = 0;
      this.rotationComputeInFlight = false;
    },

    advanceRotationClock(timestamp: number) {
      if (!getState().rotateObjectiveMode) return;

      if (this.rotationLastFrameTime === null) {
        this.rotationLastFrameTime = timestamp;
      } else {
        this.rotationElapsedMs += timestamp - this.rotationLastFrameTime;
        this.rotationLastFrameTime = timestamp;
      }

      const speed = Math.max(0.1, parseFloat(objectiveRotationSpeedSlider.value) || 1);
      const intervalMs = Math.max(1, this.baseRotationWaitMs / speed);
      if (!this.rotationComputeInFlight && this.rotationElapsedMs >= intervalMs) {
        this.rotationElapsedMs = 0;
        void this.computeAndRotate();
      }
    },

    ensureRotationLoop() {
      if (!getState().rotateObjectiveMode || this.rotationRafId !== null) return;

      const tick = (timestamp: number) => {
        this.rotationRafId = null;
        if (!getState().rotateObjectiveMode) return;
        this.advanceRotationClock(timestamp);

        if (getState().rotateObjectiveMode) {
          this.rotationRafId = requestAnimationFrame(tick);
        }
      };

      this.rotationRafId = requestAnimationFrame(tick);
    },

    hasComputedConstraintSystem(state: State) {
      return hasPolytopeLines(state.polytope);
    },

    hasUnboundedObjectiveDirection(state: State) {
      const { polytope, objectiveVector } = state;
      if (!hasPolytopeLines(polytope) || !objectiveVector || polytope.kind !== "unbounded") {
        return false;
      }
      return isObjectiveDirectionUnbounded(polytope.lines, [objectiveVector.x, objectiveVector.y]);
    },

    isSelectable(state: State, mode: SolverMode) {
      return getSolverControl(mode)?.isSelectable(state) ?? false;
    },

    getRunBlock(state: State, mode: SolverMode): ResultRenderPayload | null {
      return getSolverControl(mode)?.getRunBlock(state) ?? null;
    },

    syncTraceCapacity() {
      const angleStep = Math.max(0.001, parseFloat(objectiveAngleStepSlider.value) || 0.001);
      setTraceCapacity(Math.max(1, Math.ceil((2 * Math.PI) / angleStep)));
    },

    recomputeIfModeActive(mode: SolverMode) {
      const state = getState();
      if (state.rotateObjectiveMode) return;
      if (state.solverMode === mode) {
        void this.computePath();
      }
    },

    async computePath() {
      const state = getState();
      const solverDefinition = getSolverControl(state.solverMode);
      if (!solverDefinition || !state.objectiveVector || computeDrawingPhase(state) !== "ready_for_solvers" || !this.hasComputedConstraintSystem(state)) {
        this.invalidatePendingSolveResults();
        this.clearComputedState();
        uiRuntime.syncButtonStates();
        return;
      }

      const runBlock = this.getRunBlock(state, state.solverMode);
      if (runBlock) {
        this.invalidatePendingSolveResults();
        resultRuntime.render(runBlock);
        uiRuntime.syncButtonStates();
        return;
      }

      const request = solverDefinition.buildRequest(state);
      if (!request) {
        this.invalidatePendingSolveResults();
        this.clearComputedState();
        uiRuntime.syncButtonStates();
        return;
      }

      const requestGeneration = ++this.requestGeneration;
      prepareAnimationInterval();

      try {
        const response = await runSolverWorker(request);
        if (requestGeneration !== this.requestGeneration) {
          return;
        }
        solverDefinition.applyResult(response, (payload) => resultRuntime.render(payload));
        canvasManager.draw();
        uiRuntime.syncButtonStates();
      } catch (error) {
        if (requestGeneration !== this.requestGeneration) {
          return;
        }
        resultRuntime.render({
          type: "html",
          html: `
            <div class="iterate-header">Solver error</div>
            <div class="iterate-item-nohover">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>
          `,
        });
        uiRuntime.syncButtonStates();
      }
    },

    setTraceEnabled(enabled: boolean) {
      setState({ traceEnabled: enabled }, { viewportDirty: canvasManager.getTraceDirtyFlags() });
      if (!enabled) {
        resetTraceState();
        canvasManager.draw();
        return;
      }
      this.syncTraceCapacity();
    },

    setRotationActive(active: boolean) {
      prepareAnimationInterval();
      if (!active) {
        this.cancelRotationLoop();
      } else {
        this.rotationLastFrameTime = null;
        this.rotationElapsedMs = 0;
      }
      setState({
        rotateObjectiveMode: active,
        highlightIteratePathIndex: null,
      }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
      setElementVisibility(rotationSettings, active);
      uiRuntime.syncButtonStates();
      if (!active) {
        resultRuntime.restoreFullVirtualResult();
      }
    },

    stopActiveMotion() {
      const state = getState();
      const wasRotating = state.rotateObjectiveMode;
      const hadAnimation = state.animationIntervalId !== null;
      if (!wasRotating && !hadAnimation) {
        return;
      }

      this.invalidatePendingSolveResults();
      prepareAnimationInterval();
      this.cancelRotationLoop();
      setState({
        rotateObjectiveMode: false,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
      setElementVisibility(rotationSettings, false);
      uiRuntime.syncButtonStates();
      if (wasRotating) {
        resultRuntime.restoreFullVirtualResult();
      }
    },

    handleProblemChange() {
      const state = getState();
      const readyForSolvers =
        computeDrawingPhase(state) === "ready_for_solvers" &&
        this.hasComputedConstraintSystem(state) &&
        state.objectiveVector !== null;

      if (!readyForSolvers) {
        this.invalidatePendingSolveResults();
        this.stopActiveMotion();
        this.clearComputedState();
        uiRuntime.syncButtonStates();
        return;
      }

      uiRuntime.syncButtonStates();

      if (!state.rotateObjectiveMode) {
        void this.computePath();
        return;
      }

      void this.computePath().finally(() => {
        const nextState = getState();
        if (nextState.rotateObjectiveMode) {
          this.ensureRotationLoop();
        }
      });
    },

    scheduleNextRotation() {
      this.ensureRotationLoop();
    },

    async computeAndRotate() {
      const state = getState();
      if (!state.rotateObjectiveMode || this.rotationComputeInFlight) return;
      this.rotationComputeInFlight = true;

      const objectiveVector = state.objectiveVector ?? { x: 1, y: 0 };
      const angleStep = Math.max(0.001, parseFloat(objectiveAngleStepSlider.value) || 0.001);
      const rotationStep = computeObjectiveRotationStep({
        objectiveVector,
        angleStep,
        rotationDirection: this.objectiveRotationDirection,
        polytope: state.polytope,
      });

      this.objectiveRotationDirection = rotationStep.nextDirection;
      setState({
        objectiveVector: rotationStep.nextObjective,
        highlightIteratePathIndex: null,
      }, { viewportDirty: canvasManager.getObjectiveDirtyFlags() });
      uiRuntime.updateObjectiveDisplay();

      if (getState().traceEnabled) {
        this.syncTraceCapacity();
      }

      try {
        await this.computePath();
      } finally {
        this.rotationComputeInFlight = false;
        const nextState = getState();
        if (!nextState.rotateObjectiveMode) {
          return;
        }
        this.ensureRotationLoop();
      }
    },

    startReplay() {
      const solverSnapshot = getState();
      if (solverSnapshot.rotateObjectiveMode) return;

      const animationIntervalId = solverSnapshot.animationIntervalId;
      if (animationIntervalId !== null) {
        clearInterval(animationIntervalId);
      }
      setState({ animationIntervalId: null }, { viewportDirty: {} });

      const intervalTime = parseInt(replaySpeedSlider.value, 10) || 500;
      const iteratesToAnimate = [...solverSnapshot.originalIteratePath];
      const phasesToAnimate = [...solverSnapshot.originalIteratePhases];
      setState({
        iteratePath: [],
        iteratePhases: [],
        iterateObjectiveVector: solverSnapshot.originalIterateObjectiveVector,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
      canvasManager.draw();

      let currentIndex = 0;
      const intervalId = window.setInterval(() => {
        if (getState().animationIntervalId !== intervalId) return;

        if (currentIndex >= iteratesToAnimate.length) {
          clearInterval(intervalId);
          setState({ animationIntervalId: null }, { viewportDirty: {} });
          return;
        }

        mutate((draft) => {
          draft.iteratePath.push(iteratesToAnimate[currentIndex]);
          if (phasesToAnimate.length > 0) {
            draft.iteratePhases.push(phasesToAnimate[currentIndex]);
          }
          draft.highlightIteratePathIndex = currentIndex;
        }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
        currentIndex++;
        canvasManager.draw();
      }, intervalTime);

      setState({ animationIntervalId: intervalId }, { viewportDirty: {} });
    },

    startRotation() {
      const hadObjective = Boolean(getState().objectiveVector);

      this.objectiveRotationDirection = 1;
      if (!hadObjective) {
        setState({ objectiveVector: { x: 1, y: 0 } }, { viewportDirty: canvasManager.getObjectiveDirtyFlags() });
      }

      if (getState().traceEnabled) {
        this.syncTraceCapacity();
        resetTraceState();
      }

      this.setRotationActive(true);
      void this.computeAndRotate();

      if (!hadObjective) {
        uiRuntime.updateObjectiveDisplay();
      }
    },

    stopRotation() {
      this.stopActiveMotion();
    },
  };

  return runtime;
}
