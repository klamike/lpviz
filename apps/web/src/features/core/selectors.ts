import { isObjectiveDirectionUnbounded } from "@lpviz/polytope/objectiveDirection";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";
import { computeDrawingPhase, type SolverMode, type State } from "./store";

type SolverButtonUiState = {
  active: boolean;
  disabled: boolean;
};

type SolverControlsUiState = {
  activeMode: SolverMode;
  buttons: Record<SolverMode, SolverButtonUiState>;
};

type CanvasControlsUiState = {
  is3DMode: boolean;
  toggle3DLabel: "2D" | "3D";
  zScale: number;
};

type AnimationControlsUiState = {
  animateDisabled: boolean;
  startRotateDisabled: boolean;
  stopRotateDisabled: boolean;
  rotateObjectiveMode: boolean;
  traceEnabled: boolean;
};

type TopResultUiState = {
  maximizeVisible: boolean;
  nullStateVisible: boolean;
  objectiveActive: boolean;
  subjectToVisible: boolean;
};

type InequalitiesUiState = {
  items: string[];
  message: string | null;
};

export function selectSolverControlsUiState(
  state: State,
): SolverControlsUiState {
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

export function selectCanvasControlsUiState(
  state: State,
): CanvasControlsUiState {
  return {
    is3DMode: state.is3DMode,
    toggle3DLabel: state.is3DMode ? "2D" : "3D",
    zScale: state.zScale,
  };
}

export function selectAnimationControlsUiState(
  state: State,
): AnimationControlsUiState {
  const hasComputedLines = hasPolytopeLines(state.polytope);
  const hasSolution = (state.originalIteratePath?.length ?? 0) > 0;
  const hasObjective = state.objectiveVector !== null;
  const isRotating = state.rotateObjectiveMode;
  const isAnimating = state.animationIntervalId !== null && !isRotating;

  return {
    animateDisabled:
      !hasComputedLines || !hasSolution || isAnimating || isRotating,
    startRotateDisabled:
      !hasComputedLines || !hasObjective || isAnimating || isRotating,
    stopRotateDisabled: !isRotating,
    rotateObjectiveMode: isRotating,
    traceEnabled: state.traceEnabled,
  };
}

export function selectTopResultUiState(state: State): TopResultUiState {
  const objectiveActive = state.objectiveVector !== null;

  return {
    maximizeVisible: state.completionMode !== "draft" && objectiveActive,
    nullStateVisible:
      state.vertices.length === 0 &&
      state.objectiveVector === null &&
      state.currentObjective === null,
    objectiveActive,
    subjectToVisible:
      hasPolytopeLines(state.polytope) && state.polytope.lines.length > 0,
  };
}

export function selectInequalitiesUiState(state: State): InequalitiesUiState {
  if (state.inequalitiesMessage !== null) {
    return {
      items: [],
      message: state.inequalitiesMessage,
    };
  }

  if (!state.polytope) {
    return {
      items: [],
      message: null,
    };
  }

  return {
    items:
      state.completionMode === "draft"
        ? state.polytope.inequalities.slice(
            0,
            Math.max(0, state.polytope.inequalities.length - 1),
          )
        : state.polytope.inequalities,
    message: null,
  };
}

function getSolverButtonUiState(
  state: State,
  mode: SolverMode,
): SolverButtonUiState {
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

  if (
    state.polytope.kind !== "bounded" &&
    state.polytope.kind !== "unbounded"
  ) {
    return false;
  }

  if (
    mode !== "central" ||
    !state.objectiveVector ||
    state.polytope.kind !== "unbounded"
  ) {
    return true;
  }

  return !isObjectiveDirectionUnbounded(state.polytope.lines, [
    state.objectiveVector.x,
    state.objectiveVector.y,
  ]);
}

export function formatObjectiveDisplay(
  objectiveVector: State["objectiveVector"],
): string {
  if (!objectiveVector) {
    return "";
  }

  const round = (value: number) => Math.round(value * 1000) / 1000;
  const a = round(objectiveVector.x);
  const b = round(objectiveVector.y);
  const bTerm = b >= 0 ? `+ ${b}y` : `- ${-b}y`;
  return `${a}x ${bTerm}`;
}
