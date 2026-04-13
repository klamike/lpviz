import { useEffect, type RefObject } from "react";

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

export function useLegacyCanvasRuntime(runtimeElementRefs: LegacyRuntimeElementRefs) {
  const {
    canvas,
    sidebar,
    sidebarHandle,
    topResult,
    result,
    resultVirtualHost,
  } = runtimeElementRefs;

  useEffect(() => {
    const runtimeElements = {
      canvas: getRequiredElement(canvas, "gridCanvas"),
      sidebar: getRequiredElement(sidebar, "sidebar"),
      sidebarHandle: getRequiredElement(sidebarHandle, "sidebarHandle"),
      topResult: getRequiredElement(topResult, "topResult"),
      result: getRequiredElement(result, "result"),
      resultVirtualHost: getRequiredElement(resultVirtualHost, "resultVirtualHost"),
    };

    runtimeElements.canvas.focus();

    let disposed = false;
    let cleanup = noop;

    void initializeUI(runtimeElements, new URLSearchParams(window.location.search))
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
    sidebar,
    sidebarHandle,
    topResult,
    result,
    resultVirtualHost,
  ]);
}
