import { getSnapshot, getState, type SolverMode } from "@/features/core/store";
import { compactSharedAppState, type ShareSettings } from "@/features/share/sharedState";
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
    const { vertices, completionMode, objectiveVector, solverMode, zScale, is3DMode, problemMode, vertices3, objectiveVector3, editor3Phase } = getSnapshot();
    // a /3d link shares the solid's vertices (+3D objective); the base
    // sketch's vertices ride along so the sketch/extrude phases round-trip
    const share3D = problemMode === "3d" && editor3Phase !== "sketch" && editor3Phase !== "extrude" && vertices3.length >= 4;
    const payload = compactSharedAppState({
      vertices,
      completionMode,
      objective: objectiveVector,
      solverMode,
      settings: collectShareSettings(solverMode),
      ...(problemMode === "3d" ? {} : { zScale }),
      ...(is3DMode && problemMode !== "3d" ? { is3DMode } : {}),
      ...(share3D ? { vertices3, objective3: objectiveVector3 ?? undefined } : {}),
    });
    const crushed = JSONCrush.crush(JSON.stringify(payload));
    window.prompt("Share this link:", `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(crushed)}`);
  };
  return { share, collectShareSettings };
}
