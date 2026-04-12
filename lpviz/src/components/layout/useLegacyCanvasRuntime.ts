import { useEffect, type RefObject } from "react";

import { initializeUI, type LegacyCanvasSurfaceElements } from "../../ui/interaction/initialize";

const noop = () => {};

type LegacyCanvasSurfaceRefs = {
  [K in keyof LegacyCanvasSurfaceElements]: RefObject<LegacyCanvasSurfaceElements[K] | null>;
};

const getRequiredElement = <T extends HTMLElement>(ref: RefObject<T | null>, id: string): T => {
  const element = ref.current;
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

export function useLegacyCanvasRuntime(canvasSurfaceRefs: LegacyCanvasSurfaceRefs) {
  const {
    canvas,
    shareButton,
    zoomButton,
    unzoomButton,
    toggle3DButton,
    toggleZOffsetButton,
    zScaleSlider,
    sidebarHandle,
  } = canvasSurfaceRefs;

  useEffect(() => {
    const canvasSurface = {
      canvas: getRequiredElement(canvas, "gridCanvas"),
      shareButton: getRequiredElement(shareButton, "shareButton"),
      zoomButton: getRequiredElement(zoomButton, "zoomButton"),
      unzoomButton: getRequiredElement(unzoomButton, "unzoomButton"),
      toggle3DButton: getRequiredElement(toggle3DButton, "toggle3DButton"),
      toggleZOffsetButton: getRequiredElement(toggleZOffsetButton, "toggleZOffsetButton"),
      zScaleSlider: getRequiredElement(zScaleSlider, "zScaleSlider"),
      sidebarHandle: getRequiredElement(sidebarHandle, "sidebarHandle"),
    } satisfies LegacyCanvasSurfaceElements;

    canvasSurface.canvas.focus();

    let disposed = false;
    let cleanup = noop;

    void initializeUI(canvasSurface, new URLSearchParams(window.location.search))
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
  }, [canvas, shareButton, zoomButton, unzoomButton, toggle3DButton, toggleZOffsetButton, zScaleSlider, sidebarHandle]);
}
