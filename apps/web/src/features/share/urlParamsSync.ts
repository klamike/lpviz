import { getState, setState, type SolverMode } from "@/features/core/store";
import {
  buildSharedStatePatch,
  expandSharedAppState,
  type ShareSettings,
  type SharedAppState,
} from "@/features/share/sharedState";
import type {
  SolverControl,
  SolverSettingUpdater,
} from "@/features/solver/solverControls";
import type { ViewportApi } from "@/features/viewport/runtime";
import JSONCrush from "jsoncrush";

export function applyUrlParamsOnce({
  canvasManager,
  solverControls,
  updateSolverSetting,
  invalidatePendingSolveResults,
  setActiveSolverMode,
  sendPolytope,
}: {
  canvasManager: ViewportApi;
  solverControls: SolverControl[];
  updateSolverSetting: SolverSettingUpdater;
  invalidatePendingSolveResults: () => void;
  setActiveSolverMode: (mode: SolverMode, solve?: boolean) => void;
  sendPolytope: () => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const applySharedSettings = (settings: ShareSettings = {}) => {
    if (settings.objectiveAngleStep !== undefined)
      updateSolverSetting("objectiveAngleStep", settings.objectiveAngleStep);
    if (settings.objectiveRotationSpeed !== undefined)
      updateSolverSetting(
        "objectiveRotationSpeed",
        settings.objectiveRotationSpeed,
      );
    solverControls.forEach((c) => c.applySharedSettings(settings));
  };
  const applySharedState = (sharedState: SharedAppState) => {
    invalidatePendingSolveResults();
    setState(
      {
        ...buildSharedStatePatch(sharedState),
        inequalitiesMessage: null,
        highlightIndex: null,
      },
      {
        viewportDirty: {
          grid: true,
          polytope: true,
          constraints: true,
          objective: true,
          trace: true,
          iterate: true,
        },
      },
    );
    applySharedSettings(sharedState.settings);
    const state = getState();
    const regionFinished = state.completionMode !== "draft";
    setActiveSolverMode(state.solverMode);
    if (regionFinished) sendPolytope();
    canvasManager.draw();
  };
  if (!params.has("s")) return;
  try {
    const crushed = decodeURIComponent(params.get("s") ?? "");
    const data = JSON.parse(JSONCrush.uncrush(crushed));
    if (data) applySharedState(expandSharedAppState(data) as SharedAppState);
    history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    console.error("Failed to load shared state", error);
  }
}
