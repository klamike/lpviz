import type { SolverMode, SolverSettings } from "@/state";
import { createContext, useContext } from "react";

export type LpvizActions = {
  setConstraintHighlight: (index: number | null) => void;
  setIterateHighlight: (index: number | null) => void;
  updateSolverSetting: <K extends keyof SolverSettings>(
    key: K,
    value: SolverSettings[K],
  ) => void;
  recomputeIfModeActive: (mode: SolverMode) => void;
  setTraceEnabled: (enabled: boolean) => void;
  startReplay: () => void;
  startRotation: () => void;
  stopRotation: () => void;
  share: () => void;
  zoomToFit: () => void;
  resetView: () => void;
  toggle3D: () => void;
  toggleZOffset: () => void;
  setZScale: (value: number) => void;
  setActiveSolverMode: (mode: SolverMode) => void;
  setSidebarWidth: (width: number) => void;
  syncViewportLayout: (sidebarWidth: number) => void;
};

export const LpvizActionsContext = createContext<LpvizActions | null>(null);

export function useLpvizActions(): LpvizActions {
  const value = useContext(LpvizActionsContext);
  if (!value) {
    throw new Error("LpvizProvider is missing");
  }
  return value;
}
