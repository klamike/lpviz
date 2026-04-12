import { computeDrawingPhase, type SolverMode, type State } from "../state/store";
import { isObjectiveDirectionUnbounded } from "../solvers/utils/objectiveDirection";
import { hasPolytopeLines } from "../solvers/utils/polytopeTypes";

const SOLVER_MODES: SolverMode[] = ["ipm", "pdhg", "simplex", "central"];

type SolverButtonUiState = {
  active: boolean;
  disabled: boolean;
};

export type SolverControlsUiState = {
  activeMode: SolverMode;
  buttons: Record<SolverMode, SolverButtonUiState>;
};

export type CanvasControlsUiState = {
  is3DMode: boolean;
  toggle3DLabel: "2D" | "3D";
  zAxisOffsetOnly: boolean;
  zScale: number;
};

export type AnimationControlsUiState = {
  animateDisabled: boolean;
  startRotateDisabled: boolean;
  stopRotateDisabled: boolean;
};

export function selectSolverControlsUiState(state: State): SolverControlsUiState {
  return {
    activeMode: state.solverMode,
    buttons: {
      ipm: getSolverButtonUiState(state, "ipm"),
      pdhg: getSolverButtonUiState(state, "pdhg"),
      simplex: getSolverButtonUiState(state, "simplex"),
      central: getSolverButtonUiState(state, "central"),
    },
  };
}

export function areSolverControlsUiStatesEqual(a: SolverControlsUiState, b: SolverControlsUiState): boolean {
  if (a.activeMode !== b.activeMode) {
    return false;
  }

  return SOLVER_MODES.every((mode) => {
    const current = a.buttons[mode];
    const next = b.buttons[mode];
    return current.active === next.active && current.disabled === next.disabled;
  });
}

export function selectCanvasControlsUiState(state: State): CanvasControlsUiState {
  return {
    is3DMode: state.is3DMode,
    toggle3DLabel: state.is3DMode ? "2D" : "3D",
    zAxisOffsetOnly: state.zAxisOffsetOnly,
    zScale: state.zScale,
  };
}

export function areCanvasControlsUiStatesEqual(a: CanvasControlsUiState, b: CanvasControlsUiState): boolean {
  return (
    a.is3DMode === b.is3DMode &&
    a.toggle3DLabel === b.toggle3DLabel &&
    a.zAxisOffsetOnly === b.zAxisOffsetOnly &&
    a.zScale === b.zScale
  );
}

export function selectAnimationControlsUiState(state: State): AnimationControlsUiState {
  const hasComputedLines = hasPolytopeLines(state.polytope);
  const hasSolution = (state.originalIteratePath?.length ?? 0) > 0;
  const hasObjective = state.objectiveVector !== null;
  const isRotating = state.rotateObjectiveMode;
  const isAnimating = state.animationIntervalId !== null && !isRotating;

  return {
    animateDisabled: !hasComputedLines || !hasSolution || isAnimating || isRotating,
    startRotateDisabled: !hasComputedLines || !hasObjective || isAnimating || isRotating,
    stopRotateDisabled: !isRotating,
  };
}

export function areAnimationControlsUiStatesEqual(a: AnimationControlsUiState, b: AnimationControlsUiState): boolean {
  return (
    a.animateDisabled === b.animateDisabled &&
    a.startRotateDisabled === b.startRotateDisabled &&
    a.stopRotateDisabled === b.stopRotateDisabled
  );
}

function getSolverButtonUiState(state: State, mode: SolverMode): SolverButtonUiState {
  const hasComputedLines = hasPolytopeLines(state.polytope);
  const readyForSolvers =
    computeDrawingPhase(state) === "ready_for_solvers" &&
    hasComputedLines &&
    state.objectiveVector !== null;

  return {
    active: state.solverMode === mode,
    disabled: !readyForSolvers || !isSolverSelectable(state, mode),
  };
}

function isSolverSelectable(state: State, mode: SolverMode): boolean {
  if (!hasPolytopeLines(state.polytope)) {
    return false;
  }

  if (state.polytope.kind !== "bounded" && state.polytope.kind !== "unbounded") {
    return false;
  }

  if (mode !== "central" || !state.objectiveVector || state.polytope.kind !== "unbounded") {
    return true;
  }

  return !isObjectiveDirectionUnbounded(state.polytope.lines, [state.objectiveVector.x, state.objectiveVector.y]);
}
