import { compactSharedAppState, type ShareSettings } from "@/lib/sharedState";
import type { SolverControl } from "@/lib/solverControls";
import { getState, type SolverMode } from "@/state";
import JSONCrush from "jsoncrush";
import { useCallback, useMemo } from "react";

export type ShareActions = {
  share: () => void;
  collectShareSettings: (mode: SolverMode) => ShareSettings;
};

export function useShare({
  solverControls,
}: {
  solverControls: SolverControl[];
}): ShareActions {
  const collectShareSettings = useCallback(
    (mode: SolverMode): ShareSettings => {
      const settings = getState().solverSettings;
      const solverControl = solverControls.find(
        (control) => control.mode === mode,
      );
      return {
        objectiveAngleStep: settings.objectiveAngleStep,
        objectiveRotationSpeed: settings.objectiveRotationSpeed,
        ...(solverControl?.collectShareSettings() ?? {}),
      };
    },
    [solverControls],
  );

  const share = useCallback(() => {
    const {
      vertices,
      completionMode,
      objectiveVector,
      solverMode,
      zScale,
      zAxisOffsetOnly,
    } = getState();
    const payload = compactSharedAppState({
      vertices,
      completionMode,
      objective: objectiveVector,
      solverMode,
      settings: collectShareSettings(solverMode),
      zScale,
      zAxisOffsetOnly,
    });
    const crushed = JSONCrush.crush(JSON.stringify(payload));
    window.prompt(
      "Share this link:",
      `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(crushed)}`,
    );
  }, [collectShareSettings]);

  return useMemo(
    () => ({ share, collectShareSettings }),
    [share, collectShareSettings],
  );
}
