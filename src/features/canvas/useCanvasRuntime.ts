import { useEffect, useRef, type RefObject } from "react";

import { useRegisterLpvizRuntimeActions } from "../../context/LpvizRuntimeProvider";
import { useOnboardingUiController } from "../onboarding/OnboardingProvider";
import { initializeCanvasRuntime } from "./initializeCanvasRuntime";
import type { R3FViewportBridge } from "./r3f/ViewportBridge";

const noop = () => {};

const getRequiredElement = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  label: string,
): T => {
  const element = ref.current;
  if (!element) {
    throw new Error(`${label} is not ready`);
  }
  return element;
};

export function useCanvasRuntime(
  {
    canvasRef,
    viewportBridge,
  }: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    viewportBridge: R3FViewportBridge | null;
  },
  initialSidebarWidth: number,
) {
  const initialSidebarWidthRef = useRef(initialSidebarWidth);
  const registerRuntimeActions = useRegisterLpvizRuntimeActions();
  const onboardingUi = useOnboardingUiController();

  useEffect(() => {
    if (!viewportBridge) {
      return;
    }

    const canvas = getRequiredElement(canvasRef, "Legacy canvas stage");
    viewportBridge.getCanvasElement().focus();

    let disposed = false;
    let cleanup = noop;

    void initializeCanvasRuntime(
      { canvas, viewportBridge },
      new URLSearchParams(window.location.search),
      { initialSidebarWidth: initialSidebarWidthRef.current },
      { registerRuntimeActions, onboardingUi },
    )
      .then((nextCleanup) => {
        if (disposed) {
          nextCleanup();
          return;
        }
        cleanup = nextCleanup;
      })
      .catch((error) => {
        console.error("Failed to initialize lpviz", error);
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [canvasRef, onboardingUi, registerRuntimeActions, viewportBridge]);
}
