import { useEffect, useRef, type RefObject } from "react";

import { useRegisterLpvizRuntimeActions } from "../../context/LpvizRuntimeProvider";
import { useOnboardingUiController } from "../onboarding/OnboardingProvider";
import { initializeCanvasRuntime } from "./initializeCanvasRuntime";

const noop = () => {};

const getRequiredElement = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  id: string,
): T => {
  const element = ref.current;
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

export function useCanvasRuntime(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  initialSidebarWidth: number,
) {
  const initialSidebarWidthRef = useRef(initialSidebarWidth);
  const registerRuntimeActions = useRegisterLpvizRuntimeActions();
  const onboardingUi = useOnboardingUiController();

  useEffect(() => {
    const canvas = getRequiredElement(canvasRef, "gridCanvas");
    canvas.focus();

    let disposed = false;
    let cleanup = noop;

    void initializeCanvasRuntime(
      { canvas },
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
  }, [canvasRef, onboardingUi, registerRuntimeActions]);
}
