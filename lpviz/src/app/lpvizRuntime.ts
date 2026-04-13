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
  share: noop,
  zoomToFit: noop,
  resetView: noop,
  toggle3D: noop,
  toggleZOffset: noop,
  setZScale: noop,
  setActiveSolverMode: noop,
  setSidebarWidth: noop,
  syncViewportLayout: noop,
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
  share() {
    runtimeCommandHandlers.share();
  },
  zoomToFit() {
    runtimeCommandHandlers.zoomToFit();
  },
  resetView() {
    runtimeCommandHandlers.resetView();
  },
  toggle3D() {
    runtimeCommandHandlers.toggle3D();
  },
  toggleZOffset() {
    runtimeCommandHandlers.toggleZOffset();
  },
  setZScale(value: number) {
    runtimeCommandHandlers.setZScale(value);
  },
  setActiveSolverMode(mode: SolverMode) {
    runtimeCommandHandlers.setActiveSolverMode(mode);
  },
  setSidebarWidth(width: number) {
    runtimeCommandHandlers.setSidebarWidth(width);
  },
  syncViewportLayout(sidebarWidth: number) {
    runtimeCommandHandlers.syncViewportLayout(sidebarWidth);
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
      share: noop,
      zoomToFit: noop,
      resetView: noop,
      toggle3D: noop,
      toggleZOffset: noop,
      setZScale: noop,
      setActiveSolverMode: noop,
      setSidebarWidth: noop,
      syncViewportLayout: noop,
    };
  };
}
