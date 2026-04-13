import { useEffect, useRef, type RefObject } from "react";

import { type LegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { initializeUI } from "../../ui/interaction/initialize";

const noop = () => {};

const getRequiredElement = <T extends HTMLElement>(ref: RefObject<T | null>, id: string): T => {
  const element = ref.current;
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

export function useLegacyCanvasRuntime(runtimeElementRefs: LegacyRuntimeElementRefs, initialSidebarWidth: number) {
  const {
    canvas,
    result,
    resultVirtualHost,
  } = runtimeElementRefs;
  const initialSidebarWidthRef = useRef(initialSidebarWidth);

  useEffect(() => {
    const runtimeElements = {
      canvas: getRequiredElement(canvas, "gridCanvas"),
      result: getRequiredElement(result, "result"),
      resultVirtualHost: getRequiredElement(resultVirtualHost, "resultVirtualHost"),
    };

    runtimeElements.canvas.focus();

    let disposed = false;
    let cleanup = noop;

    void initializeUI(runtimeElements, new URLSearchParams(window.location.search), {
      initialSidebarWidth: initialSidebarWidthRef.current,
    })
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
  }, [
    canvas,
    result,
    resultVirtualHost,
  ]);
}
