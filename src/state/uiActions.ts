import { SolverMode, state } from "./state";
import { CanvasManager } from "../ui/canvasManager";

export function hideNullStateMessage(): void {
  state.showNullStateMessage = false;
}

export function showNullStateMessage(): void {
  state.showNullStateMessage = true;
}

export function setScreenTooSmall(
  isTooSmall: boolean,
  viewportWidth?: number,
): void {
  state.isScreenTooSmall = isTooSmall;
  if (typeof viewportWidth === "number") {
    state.viewportWidth = viewportWidth;
  }
}

export function updateZoomButtonStates(canvasManager: CanvasManager): void {
  const atDefault =
    canvasManager.scaleFactor === 1 &&
    canvasManager.offset.x === 0 &&
    canvasManager.offset.y === 0;

  state.uiButtons["zoomButton"] = true;
  state.uiButtons["unzoomButton"] = !atDefault;
}

export function updateSolverButtonStates(): void {
  const hasComputedLines =
    state.computedLines && state.computedLines.length > 0;
  const hasSolution =
    state.originalIteratePath && state.originalIteratePath.length > 0;
  const hasObjective = state.objectiveVector !== null;

  if (!hasComputedLines) {
    [
      "iteratePathButton",
      "ipmButton",
      "simplexButton",
      "pdhgButton",
      "animateButton",
      "startRotateObjectiveButton",
    ].forEach((id) => {
      state.uiButtons[id] = false;
    });
  } else {
    const buttonModeMap: Array<[string, SolverMode]> = [
      ["iteratePathButton", "central"],
      ["ipmButton", "ipm"],
      ["simplexButton", "simplex"],
      ["pdhgButton", "pdhg"],
    ];

    buttonModeMap.forEach(([id, mode]) => {
      state.uiButtons[id] = state.solverMode !== mode;
    });

    state.uiButtons["animateButton"] = !!hasSolution;
    state.uiButtons["startRotateObjectiveButton"] = hasObjective;
  }

  state.uiButtons["stopRotateObjectiveButton"] = state.rotateObjectiveMode;
}

export function setSolverMode(mode: SolverMode): void {
  state.solverMode = mode;
  state.solverSettingsVisible.ipm = mode === "ipm";
  state.solverSettingsVisible.pdhg = mode === "pdhg";
  state.solverSettingsVisible.central = mode === "central";
  updateSolverButtonStates();
}

export function synchronizeUIState(canvasManager?: CanvasManager): void {
  if (canvasManager) {
    updateZoomButtonStates(canvasManager);
  }
  updateSolverButtonStates();
  if (state.vertices.length > 0 || state.objectiveVector) {
    hideNullStateMessage();
  }
}
