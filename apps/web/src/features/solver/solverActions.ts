import {
  clearIterateState,
  computeDrawingPhase,
  getState,
  prepareAnimationInterval,
  resetTraceState,
  setState,
  setTraceCapacity,
  on,
  type SolverMode,
  type State,
} from "@/features/core/store";
import {
  createSolverControls,
  type SolverControl,
  type SolverSettingUpdater,
} from "@/features/solver/solverControls";
import { applySolverResult } from "@/features/solver/solverService";
import { createRotationController } from "@/features/solver/rotationController";
import { createResultPresenter } from "@/features/solver/resultPresenter";
import { runSolverWorker } from "@/features/solver/workerClient";
import type { ViewportApi } from "@/features/viewport/runtime";
import { isObjectiveDirectionUnbounded } from "@lpviz/polytope/objectiveDirection";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";

export type SolverActions = {
  updateSolverSetting: SolverSettingUpdater;
  setActiveSolverMode: (mode: SolverMode, solve?: boolean) => void;
  setTraceEnabled: (enabled: boolean) => void;
  startRotation: () => void;
  stopRotation: () => void;
  startReplay: () => void;
  recomputeIfModeActive: (mode: SolverMode) => void;
  invalidatePendingSolveResults: () => void;
  computePath: () => Promise<void>;
  handleProblemChange: () => void;
  flushDeferredRender: () => void;
  clearComputedState: () => void;
  setConstraintHighlight: (index: number | null) => void;
  setIterateHighlight: (index: number | null) => void;
  restoreFullVirtualResult: () => void;
  solverControls: SolverControl[];
  getSolverControl: (mode: SolverMode) => SolverControl | undefined;
  hasUnboundedObjectiveDirection: (state: State) => boolean;
  destroy: () => void;
};

