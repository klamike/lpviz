import type { SolverMode, SolverSettings } from "../state/store";

type LpvizRuntimeCommandHandlers = {
  setConstraintHighlight: (index: number | null) => void;
  setIterateHighlight: (index: number | null) => void;
  updateSolverSetting: <K extends keyof SolverSettings>(key: K, value: SolverSettings[K]) => void;
  recomputeIfModeActive: (mode: SolverMode) => void;
  setTraceEnabled: (enabled: boolean) => void;
  startReplay: () => void;
  startRotation: () => void;
  stopRotation: () => void;
};

const noop = () => {};

let runtimeCommandHandlers: LpvizRuntimeCommandHandlers = {
  setConstraintHighlight: noop,
  setIterateHighlight: noop,
  updateSolverSetting: noop,
  recomputeIfModeActive: noop,
  setTraceEnabled: noop,
  startReplay: noop,
  startRotation: noop,
  stopRotation: noop,
};

export const lpvizRuntimeCommands = {
  setConstraintHighlight(index: number | null) {
    runtimeCommandHandlers.setConstraintHighlight(index);
  },
  setIterateHighlight(index: number | null) {
    runtimeCommandHandlers.setIterateHighlight(index);
  },
  updateSolverSetting<K extends keyof SolverSettings>(key: K, value: SolverSettings[K]) {
    runtimeCommandHandlers.updateSolverSetting(key, value);
  },
  recomputeIfModeActive(mode: SolverMode) {
    runtimeCommandHandlers.recomputeIfModeActive(mode);
  },
  setTraceEnabled(enabled: boolean) {
    runtimeCommandHandlers.setTraceEnabled(enabled);
  },
  startReplay() {
    runtimeCommandHandlers.startReplay();
  },
  startRotation() {
    runtimeCommandHandlers.startRotation();
  },
  stopRotation() {
    runtimeCommandHandlers.stopRotation();
  },
};

export function registerLpvizRuntimeCommands(handlers: LpvizRuntimeCommandHandlers) {
  runtimeCommandHandlers = handlers;

  return () => {
    runtimeCommandHandlers = {
      setConstraintHighlight: noop,
      setIterateHighlight: noop,
      updateSolverSetting: noop,
      recomputeIfModeActive: noop,
      setTraceEnabled: noop,
      startReplay: noop,
      startRotation: noop,
      stopRotation: noop,
    };
  };
}
