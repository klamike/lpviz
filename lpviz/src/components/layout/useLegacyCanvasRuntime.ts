import { useEffect, useRef } from "react";

import { initializeUI } from "../../ui/interaction/initialize";

const noop = () => {};

export function useLegacyCanvasRuntime() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      throw new Error('Canvas element with id "gridCanvas" not found');
    }

    canvas.focus();

    let disposed = false;
    let cleanup = noop;

    void initializeUI(canvas, new URLSearchParams(window.location.search))
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
  }, []);

  return canvasRef;
}
