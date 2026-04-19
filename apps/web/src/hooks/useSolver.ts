import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ResultTextBlock } from "@/contracts";
import {
  computeObjectiveRotationStep,
  hasPolytopeLines,
  isObjectiveDirectionUnbounded,
} from "@lpviz/polytope";
import {
  clearIterateState,
  computeDrawingPhase,
  getState,
  mutate,
  prepareAnimationInterval,
  resetTraceState,
  setState,
  setTraceCapacity,
  subscribe,
  type SolverMode,
  type SolverSettings,
  type State,
} from "@/state";
import type { ViewportApi } from "@/viewport";
import {
  createSolverControls,
  type SolverControl,
  type SolverSettingUpdater,
} from "@/lib/solverControls";
import {
  formatVirtualResultRow,
  type ResultRenderPayload,
  type VirtualResultPayload,
} from "@/solver/solverService";
import { runSolverWorker } from "@/solver/workerClient";

const ROTATE_ROW_LIMIT = 20;
const BASE_ROTATION_WAIT_MS = 30;

type RenderOptions = { limitVirtualRows?: boolean };

const getMaxLineChars = (lines: string[]) =>
  lines.reduce((maxChars, line) => {
    const lineMaxChars = line
      .split("\n")
      .reduce(
        (maxLineChars, textLine) => Math.max(maxLineChars, textLine.length),
        0,
      );
    return Math.max(maxChars, lineMaxChars);
  }, 0);

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
};

