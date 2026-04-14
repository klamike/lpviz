import { useEffect, useRef } from "react";

import { initializeCanvasRuntime } from "@lpviz/runtime";
import type { R3FViewportBridge } from "@lpviz/viewport";
import { useRegisterLpvizRuntimeActions } from "../../context/LpvizRuntimeProvider";
import { useOnboardingUiController } from "../onboarding/OnboardingProvider";

const noop = () => {};

export function useCanvasRuntime(
  {
    viewportBridge,
  }: {
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

    viewportBridge.getCanvasElement().focus();

    let disposed = false;
    let cleanup = noop;

    void initializeCanvasRuntime(
      { viewportBridge },
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
  }, [onboardingUi, registerRuntimeActions, viewportBridge]);
}
