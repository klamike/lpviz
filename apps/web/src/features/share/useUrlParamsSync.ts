import {
  buildSharedStatePatch,
  expandSharedAppState,
  type ShareSettings,
  type SharedAppState,
} from "@/features/share/sharedState";
import type { SolverControl, SolverSettingUpdater } from "@/features/solver/solverControls";
import { getState, mutate, type SolverMode } from "@/features/core/store";
import type { ViewportApi } from "@/features/viewport/runtime";
import JSONCrush from "jsoncrush";
import { useEffect, useRef } from "react";

type UseUrlParamsSyncOptions = {
  canvasManager: ViewportApi | null;
  solverControls: SolverControl[];
  updateSolverSetting: SolverSettingUpdater;
  invalidatePendingSolveResults: () => void;
  setActiveSolverMode: (mode: SolverMode, solve?: boolean) => void;
  sendPolytope: () => void;
  resetTour: () => void;
  startDemo: () => Promise<void> | void;
};

export function useUrlParamsSync({
  canvasManager,
  solverControls,
  updateSolverSetting,
  invalidatePendingSolveResults,
  setActiveSolverMode,
  sendPolytope,
  resetTour,
  startDemo,
}: UseUrlParamsSyncOptions) {
  const appliedRef = useRef(false);
  const solverControlsRef = useRef(solverControls);
  solverControlsRef.current = solverControls;
  const updateSolverSettingRef = useRef(updateSolverSetting);
  updateSolverSettingRef.current = updateSolverSetting;
  const invalidatePendingRef = useRef(invalidatePendingSolveResults);
  invalidatePendingRef.current = invalidatePendingSolveResults;
  const setActiveSolverModeRef = useRef(setActiveSolverMode);
  setActiveSolverModeRef.current = setActiveSolverMode;
  const sendPolytopeRef = useRef(sendPolytope);
  sendPolytopeRef.current = sendPolytope;
  const resetTourRef = useRef(resetTour);
  resetTourRef.current = resetTour;
  const startDemoRef = useRef(startDemo);
  startDemoRef.current = startDemo;

  useEffect(() => {
    if (!canvasManager || appliedRef.current) return;
    appliedRef.current = true;

    const params = new URLSearchParams(window.location.search);

    const applySharedSettings = (settings: ShareSettings = {}) => {
      if (settings.objectiveAngleStep !== undefined) {
        updateSolverSettingRef.current(
          "objectiveAngleStep",
          settings.objectiveAngleStep,
        );
      }
      if (settings.objectiveRotationSpeed !== undefined) {
        updateSolverSettingRef.current(
          "objectiveRotationSpeed",
          settings.objectiveRotationSpeed,
        );
      }
      solverControlsRef.current.forEach((control) =>
        control.applySharedSettings(settings),
      );
    };

    const applySharedState = (sharedState: SharedAppState) => {
      invalidatePendingRef.current();
      mutate((draft) => {
        Object.assign(draft, buildSharedStatePatch(sharedState));
        draft.inequalitiesMessage = null;
        draft.highlightIndex = null;
      });
      applySharedSettings(sharedState.settings);

      const state = getState();
      const regionFinished = state.completionMode !== "draft";
      setActiveSolverModeRef.current(state.solverMode);

      if (regionFinished) {
        sendPolytopeRef.current();
      }
      canvasManager.draw();
    };

    if (params.has("s")) {
      try {
        const crushed = decodeURIComponent(params.get("s") ?? "");
        const jsonString = JSONCrush.uncrush(crushed);
        const data = JSON.parse(jsonString);
        if (data) {
          applySharedState(expandSharedAppState(data) as SharedAppState);
        }
        history.replaceState(null, "", window.location.pathname);
        resetTourRef.current();
      } catch (error) {
        console.error("Failed to load shared state", error);
      }
    }

    if (params.has("demo")) {
      void startDemoRef.current();
    }
  }, [canvasManager]);
}
