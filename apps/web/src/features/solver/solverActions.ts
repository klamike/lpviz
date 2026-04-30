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
import {
  formatVirtualResultRow,
  type ResultRenderPayload,
  type VirtualResultPayload,
} from "@/features/solver/solverService";
import type { ResultTextBlock } from "@/features/solver/types";
import { runSolverWorker } from "@/features/solver/workerClient";
import type { ViewportApi } from "@/features/viewport/runtime";
import {
  computeObjectiveRotationStep,
  isObjectiveDirectionUnbounded,
} from "@lpviz/polytope/objectiveDirection";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";

const ROTATE_ROW_LIMIT = 20;
const BASE_ROTATION_WAIT_MS = 30;
type RenderOptions = { limitVirtualRows?: boolean };
const getMaxLineChars = (lines: string[]) =>
  lines.reduce(
    (m, line) => Math.max(m, ...line.split("\n").map((l) => l.length)),
    0,
  );
const createVirtualBlock = (
  row: VirtualResultPayload["rows"][number],
  index: number,
): ResultTextBlock => ({
  className: "iterate-item",
  text: formatVirtualResultRow(row),
  index,
});
const createResultBlock = (
  className: ResultTextBlock["className"],
  text: string,
): ResultTextBlock => ({ className, text });

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
  let rotationRafId: number | null = null;
  let rotationLastFrameTime: number | null = null;
  let rotationElapsedMs = 0;
  let rotationComputeInFlight = false;
  let objectiveRotationDirection: 1 | -1 = 1;
  let iterateHoverActive = false;
  let lastVirtualResult: VirtualResultPayload | null = null;
  let pendingRender: {
    payload: ResultRenderPayload;
    options: RenderOptions;
  } | null = null;

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

  const applyRender = (
    payload: ResultRenderPayload,
    options: RenderOptions = {},
  ) => {
    const cm = getCanvasManager();
    const limitVirtualRows =
      options.limitVirtualRows ?? getState().rotateObjectiveMode;
    if (payload.type === "virtual") {
      lastVirtualResult = payload;
      const rowsForLayout = limitVirtualRows
        ? payload.rows.slice(0, ROTATE_ROW_LIMIT)
        : payload.rows;
      setState(
        {
          resultDisplayMode: "virtual",
          resultBlocks: null,
          resultVirtualHeader: payload.header || "",
          resultVirtualFooter: payload.footer ?? null,
          resultVirtualShowEmpty: rowsForLayout.length === 0,
          resultVirtualRows: rowsForLayout.map(createVirtualBlock),
          resultMaxLineChars: getMaxLineChars([
            payload.header || "",
            ...(payload.footer ? [payload.footer] : []),
            ...rowsForLayout.map((r) => formatVirtualResultRow(r)),
          ]),
          highlightIteratePathIndex: null,
        },
        { viewportDirty: cm?.getIterateDirtyFlags() ?? {} },
      );
    } else {
      lastVirtualResult = null;
      setState(
        {
          resultDisplayMode: "blocks",
          resultBlocks: payload.blocks,
          resultVirtualHeader: null,
          resultVirtualFooter: null,
          resultVirtualShowEmpty: false,
          resultVirtualRows: [],
          resultMaxLineChars: getMaxLineChars(
            payload.blocks.map((b) => b.text),
          ),
          highlightIteratePathIndex: null,
        },
        { viewportDirty: cm?.getIterateDirtyFlags() ?? {} },
      );
    }
    cm?.draw();
  };
  const render = (
    payload: ResultRenderPayload,
    options: RenderOptions = {},
  ) => {
    if (payload.type === "virtual") lastVirtualResult = payload;
    else lastVirtualResult = null;
    if (getState().isNavigatingViewport) {
      pendingRender = { payload, options };
      getCanvasManager()?.draw();
      return;
    }
    pendingRender = null;
    applyRender(payload, options);
  };
  const flushDeferredRender = () => {
    if (!pendingRender || getState().isNavigatingViewport) return;
    const p = pendingRender;
    pendingRender = null;
    applyRender(p.payload, p.options);
  };
  const clearResultState = () => {
    lastVirtualResult = null;
    pendingRender = null;
    setState({
      resultDisplayMode: "usage",
      resultBlocks: null,
      resultVirtualHeader: null,
      resultVirtualFooter: null,
      resultVirtualShowEmpty: false,
      resultVirtualRows: [],
      resultMaxLineChars: 0,
      highlightIteratePathIndex: null,
    });
    getCanvasManager()?.draw();
  };
  const restoreFullVirtualResult = () => {
    if (lastVirtualResult)
      render(lastVirtualResult, { limitVirtualRows: false });
  };
  const clearComputedState = () => {
    clearIterateState();
    resetTraceState();
    clearResultState();
  };
  const invalidatePendingSolveResults = () => {
    requestGeneration++;
  };
  const cancelRotationLoop = () => {
    if (rotationRafId !== null) cancelAnimationFrame(rotationRafId);
    rotationRafId = null;
    rotationLastFrameTime = null;
    rotationElapsedMs = 0;
    rotationComputeInFlight = false;
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
      render(runBlock);
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
      solverDefinition.applyResult(response, (payload) => render(payload));
      cm.draw();
    } catch (error) {
      if (gen !== requestGeneration) return;
      render({
        type: "blocks",
        blocks: [
          createResultBlock("iterate-header", "Solver error"),
          createResultBlock(
            "iterate-item-nohover",
            error instanceof Error ? error.message : String(error),
          ),
        ],
      });
    }
  };

  const ensureRotationLoop = () => {
    if (!getState().rotateObjectiveMode || rotationRafId !== null) return;
    const tick = (timestamp: number) => {
      rotationRafId = null;
      if (!getState().rotateObjectiveMode) return;
      if (rotationLastFrameTime === null) rotationLastFrameTime = timestamp;
      else {
        rotationElapsedMs += timestamp - rotationLastFrameTime;
        rotationLastFrameTime = timestamp;
      }
      const intervalMs = Math.max(
        1,
        BASE_ROTATION_WAIT_MS /
          Math.max(0.1, getState().solverSettings.objectiveRotationSpeed || 1),
      );
      if (!rotationComputeInFlight && rotationElapsedMs >= intervalMs) {
        rotationElapsedMs = 0;
        void computeAndRotate();
      }
      if (getState().rotateObjectiveMode)
        rotationRafId = requestAnimationFrame(tick);
    };
    rotationRafId = requestAnimationFrame(tick);
  };
  const computeAndRotate = async () => {
    const cm = getCanvasManager();
    if (!cm) return;
    const state = getState();
    if (!state.rotateObjectiveMode || rotationComputeInFlight) return;
    rotationComputeInFlight = true;
    const rotationStep = computeObjectiveRotationStep({
      objectiveVector: state.objectiveVector ?? { x: 1, y: 0 },
      angleStep: Math.max(
        0.001,
        state.solverSettings.objectiveAngleStep || 0.001,
      ),
      rotationDirection: objectiveRotationDirection,
      polytope: state.polytope,
    });
    objectiveRotationDirection = rotationStep.nextDirection;
    setState(
      {
        objectiveVector: rotationStep.nextObjective,
        highlightIteratePathIndex: null,
      },
      { viewportDirty: cm.getObjectiveDirtyFlags() },
    );
    if (getState().traceEnabled) syncTraceCapacity();
    try {
      await computePath();
    } finally {
      rotationComputeInFlight = false;
      if (getState().rotateObjectiveMode) ensureRotationLoop();
    }
  };
  const setRotationActive = (active: boolean) => {
    const cm = getCanvasManager();
    prepareAnimationInterval();
    if (!active) cancelRotationLoop();
    else {
      rotationLastFrameTime = null;
      rotationElapsedMs = 0;
    }
    setState(
      { rotateObjectiveMode: active, highlightIteratePathIndex: null },
      { viewportDirty: cm?.getIterateDirtyFlags() ?? {} },
    );
    if (!active) restoreFullVirtualResult();
  };
  const stopActiveMotion = () => {
    const s = getState();
    const wasRotating = s.rotateObjectiveMode;
    if (!wasRotating && s.animationIntervalId === null) return;
    invalidatePendingSolveResults();
    prepareAnimationInterval();
    cancelRotationLoop();
    const cm = getCanvasManager();
    setState(
      {
        rotateObjectiveMode: false,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      },
      { viewportDirty: cm?.getIterateDirtyFlags() ?? {} },
    );
    if (wasRotating) restoreFullVirtualResult();
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
    void computePath().finally(() => {
      if (getState().rotateObjectiveMode) ensureRotationLoop();
    });
  };
  const setTraceEnabled = (enabled: boolean) => {
    const cm = getCanvasManager();
    setState(
      { traceEnabled: enabled },
      { viewportDirty: cm?.getTraceDirtyFlags() ?? {} },
    );
    if (!enabled) {
      resetTraceState();
      cm?.draw();
    } else syncTraceCapacity();
  };
  const startRotation = () => {
    const cm = getCanvasManager();
    if (!getState().objectiveVector)
      setState(
        { objectiveVector: { x: 1, y: 0 } },
        { viewportDirty: cm?.getObjectiveDirtyFlags() ?? {} },
      );
    objectiveRotationDirection = 1;
    if (getState().traceEnabled) {
      syncTraceCapacity();
      resetTraceState();
    }
    setRotationActive(true);
    void computeAndRotate();
  };
  const startReplay = () => {
    const cm = getCanvasManager();
    if (!cm) return;
    const snap = getState();
    if (snap.rotateObjectiveMode) return;
    if (snap.animationIntervalId !== null)
      clearInterval(snap.animationIntervalId);
    const iterates = [...snap.originalIteratePath];
    const phases = [...snap.originalIteratePhases];
    setState(
      {
        iteratePath: [],
        iteratePhases: [],
        iterateObjectiveVector: snap.originalIterateObjectiveVector,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      },
      { viewportDirty: cm.getIterateDirtyFlags() },
    );
    cm.draw();
    let i = 0;
    const id = window.setInterval(() => {
      if (getState().animationIntervalId !== id) return;
      if (i >= iterates.length) {
        clearInterval(id);
        setState({ animationIntervalId: null }, { viewportDirty: {} });
        return;
      }
      const s = getState();
      setState(
        {
          iteratePath: [...s.iteratePath, iterates[i]!],
          ...(phases.length > 0
            ? { iteratePhases: [...s.iteratePhases, phases[i]!] }
            : {}),
          ...(!iterateHoverActive ? { highlightIteratePathIndex: i } : {}),
        },
        { viewportDirty: cm.getIterateDirtyFlags() },
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
      { viewportDirty: cm.getConstraintDirtyFlags() },
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
      { viewportDirty: cm.getIterateDirtyFlags() },
    );
    cm.draw();
  };
  let wasNavigatingViewport = getState().isNavigatingViewport;
  const controller = new AbortController();
  on(
    ["isNavigatingViewport"],
    ({ isNavigatingViewport }) => {
      if (wasNavigatingViewport && !isNavigatingViewport) flushDeferredRender();
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
    flushDeferredRender,
    clearComputedState,
    setConstraintHighlight,
    setIterateHighlight,
    restoreFullVirtualResult,
    solverControls,
    getSolverControl,
    hasUnboundedObjectiveDirection,
    destroy: () => {
      cancelRotationLoop();
      controller.abort();
    },
  };
}
