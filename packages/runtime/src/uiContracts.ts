import type { SolverMode, SolverSettings } from "@lpviz/state";

export type LpvizRuntimeActions = {
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

export type RegisterLpvizRuntimeActions = (
  actions: LpvizRuntimeActions,
) => () => void;

export type OnboardingActionTarget =
  | "activate-ipm"
  | "activate-central"
  | "toggle-3d"
  | "start-rotation"
  | "toggle-trace";

export type OnboardingUiController = {
  getActionTarget: (target: OnboardingActionTarget) => HTMLElement | null;
  showCursor: () => void;
  hideCursor: () => void;
  moveCursor: (x: number, y: number) => void;
  setCursorClicking: (clicking: boolean) => void;
  showHelpPopup: (options: {
    text: string;
    gradient: string;
    onClick?: () => void;
    onClose?: () => void;
  }) => void;
  hideHelpPopup: () => void;
  showNonconvexHint: (options: {
    text: string;
    gradient: string;
    onClick?: () => void;
    onClose?: () => void;
  }) => void;
  hideNonconvexHint: () => void;
};
