import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import type { SolverMode, SolverSettings } from "./store/lpvizStore";

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

const noop = () => {};
const noopUpdateSolverSetting: LpvizRuntimeActions["updateSolverSetting"] =
  () => {};

const createNoopActions = (): LpvizRuntimeActions => ({
  setConstraintHighlight: noop,
  setIterateHighlight: noop,
  updateSolverSetting: noopUpdateSolverSetting,
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
});

const LpvizRuntimeActionsContext = createContext<LpvizRuntimeActions | null>(
  null,
);
const RegisterLpvizRuntimeActionsContext =
  createContext<RegisterLpvizRuntimeActions | null>(null);

export function LpvizRuntimeProvider({ children }: PropsWithChildren) {
  const actionsRef = useRef<LpvizRuntimeActions>(createNoopActions());

  const runtimeActions = useMemo<LpvizRuntimeActions>(
    () => ({
      setConstraintHighlight(index) {
        actionsRef.current.setConstraintHighlight(index);
      },
      setIterateHighlight(index) {
        actionsRef.current.setIterateHighlight(index);
      },
      updateSolverSetting(key, value) {
        actionsRef.current.updateSolverSetting(key, value);
      },
      recomputeIfModeActive(mode) {
        actionsRef.current.recomputeIfModeActive(mode);
      },
      setTraceEnabled(enabled) {
        actionsRef.current.setTraceEnabled(enabled);
      },
      startReplay() {
        actionsRef.current.startReplay();
      },
      startRotation() {
        actionsRef.current.startRotation();
      },
      stopRotation() {
        actionsRef.current.stopRotation();
      },
      share() {
        actionsRef.current.share();
      },
      zoomToFit() {
        actionsRef.current.zoomToFit();
      },
      resetView() {
        actionsRef.current.resetView();
      },
      toggle3D() {
        actionsRef.current.toggle3D();
      },
      toggleZOffset() {
        actionsRef.current.toggleZOffset();
      },
      setZScale(value) {
        actionsRef.current.setZScale(value);
      },
      setActiveSolverMode(mode) {
        actionsRef.current.setActiveSolverMode(mode);
      },
      setSidebarWidth(width) {
        actionsRef.current.setSidebarWidth(width);
      },
      syncViewportLayout(sidebarWidth) {
        actionsRef.current.syncViewportLayout(sidebarWidth);
      },
    }),
    [],
  );

  const registerRuntimeActions = useCallback<RegisterLpvizRuntimeActions>(
    (actions) => {
      actionsRef.current = actions;

      return () => {
        if (actionsRef.current === actions) {
          actionsRef.current = createNoopActions();
        }
      };
    },
    [],
  );

  return (
    <RegisterLpvizRuntimeActionsContext.Provider value={registerRuntimeActions}>
      <LpvizRuntimeActionsContext.Provider value={runtimeActions}>
        {children}
      </LpvizRuntimeActionsContext.Provider>
    </RegisterLpvizRuntimeActionsContext.Provider>
  );
}

export function useLpvizRuntime() {
  const runtimeActions = useContext(LpvizRuntimeActionsContext);
  if (!runtimeActions) {
    throw new Error("LpvizRuntimeProvider is missing");
  }
  return runtimeActions;
}

export function useRegisterLpvizRuntimeActions() {
  const registerRuntimeActions = useContext(RegisterLpvizRuntimeActionsContext);
  if (!registerRuntimeActions) {
    throw new Error("LpvizRuntimeProvider is missing");
  }
  return registerRuntimeActions;
}
