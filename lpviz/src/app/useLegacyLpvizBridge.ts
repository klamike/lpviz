import { useEffect, type RefObject } from "react";

import { initializeUI } from "../ui/interaction/initialize";
import { renderNullStateLogo } from "../ui/logo";

type LegacyLpvizBridgeRefs = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nullStateMessageRef: RefObject<HTMLDivElement | null>;
};

const noop = () => {};

export function useLegacyLpvizBridge({ canvasRef, nullStateMessageRef }: LegacyLpvizBridgeRefs) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const nullStateMessage = nullStateMessageRef.current;

    if (!canvas) {
      throw new Error('Canvas element with id "gridCanvas" not found');
    }
    if (!nullStateMessage) {
      throw new Error('Element with id "nullStateMessage" not found');
    }

    let disposed = false;
    let cleanup = noop;

    renderNullStateLogo(nullStateMessage);

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
  }, [canvasRef, nullStateMessageRef]);
}
