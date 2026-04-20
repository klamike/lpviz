import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

import type { R3FViewportBridge } from "@/viewport";

export function ViewportBridge({
  onReady,
  onDispose,
}: {
  onReady: (bridge: R3FViewportBridge) => void;
  onDispose?: () => void;
}) {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.classList.add("canvas-stage__r3f-canvas");

    onReady({
      getCanvasElement: () => canvas,
      getCanvasRect: () => canvas.getBoundingClientRect(),
      invalidate,
    });

    return () => {
      canvas.classList.remove("canvas-stage__r3f-canvas");
      onDispose?.();
    };
  }, [gl, invalidate, onDispose, onReady]);

  return null;
}
