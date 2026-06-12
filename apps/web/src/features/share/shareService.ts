import { getSnapshot, getState, type SolverMode } from "@/features/core/store";
import {
  compactSharedAppState,
  type ShareSettings,
} from "@/features/share/sharedState";
import type { SolverControl } from "@/features/solver/solverControls";
import JSONCrush from "jsoncrush";

export function createShareService(getSolverControls: () => SolverControl[]) {
  const collectShareSettings = (mode: SolverMode): ShareSettings => {
    const settings = getState().solverSettings;
    const solverControl = getSolverControls().find((c) => c.mode === mode);
    return {
      objectiveAngleStep: settings.objectiveAngleStep,
      objectiveRotationSpeed: settings.objectiveRotationSpeed,
      ...(solverControl?.collectShareSettings() ?? {}),
    };
  };
  const share = () => {
    const {
      vertices,
      completionMode,
      objectiveVector,
      solverMode,
      zScale,
      is3DMode,
    } = getSnapshot();
    const payload = compactSharedAppState({
      vertices,
      completionMode,
      objective: objectiveVector,
      solverMode,
      settings: collectShareSettings(solverMode),
      zScale,
      ...(is3DMode ? { is3DMode } : {}),
    });
    const crushed = JSONCrush.crush(JSON.stringify(payload));
    window.prompt(
      "Share this link:",
      `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(crushed)}`,
    );
  };
  return { share, collectShareSettings };
}