export function createSolverActions(
  getCanvasManager: () => ViewportApi | null,
): SolverActions {
  let requestGeneration = 0;
  let iterateHoverActive = false;
  const present = createResultPresenter({ getCanvasManager });

  const updateSolverSetting: SolverSettingUpdater = (key, value) =>
    setState({
      solverSettings: { ...getState().solverSettings, [key]: value },
    });
  const hasUnboundedObjectiveDirection = (state: State) =>
    !!(
      hasPolytopeLines(state.polytope) &&
      state.objectiveVector &&
      state.polytope.kind === "unbounded" &&
      isObjectiveDirectionUnbounded(state.polytope.lines, [
        state.objectiveVector.x,
        state.objectiveVector.y,
      ])
    );
  const solverControls = createSolverControls({
    updateSolverSetting,
    hasUnboundedObjectiveDirection,
  });
  const getSolverControl = (mode: SolverMode) =>
    solverControls.find((c) => c.mode === mode);

  const clearComputedState = () => {
    clearIterateState();
    resetTraceState();
    present.clearResult();
  };
  const invalidatePendingSolveResults = () => {
    requestGeneration++;
  };
  const syncTraceCapacity = () => {
    const angleStep = Math.max(
      0.001,
      getState().solverSettings.objectiveAngleStep || 0.001,
    );
    setTraceCapacity(Math.max(1, Math.ceil((2 * Math.PI) / angleStep)));
  };

  const computePath = async () => {
    const cm = getCanvasManager();
    if (!cm) return;
    const state = getState();
    const solverDefinition = getSolverControl(state.solverMode);
    if (
      !solverDefinition ||
      !state.objectiveVector ||
      computeDrawingPhase(state) !== "ready_for_solvers" ||
      !hasPolytopeLines(state.polytope)
    ) {
      invalidatePendingSolveResults();
      clearComputedState();
      return;
    }
    const runBlock = solverDefinition.getRunBlock(state);
    if (runBlock) {
      invalidatePendingSolveResults();
      present.render(runBlock);
      return;
    }
    const request = solverDefinition.buildRequest(state);
    if (!request) {
      invalidatePendingSolveResults();
      clearComputedState();
      return;
    }
    const gen = ++requestGeneration;
    prepareAnimationInterval();
    try {
      const response = await runSolverWorker(request);
      if (gen !== requestGeneration) return;
      applySolverResult(response, (payload) => present.render(payload));
      cm.draw();
    } catch (error) {
      if (gen !== requestGeneration) return;
      present.renderError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const rotation = createRotationController({
    computePath,
    syncTraceCapacity,
    hasCanvas: () => getCanvasManager() !== null,
  });
  const setRotationActive = (active: boolean) => {
    prepareAnimationInterval();
    if (!active) rotation.cancel();
    else rotation.resetTiming();
    setState({ rotateObjectiveMode: active, highlightIteratePathIndex: null });
    if (!active) present.restoreFullVirtualResult();
  };
  const stopActiveMotion = () => {
    const s = getState();
    const wasRotating = s.rotateObjectiveMode;
    if (!wasRotating && s.animationIntervalId === null) return;
    invalidatePendingSolveResults();
    prepareAnimationInterval();
    rotation.cancel();
    setState({
      rotateObjectiveMode: false,
      highlightIteratePathIndex: null,
      animationIntervalId: null,
    });
    if (wasRotating) present.restoreFullVirtualResult();
  };
  const handleProblemChange = () => {
    const s = getState();
    const ready =
      computeDrawingPhase(s) === "ready_for_solvers" &&
      hasPolytopeLines(s.polytope) &&
      s.objectiveVector !== null;
    if (!ready) {
      invalidatePendingSolveResults();
      stopActiveMotion();
      clearComputedState();
      return;
    }
    if (!s.rotateObjectiveMode) {
      resetTraceState();
      void computePath();
      return;
    }
    void computePath().finally(() => rotation.rearm());
  };
  const setTraceEnabled = (enabled: boolean) => {
    const cm = getCanvasManager();
    setState(
      { traceEnabled: enabled },
    );
    if (!enabled) {
      resetTraceState();
      cm?.draw();
    } else syncTraceCapacity();
  };
  const startRotation = () => {
    if (!getState().objectiveVector)
      setState({ objectiveVector: { x: 1, y: 0 } });
    if (getState().traceEnabled) {
      syncTraceCapacity();
      resetTraceState();
    }
    setRotationActive(true);
    rotation.begin();
  };
  const startReplay = () => {
    const cm = getCanvasManager();
    if (!cm) return;
    const snap = getState();
    if (snap.rotateObjectiveMode) return;
    if (snap.animationIntervalId !== null)
      clearInterval(snap.animationIntervalId);
    // Replay grows a fresh IteratePath over the same flat buffer each step
    // (just bumping `count`), so no per-frame iterate copying is needed.
    const orig = snap.originalIteratePath;
    const origPhases = snap.originalIteratePhases;
    setState(
      {
        iteratePath: { points: orig.points, count: 0, stride: orig.stride },
        iteratePhases: [],
        iterateObjectiveVector: snap.originalIterateObjectiveVector,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      },
    );
    cm.draw();
    let i = 0;
    const id = window.setInterval(() => {
      if (getState().animationIntervalId !== id) return;
      if (i >= orig.count) {
        clearInterval(id);
        setState({ animationIntervalId: null }, { viewportDirty: {} });
        return;
      }
      setState(
        {
          iteratePath: {
            points: orig.points,
            count: i + 1,
            stride: orig.stride,
          },
          ...(origPhases.length > 0
            ? { iteratePhases: origPhases.slice(0, i + 1) }
            : {}),
          ...(!iterateHoverActive ? { highlightIteratePathIndex: i } : {}),
        },
      );
      i++;
      cm.draw();
    }, snap.solverSettings.replaySpeed || 500);
    setState({ animationIntervalId: id }, { viewportDirty: {} });
  };
  const recomputeIfModeActive = (mode: SolverMode) => {
    if (!getState().rotateObjectiveMode && getState().solverMode === mode)
      void computePath();
  };
  const resetTraceAndRedrawIfNeeded = () => {
    if (getState().traceBuffer.length === 0) return;
    resetTraceState();
    getCanvasManager()?.draw();
  };
  const setActiveSolverMode = (mode: SolverMode, solve = false) => {
    invalidatePendingSolveResults();
    if (getState().solverMode !== mode) resetTraceAndRedrawIfNeeded();
    setState({ solverMode: mode });
    if (solve && !getState().rotateObjectiveMode) void computePath();
  };
  const setConstraintHighlight = (index: number | null) => {
    const cm = getCanvasManager();
    if (!cm || getState().highlightIndex === index) return;
    setState(
      { highlightIndex: index },
    );
    cm.draw();
  };
  const setIterateHighlight = (index: number | null) => {
    const cm = getCanvasManager();
    if (!cm) return;
    iterateHoverActive = index !== null;
    if (getState().highlightIteratePathIndex === index) return;
    setState(
      { highlightIteratePathIndex: index },
    );
    cm.draw();
  };
  let wasNavigatingViewport = getState().isNavigatingViewport;
  const controller = new AbortController();
  on(
    ["isNavigatingViewport"],
    ({ isNavigatingViewport }) => {
      if (wasNavigatingViewport && !isNavigatingViewport) present.flushDeferred();
      wasNavigatingViewport = isNavigatingViewport;
    },
    controller.signal,
  );
  return {
    updateSolverSetting,
    setActiveSolverMode,
    setTraceEnabled,
    startRotation,
    stopRotation: stopActiveMotion,
    startReplay,
    recomputeIfModeActive,
    invalidatePendingSolveResults,
    computePath,
    handleProblemChange,
    flushDeferredRender: present.flushDeferred,
    clearComputedState,
    setConstraintHighlight,
    setIterateHighlight,
    restoreFullVirtualResult: present.restoreFullVirtualResult,
    solverControls,
    getSolverControl,
    hasUnboundedObjectiveDirection,
    destroy: () => {
      rotation.cancel();
      // stop any active replay; its interval would otherwise keep mutating
      // the store and drawing on the destroyed viewport runtime
      prepareAnimationInterval();
      controller.abort();
    },
  };
}
