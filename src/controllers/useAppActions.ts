import { createSignal } from "solid-js";
import { useLegacy } from "../context/LegacyContext";
import {
  computeCentralPathSolution,
  computeIPMSolution,
  computePDHGSolution,
  computeSimplexSolution,
} from "../services/solverService";
import type { SolverMode } from "../state/state";
import {
  handleStepSizeChange,
  prepareAnimationInterval,
  resetTraceState,
  state,
} from "../state/state";
import {
  setSolverMode as setSolverModeState,
  updateSolverButtonStates,
  updateZoomButtonStates,
} from "../state/uiActions";
import { setResultHtml } from "../state/uiDisplay";
import { start3DTransition } from "../utils/transitions";

const DEFAULT_VIEW_ANGLE = { x: -1.15, y: 0.4, z: 0 };
const ROTATION_INTERVAL_MS = 30;

let rotationTimeoutId: number | null = null;

export function useAppActions() {
  const legacy = useLegacy();
  const [isSharing, setIsSharing] = createSignal(false);

  const computeSolver = async () => {
    if (!state.computedLines || state.computedLines.length === 0) {
      return;
    }

    prepareAnimationInterval();

    try {
      switch (state.solverMode) {
        case "ipm":
          await computeIPMSolution(
            {
              alphaMax: state.solverSettings.ipmAlphaMax,
              maxIterations: state.solverSettings.ipmMaxIterations,
            },
            setResultHtml,
          );
          break;
        case "simplex":
          await computeSimplexSolution(setResultHtml);
          break;
        case "pdhg":
          await computePDHGSolution(
            {
              maxIterations: state.solverSettings.pdhgMaxIterations,
              eta: state.solverSettings.pdhgEta,
              tau: state.solverSettings.pdhgTau,
              inequalityMode: state.solverSettings.pdhgIneqMode,
            },
            setResultHtml,
          );
          break;
        case "central":
        default:
          await computeCentralPathSolution(
            {
              steps: state.solverSettings.centralPathSteps,
              objectiveAngleStep: state.solverSettings.objectiveAngleStep,
            },
            setResultHtml,
          );
          break;
      }
    } catch (error) {
      console.error("Solver evaluation failed", error);
      setResultHtml(
        `<div class="iterate-header">Solver error</div><div class="iterate-item-nohover">${(error as Error).message ?? "An unexpected error occurred."}</div>`,
      );
    }

    legacy.canvasManager.draw();
    updateSolverButtonStates();
  };

  const solve = async () => {
    await computeSolver();
    state.iteratePathComputed = true;
  };

  const maybeSolveForMode = async (mode: SolverMode) => {
    if (state.solverMode === mode) {
      await computeSolver();
    }
  };

  const zoomToFit = () => {
    if (state.vertices.length === 0) return;

    const bounds = state.vertices.reduce(
      (acc, v) => ({
        minX: Math.min(acc.minX, v.x),
        maxX: Math.max(acc.maxX, v.x),
        minY: Math.min(acc.minY, v.y),
        maxY: Math.max(acc.maxY, v.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );

    const polyWidth = bounds.maxX - bounds.minX;
    const polyHeight = bounds.maxY - bounds.minY;
    const centroid = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };

    legacy.canvasManager.offset.x = -centroid.x;
    legacy.canvasManager.offset.y = -centroid.y;

    const padding = 50;
    const sidebar = document.querySelector("#sidebar") as HTMLElement;
    const sidebarWidth = sidebar?.offsetWidth ?? 0;
    const availWidth = window.innerWidth - sidebarWidth - 2 * padding;
    const availHeight = window.innerHeight - 2 * padding;

    if (polyWidth > 0 && polyHeight > 0) {
      legacy.canvasManager.scaleFactor = Math.min(
        availWidth / (polyWidth * legacy.canvasManager.gridSpacing),
        availHeight / (polyHeight * legacy.canvasManager.gridSpacing),
      );
    }

    legacy.canvasManager.centerX =
      sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    legacy.canvasManager.centerY = window.innerHeight / 2;
    legacy.canvasManager.draw();
    updateZoomButtonStates(legacy.canvasManager);
  };

  const resetZoom = () => {
    legacy.canvasManager.scaleFactor = 1;
    legacy.canvasManager.offset.x = 0;
    legacy.canvasManager.offset.y = 0;
    state.viewAngle = { ...DEFAULT_VIEW_ANGLE };
    legacy.canvasManager.draw();
    updateZoomButtonStates(legacy.canvasManager);
  };

  const toggle3D = () => {
    if (state.isTransitioning3D) return;
    start3DTransition(legacy.canvasManager, !state.is3DMode);
  };

  const setZScale = (value: number) => {
    state.zScale = value;
    if (state.is3DMode || state.isTransitioning3D) {
      legacy.canvasManager.draw();
    }
  };

  const updateSolverMode = (mode: SolverMode) => {
    if (state.solverMode === mode) return;
    setSolverModeState(mode);
  };

  const updateCentralPathSteps = async (steps: number) => {
    state.solverSettings.centralPathSteps = steps;
    await maybeSolveForMode("central");
  };

  const updateObjectiveAngleStep = (angle: number) => {
    state.solverSettings.objectiveAngleStep = angle;
    handleStepSizeChange();
    if (state.traceEnabled) {
      legacy.canvasManager.draw();
    }
  };

  const updateIPMAlphaMax = async (value: number) => {
    state.solverSettings.ipmAlphaMax = value;
    await maybeSolveForMode("ipm");
  };

  const updateIPMMaxIterations = async (value: number) => {
    state.solverSettings.ipmMaxIterations = value;
    await maybeSolveForMode("ipm");
  };

  const updatePDHGSettings = async (
    updates: Partial<
      Pick<
        typeof state.solverSettings,
        "pdhgEta" | "pdhgTau" | "pdhgMaxIterations" | "pdhgIneqMode"
      >
    >,
  ) => {
    Object.assign(state.solverSettings, updates);
    await maybeSolveForMode("pdhg");
  };

  const updateReplaySpeed = (value: number) => {
    state.solverSettings.replaySpeedMs = value;
  };

  const stopRotationLoop = () => {
    if (rotationTimeoutId !== null) {
      clearTimeout(rotationTimeoutId);
      rotationTimeoutId = null;
    }
  };

  const rotationStep = async () => {
    if (!state.rotateObjectiveMode) return;

    const angleStep = state.solverSettings.objectiveAngleStep || 0.1;
    const objective = state.objectiveVector ?? { x: 1, y: 0 };
    const angle = Math.atan2(objective.y, objective.x);
    const magnitude = Math.hypot(objective.x, objective.y) || 1;

    state.objectiveVector = {
      x: magnitude * Math.cos(angle + angleStep),
      y: magnitude * Math.sin(angle + angleStep),
    };

    if (state.traceEnabled) {
      state.totalRotationAngle += angleStep;
    }

    legacy.canvasManager.draw();

    if (state.polygonComplete && state.computedLines.length > 0) {
      try {
        await computeSolver();
      } catch (error) {
        console.error("Error computing during rotation", error);
      }
    }

    if (state.rotateObjectiveMode) {
      rotationTimeoutId = window.setTimeout(rotationStep, ROTATION_INTERVAL_MS);
    }
  };

  const startRotation = () => {
    if (state.rotateObjectiveMode) return;

    stopRotationLoop();
    state.rotateObjectiveMode = true;
    resetTraceState();
    if (!state.objectiveVector) {
      state.objectiveVector = { x: 1, y: 0 };
    }
    if (state.animationIntervalId !== null) {
      clearInterval(state.animationIntervalId);
      state.animationIntervalId = null;
    }
    updateSolverButtonStates();
    rotationStep();
  };

  const stopRotation = () => {
    if (!state.rotateObjectiveMode) return;
    state.rotateObjectiveMode = false;
    stopRotationLoop();
    state.totalRotationAngle = 0;
    updateSolverButtonStates();
  };

  const toggleTrace = (enabled: boolean) => {
    state.traceEnabled = enabled;
    if (!enabled) {
      resetTraceState();
      legacy.canvasManager.draw();
    } else {
      handleStepSizeChange();
    }
  };

  const animate = () => {
    if (state.rotateObjectiveMode) return;

    if (state.animationIntervalId !== null) {
      clearInterval(state.animationIntervalId);
      state.animationIntervalId = null;
    }

    const iterates = [...state.originalIteratePath];
    if (iterates.length === 0) return;

    state.iteratePath = [];
    state.highlightIteratePathIndex = null;
    legacy.canvasManager.draw();

    const intervalTime = Math.max(1, state.solverSettings.replaySpeedMs || 10);
    let currentIndex = 0;

    const intervalId = window.setInterval(() => {
      if (state.animationIntervalId !== intervalId) return;

      if (currentIndex >= iterates.length) {
        clearInterval(intervalId);
        state.animationIntervalId = null;
        return;
      }

      state.iteratePath.push(iterates[currentIndex]);
      state.highlightIteratePathIndex = currentIndex;
      currentIndex += 1;
      legacy.canvasManager.draw();
    }, intervalTime);

    state.animationIntervalId = intervalId;
  };

  const share = async () => {
    if (isSharing()) return;
    setIsSharing(true);
    try {
      const url = legacy.generateShareLink();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert("Share link copied to clipboard.");
      } else {
        window.prompt("Share this link:", url);
      }
    } catch (error) {
      console.error("Failed to share", error);
      const url = legacy.generateShareLink();
      window.prompt("Share this link:", url);
    } finally {
      setIsSharing(false);
    }
  };

  const loadSharedState = legacy.loadStateFromObject;

  return {
    solve,
    zoomToFit,
    resetZoom,
    toggle3D,
    setZScale,
    updateSolverMode,
    updateCentralPathSteps,
    updateObjectiveAngleStep,
    updateIPMAlphaMax,
    updateIPMMaxIterations,
    updatePDHGSettings,
    updateReplaySpeed,
    startRotation,
    stopRotation,
    toggleTrace,
    animate,
    share,
    loadSharedState,
    isSharing,
  };
}
