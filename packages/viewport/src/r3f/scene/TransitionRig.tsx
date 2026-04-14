import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { useViewportTransitionConfig } from "../viewportTransitionStore";

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function TransitionRig() {
  const invalidate = useThree((state) => state.invalidate);
  const transitionConfig = useViewportTransitionConfig();
  const completedRunIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!transitionConfig.active) {
      completedRunIdRef.current = null;
      return;
    }
    completedRunIdRef.current = null;
    invalidate();
  }, [invalidate, transitionConfig.active, transitionConfig.runId]);

  useFrame(() => {
    if (!transitionConfig.active) {
      return;
    }

    const duration = Math.max(1, transitionConfig.duration);
    const elapsed = performance.now() - transitionConfig.startTime;
    const progress = Math.max(0, Math.min(elapsed / duration, 1));
    const easedProgress = easeInOutCubic(progress);

    transitionConfig.onFrame?.(progress, easedProgress);

    if (progress < 1) {
      invalidate();
      return;
    }

    if (completedRunIdRef.current === transitionConfig.runId) {
      return;
    }
    completedRunIdRef.current = transitionConfig.runId;
    transitionConfig.onComplete?.();
  });

  return null;
}