export function useSolver({
  canvasManager,
}: {
  canvasManager: ViewportApi | null;
}): SolverActions {
  const canvasManagerRef = useRef<ViewportApi | null>(canvasManager);
  canvasManagerRef.current = canvasManager;

  const requestGenerationRef = useRef(0);
  const rotationRafIdRef = useRef<number | null>(null);
  const rotationLastFrameTimeRef = useRef<number | null>(null);
  const rotationElapsedMsRef = useRef(0);
  const rotationComputeInFlightRef = useRef(false);
  const objectiveRotationDirectionRef = useRef<1 | -1>(1);

  const lastVirtualResultRef = useRef<VirtualResultPayload | null>(null);
  const pendingRenderRef = useRef<{
    payload: ResultRenderPayload;
    options: RenderOptions;
  } | null>(null);

  const updateSolverSetting = useCallback<SolverSettingUpdater>(
    (key, value) => {
      mutate((draft) => {
        (draft.solverSettings as SolverSettings)[key] = value;
      });
    },
    [],
  );

  const hasUnboundedObjectiveDirection = useCallback((state: State) => {
    const { polytope, objectiveVector } = state;
    if (
      !hasPolytopeLines(polytope) ||
      !objectiveVector ||
      polytope.kind !== "unbounded"
    ) {
      return false;
    }
    return isObjectiveDirectionUnbounded(polytope.lines, [
      objectiveVector.x,
      objectiveVector.y,
    ]);
  }, []);

  const solverControls = useMemo(
    () =>
      createSolverControls({
        updateSolverSetting,
        hasUnboundedObjectiveDirection,
      }),
    [updateSolverSetting, hasUnboundedObjectiveDirection],
  );

  const getSolverControl = useCallback(
    (mode: SolverMode): SolverControl | undefined =>
      solverControls.find((control) => control.mode === mode),
    [solverControls],
  );

  const setHighlight = useCallback((index: number | null) => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    setState(
      { highlightIteratePathIndex: index },
      { viewportDirty: cm.getIterateDirtyFlags() },
    );
    cm.draw();
  }, []);

  const applyRender = useCallback(
    (payload: ResultRenderPayload, options: RenderOptions = {}) => {
      const cm = canvasManagerRef.current;
      const limitVirtualRows =
        options.limitVirtualRows ?? getState().rotateObjectiveMode;

      if (payload.type === "virtual") {
        lastVirtualResultRef.current = payload;
        const rowsForLayout = limitVirtualRows
          ? payload.rows.slice(0, ROTATE_ROW_LIMIT)
          : payload.rows;
        setState({
          resultDisplayMode: "virtual",
          resultBlocks: null,
          resultVirtualHeader: payload.header || "",
          resultVirtualFooter: payload.footer ?? null,
          resultVirtualShowEmpty: rowsForLayout.length === 0,
          resultVirtualRows: rowsForLayout.map(createVirtualBlock),
          resultMaxLineChars: getMaxLineChars([
            payload.header || "",
            ...(payload.footer ? [payload.footer] : []),
            ...rowsForLayout.map((row) => formatVirtualResultRow(row)),
          ]),
          highlightIteratePathIndex: null,
        });
        setHighlight(null);
      } else {
        lastVirtualResultRef.current = null;
        setState({
          resultDisplayMode: "blocks",
          resultBlocks: payload.blocks,
          resultVirtualHeader: null,
          resultVirtualFooter: null,
          resultVirtualShowEmpty: false,
          resultVirtualRows: [],
          resultMaxLineChars: getMaxLineChars(
            payload.blocks.map((block) => block.text),
          ),
          highlightIteratePathIndex: null,
        });
      }

      cm?.draw();
    },
    [setHighlight],
  );

  const render = useCallback(
    (payload: ResultRenderPayload, options: RenderOptions = {}) => {
      if (payload.type === "virtual") {
        lastVirtualResultRef.current = payload;
      } else {
        lastVirtualResultRef.current = null;
      }

      if (getState().isNavigatingViewport) {
        pendingRenderRef.current = { payload, options };
        canvasManagerRef.current?.draw();
        return;
      }

      pendingRenderRef.current = null;
      applyRender(payload, options);
    },
    [applyRender],
  );

  const flushDeferredRender = useCallback(() => {
    if (!pendingRenderRef.current || getState().isNavigatingViewport) return;
    const pending = pendingRenderRef.current;
    pendingRenderRef.current = null;
    applyRender(pending.payload, pending.options);
  }, [applyRender]);

  const clearResultState = useCallback(() => {
    lastVirtualResultRef.current = null;
    pendingRenderRef.current = null;
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
    setHighlight(null);
  }, [setHighlight]);

  const restoreFullVirtualResult = useCallback(() => {
    if (lastVirtualResultRef.current) {
      render(lastVirtualResultRef.current, { limitVirtualRows: false });
    }
  }, [render]);

  const clearComputedState = useCallback(() => {
    clearIterateState();
    clearResultState();
  }, [clearResultState]);

  const invalidatePendingSolveResults = useCallback(() => {
    requestGenerationRef.current++;
  }, []);

  const cancelRotationLoop = useCallback(() => {
    if (rotationRafIdRef.current !== null) {
      cancelAnimationFrame(rotationRafIdRef.current);
      rotationRafIdRef.current = null;
    }
    rotationLastFrameTimeRef.current = null;
    rotationElapsedMsRef.current = 0;
    rotationComputeInFlightRef.current = false;
  }, []);

  const syncTraceCapacity = useCallback(() => {
    const angleStep = Math.max(
      0.001,
      getState().solverSettings.objectiveAngleStep || 0.001,
    );
    setTraceCapacity(Math.max(1, Math.ceil((2 * Math.PI) / angleStep)));
  }, []);

  const computePath = useCallback(async () => {
    const cm = canvasManagerRef.current;
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

    const requestGeneration = ++requestGenerationRef.current;
    prepareAnimationInterval();

    try {
      const response = await runSolverWorker(request);
      if (requestGeneration !== requestGenerationRef.current) return;
      solverDefinition.applyResult(response, (payload) => render(payload));
      cm.draw();
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) return;
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
  }, [getSolverControl, invalidatePendingSolveResults, clearComputedState, render]);

  const computePathRef = useRef(computePath);
  computePathRef.current = computePath;

  const ensureRotationLoop = useCallback(() => {
    if (!getState().rotateObjectiveMode || rotationRafIdRef.current !== null) {
      return;
    }

    const tick = (timestamp: number) => {
      rotationRafIdRef.current = null;
      if (!getState().rotateObjectiveMode) return;

      if (rotationLastFrameTimeRef.current === null) {
        rotationLastFrameTimeRef.current = timestamp;
      } else {
        rotationElapsedMsRef.current +=
          timestamp - rotationLastFrameTimeRef.current;
        rotationLastFrameTimeRef.current = timestamp;
      }

      const speed = Math.max(
        0.1,
        getState().solverSettings.objectiveRotationSpeed || 1,
      );
      const intervalMs = Math.max(1, BASE_ROTATION_WAIT_MS / speed);
      if (
        !rotationComputeInFlightRef.current &&
        rotationElapsedMsRef.current >= intervalMs
      ) {
        rotationElapsedMsRef.current = 0;
        void computeAndRotateRef.current();
      }

      if (getState().rotateObjectiveMode) {
        rotationRafIdRef.current = requestAnimationFrame(tick);
      }
    };

    rotationRafIdRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureRotationLoopRef = useRef(ensureRotationLoop);
  ensureRotationLoopRef.current = ensureRotationLoop;

  const computeAndRotate = useCallback(async () => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    const state = getState();
    if (!state.rotateObjectiveMode || rotationComputeInFlightRef.current) {
      return;
    }
    rotationComputeInFlightRef.current = true;

    const objectiveVector = state.objectiveVector ?? { x: 1, y: 0 };
    const angleStep = Math.max(
      0.001,
      state.solverSettings.objectiveAngleStep || 0.001,
    );
    const rotationStep = computeObjectiveRotationStep({
      objectiveVector,
      angleStep,
      rotationDirection: objectiveRotationDirectionRef.current,
      polytope: state.polytope,
    });

    objectiveRotationDirectionRef.current = rotationStep.nextDirection;
    setState(
      {
        objectiveVector: rotationStep.nextObjective,
        highlightIteratePathIndex: null,
      },
      { viewportDirty: cm.getObjectiveDirtyFlags() },
    );

    if (getState().traceEnabled) {
      syncTraceCapacity();
    }

    try {
      await computePathRef.current();
    } finally {
      rotationComputeInFlightRef.current = false;
      if (!getState().rotateObjectiveMode) return;
      ensureRotationLoopRef.current();
    }
  }, [syncTraceCapacity]);

  const computeAndRotateRef = useRef(computeAndRotate);
  computeAndRotateRef.current = computeAndRotate;

  const setRotationActive = useCallback(
    (active: boolean) => {
      const cm = canvasManagerRef.current;
      prepareAnimationInterval();
      if (!active) {
        cancelRotationLoop();
      } else {
        rotationLastFrameTimeRef.current = null;
        rotationElapsedMsRef.current = 0;
      }
      if (cm) {
        setState(
          {
            rotateObjectiveMode: active,
            highlightIteratePathIndex: null,
          },
          { viewportDirty: cm.getIterateDirtyFlags() },
        );
      } else {
        setState({
          rotateObjectiveMode: active,
          highlightIteratePathIndex: null,
        });
      }
      if (!active) {
        restoreFullVirtualResult();
      }
    },
    [cancelRotationLoop, restoreFullVirtualResult],
  );

  const stopActiveMotion = useCallback(() => {
    const state = getState();
    const wasRotating = state.rotateObjectiveMode;
    const hadAnimation = state.animationIntervalId !== null;
    if (!wasRotating && !hadAnimation) return;

    invalidatePendingSolveResults();
    prepareAnimationInterval();
    cancelRotationLoop();
    const cm = canvasManagerRef.current;
    if (cm) {
      setState(
        {
          rotateObjectiveMode: false,
          highlightIteratePathIndex: null,
          animationIntervalId: null,
        },
        { viewportDirty: cm.getIterateDirtyFlags() },
      );
    } else {
      setState({
        rotateObjectiveMode: false,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      });
    }
    if (wasRotating) {
      restoreFullVirtualResult();
    }
  }, [
    cancelRotationLoop,
    invalidatePendingSolveResults,
    restoreFullVirtualResult,
  ]);

  const handleProblemChange = useCallback(() => {
    const state = getState();
    const readyForSolvers =
      computeDrawingPhase(state) === "ready_for_solvers" &&
      hasPolytopeLines(state.polytope) &&
      state.objectiveVector !== null;

    if (!readyForSolvers) {
      invalidatePendingSolveResults();
      stopActiveMotion();
      clearComputedState();
      return;
    }

    if (!state.rotateObjectiveMode) {
      void computePath();
      return;
    }

    void computePath().finally(() => {
      if (getState().rotateObjectiveMode) {
        ensureRotationLoop();
      }
    });
  }, [
    invalidatePendingSolveResults,
    stopActiveMotion,
    clearComputedState,
    computePath,
    ensureRotationLoop,
  ]);

  const setTraceEnabled = useCallback(
    (enabled: boolean) => {
      const cm = canvasManagerRef.current;
      setState(
        { traceEnabled: enabled },
        { viewportDirty: cm?.getTraceDirtyFlags() ?? {} },
      );
      if (!enabled) {
        resetTraceState();
        cm?.draw();
        return;
      }
      syncTraceCapacity();
    },
    [syncTraceCapacity],
  );

  const startRotation = useCallback(() => {
    const cm = canvasManagerRef.current;
    if (!getState().objectiveVector) {
      setState(
        { objectiveVector: { x: 1, y: 0 } },
        { viewportDirty: cm?.getObjectiveDirtyFlags() ?? {} },
      );
    }

    objectiveRotationDirectionRef.current = 1;

    if (getState().traceEnabled) {
      syncTraceCapacity();
      resetTraceState();
    }

    setRotationActive(true);
    void computeAndRotate();
  }, [syncTraceCapacity, setRotationActive, computeAndRotate]);

  const stopRotation = useCallback(() => {
    stopActiveMotion();
  }, [stopActiveMotion]);

  const startReplay = useCallback(() => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    const solverSnapshot = getState();
    if (solverSnapshot.rotateObjectiveMode) return;

    const animationIntervalId = solverSnapshot.animationIntervalId;
    if (animationIntervalId !== null) {
      clearInterval(animationIntervalId);
    }
    setState({ animationIntervalId: null }, { viewportDirty: {} });

    const intervalTime = getState().solverSettings.replaySpeed || 500;
    const iteratesToAnimate = [...solverSnapshot.originalIteratePath];
    const phasesToAnimate = [...solverSnapshot.originalIteratePhases];
    setState(
      {
        iteratePath: [],
        iteratePhases: [],
        iterateObjectiveVector: solverSnapshot.originalIterateObjectiveVector,
        highlightIteratePathIndex: null,
        animationIntervalId: null,
      },
      { viewportDirty: cm.getIterateDirtyFlags() },
    );
    cm.draw();

    let currentIndex = 0;
    const intervalId = window.setInterval(() => {
      if (getState().animationIntervalId !== intervalId) return;

      if (currentIndex >= iteratesToAnimate.length) {
        clearInterval(intervalId);
        setState({ animationIntervalId: null }, { viewportDirty: {} });
        return;
      }

      mutate(
        (draft) => {
          draft.iteratePath.push(iteratesToAnimate[currentIndex]);
          if (phasesToAnimate.length > 0) {
            draft.iteratePhases.push(phasesToAnimate[currentIndex]);
          }
          draft.highlightIteratePathIndex = currentIndex;
        },
        { viewportDirty: cm.getIterateDirtyFlags() },
      );
      currentIndex++;
      cm.draw();
    }, intervalTime);

    setState({ animationIntervalId: intervalId }, { viewportDirty: {} });
  }, []);

  const recomputeIfModeActive = useCallback(
    (mode: SolverMode) => {
      const state = getState();
      if (state.rotateObjectiveMode) return;
      if (state.solverMode === mode) {
        void computePath();
      }
    },
    [computePath],
  );

  const resetTraceAndRedrawIfNeeded = useCallback(() => {
    const cm = canvasManagerRef.current;
    if (!getState().traceEnabled) return;
    resetTraceState();
    cm?.draw();
  }, []);

  const setActiveSolverMode = useCallback(
    (mode: SolverMode, solve = false) => {
      invalidatePendingSolveResults();
      if (getState().rotateObjectiveMode) {
        resetTraceAndRedrawIfNeeded();
      }
      setState({ solverMode: mode });
      if (solve && !getState().rotateObjectiveMode) {
        void computePath();
      }
    },
    [computePath, invalidatePendingSolveResults, resetTraceAndRedrawIfNeeded],
  );

  const setConstraintHighlight = useCallback((index: number | null) => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    if (getState().highlightIndex === index) return;
    setState(
      { highlightIndex: index },
      { viewportDirty: cm.getConstraintDirtyFlags() },
    );
    cm.draw();
  }, []);

  const setIterateHighlight = useCallback((index: number | null) => {
    const cm = canvasManagerRef.current;
    if (!cm) return;
    if (getState().highlightIteratePathIndex === index) return;
    setState(
      { highlightIteratePathIndex: index },
      { viewportDirty: cm.getIterateDirtyFlags() },
    );
    cm.draw();
  }, []);

  useEffect(() => {
    let wasNavigatingViewport = getState().isNavigatingViewport;
    return subscribe((snapshot) => {
      if (wasNavigatingViewport && !snapshot.isNavigatingViewport) {
        flushDeferredRender();
      }
      wasNavigatingViewport = snapshot.isNavigatingViewport;
    });
  }, [flushDeferredRender]);

  useEffect(() => {
    return () => {
      cancelRotationLoop();
    };
  }, [cancelRotationLoop]);

  return useMemo(
    () => ({
      updateSolverSetting,
      setActiveSolverMode,
      setTraceEnabled,
      startRotation,
      stopRotation,
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
    }),
    [
      updateSolverSetting,
      setActiveSolverMode,
      setTraceEnabled,
      startRotation,
      stopRotation,
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
    ],
  );
}
