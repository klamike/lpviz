import type { ResultTextBlock } from "@/features/solver/types";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";
import { isObjectiveDirectionUnbounded } from "@lpviz/polytope/objectiveDirection";
import {
  computeDrawingPhase,
  type SolverMode,
  type SolverSettings,
  type State,
} from "./store";

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
  rotateObjectiveMode: boolean;
  traceEnabled: boolean;
};

export type TopResultUiState = {
  maximizeVisible: boolean;
  nullStateVisible: boolean;
  objectiveActive: boolean;
  objectiveDisplayText: string;
  subjectToVisible: boolean;
};

export type InequalitiesUiState = {
  items: string[];
  message: string | null;
};

export type ResultPanelUiState = {
  mode: State["resultDisplayMode"];
  blocks: ResultTextBlock[] | null;
  virtualHeader: string | null;
  virtualFooter: string | null;
  virtualShowEmpty: boolean;
  virtualRows: ResultTextBlock[];
  maxLineChars: number;
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

export function areSolverControlsUiStatesEqual(
  a: SolverControlsUiState,
  b: SolverControlsUiState,
): boolean {
  if (a.activeMode !== b.activeMode) {
    return false;
  }

  return SOLVER_MODES.every((mode) => {
    const current = a.buttons[mode];
    const next = b.buttons[mode];
    return current.active === next.active && current.disabled === next.disabled;
  });
}

export function selectCanvasControlsUiState(
  state: State,
): CanvasControlsUiState {
  return {
    is3DMode: state.is3DMode,
    toggle3DLabel: state.is3DMode ? "2D" : "3D",
    zAxisOffsetOnly: state.zAxisOffsetOnly,
    zScale: state.zScale,
  };
}

export function areCanvasControlsUiStatesEqual(
  a: CanvasControlsUiState,
  b: CanvasControlsUiState,
): boolean {
  return (
    a.is3DMode === b.is3DMode &&
    a.toggle3DLabel === b.toggle3DLabel &&
    a.zAxisOffsetOnly === b.zAxisOffsetOnly &&
    a.zScale === b.zScale
  );
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

export function areAnimationControlsUiStatesEqual(
  a: AnimationControlsUiState,
  b: AnimationControlsUiState,
): boolean {
  return (
    a.animateDisabled === b.animateDisabled &&
    a.startRotateDisabled === b.startRotateDisabled &&
    a.stopRotateDisabled === b.stopRotateDisabled &&
    a.rotateObjectiveMode === b.rotateObjectiveMode &&
    a.traceEnabled === b.traceEnabled
  );
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
    objectiveDisplayText: formatObjectiveDisplay(state.objectiveVector),
    subjectToVisible:
      hasPolytopeLines(state.polytope) && state.polytope.lines.length > 0,
  };
}

export function areTopResultUiStatesEqual(
  a: TopResultUiState,
  b: TopResultUiState,
): boolean {
  return (
    a.maximizeVisible === b.maximizeVisible &&
    a.nullStateVisible === b.nullStateVisible &&
    a.objectiveActive === b.objectiveActive &&
    a.objectiveDisplayText === b.objectiveDisplayText &&
    a.subjectToVisible === b.subjectToVisible
  );
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

export function areInequalitiesUiStatesEqual(
  a: InequalitiesUiState,
  b: InequalitiesUiState,
): boolean {
  if (a.message !== b.message || a.items.length !== b.items.length) {
    return false;
  }

  return a.items.every((item, index) => item === b.items[index]);
}

export function selectResultPanelUiState(state: State): ResultPanelUiState {
  return {
    mode: state.resultDisplayMode,
    blocks: state.resultBlocks,
    virtualHeader: state.resultVirtualHeader,
    virtualFooter: state.resultVirtualFooter,
    virtualShowEmpty: state.resultVirtualShowEmpty,
    virtualRows: state.resultVirtualRows,
    maxLineChars: state.resultMaxLineChars,
  };
}

export function areResultPanelUiStatesEqual(
  a: ResultPanelUiState,
  b: ResultPanelUiState,
): boolean {
  // Note: virtualRows is intentionally excluded from this comparison.
  // SolverLogPanel subscribes to state.resultVirtualRows directly and paints the
  // VirtualList imperatively, so row-data changes shouldn't trigger React
  // re-renders of SolverLogPanel or the O(n) deep compare that used to run here
  // on every store update during objective rotation.
  if (
    a.mode !== b.mode ||
    a.blocks?.length !== b.blocks?.length ||
    a.virtualHeader !== b.virtualHeader ||
    a.virtualFooter !== b.virtualFooter ||
    a.virtualShowEmpty !== b.virtualShowEmpty ||
    a.maxLineChars !== b.maxLineChars
  ) {
    return false;
  }

  if (!a.blocks || !b.blocks) {
    return a.blocks === b.blocks;
  }

  return a.blocks.every((block, index) => {
    const nextBlock = b.blocks![index];
    return (
      block.className === nextBlock.className &&
      block.text === nextBlock.text &&
      block.index === nextBlock.index
    );
  });
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

export function selectSolverSettings(state: State): SolverSettings {
  return { ...state.solverSettings };
}

export function areSolverSettingsEqual(
  a: SolverSettings,
  b: SolverSettings,
): boolean {
  return (
    a.alphaMax === b.alphaMax &&
    a.correctorThreshold === b.correctorThreshold &&
    a.maxitIPM === b.maxitIPM &&
    a.ipmColorByPhase === b.ipmColorByPhase &&
    a.simplexDualMode === b.simplexDualMode &&
    a.pdhgEta === b.pdhgEta &&
    a.pdhgTau === b.pdhgTau &&
    a.maxitPDHG === b.maxitPDHG &&
    a.pdhgIneqMode === b.pdhgIneqMode &&
    a.pdhgHalpernMode === b.pdhgHalpernMode &&
    a.pdhgColorByBasis === b.pdhgColorByBasis &&
    a.centralPathIter === b.centralPathIter &&
    a.objectiveAngleStep === b.objectiveAngleStep &&
    a.objectiveRotationSpeed === b.objectiveRotationSpeed &&
    a.replaySpeed === b.replaySpeed
  );
}

function formatObjectiveDisplay(
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
