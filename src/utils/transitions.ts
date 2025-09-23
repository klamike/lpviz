import { state } from "../state/state";
import { CanvasManager } from "../ui/canvasManager";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function start3DTransition(
  canvasManager: CanvasManager,
  targetMode: boolean,
) {
  if (state.isTransitioning3D) {
    return;
  }

  state.isTransitioning3D = true;
  state.transitionStartTime = performance.now();

  const transitionDuration = targetMode ? 400 : 500;

  if (targetMode) {
    state.transition3DStartAngles = { x: 0, y: 0, z: 0 };
    state.transition3DEndAngles = { x: -1.15, y: 0.4, z: 0 };
  } else {
    state.transition3DStartAngles = {
      x: state.viewAngle.x,
      y: state.viewAngle.y,
      z: state.viewAngle.z,
    };
    state.transition3DEndAngles = { x: 0, y: 0, z: 0 };
  }

  state.is3DMode = targetMode;
  animate3DTransition(canvasManager, targetMode, transitionDuration);
}

function animate3DTransition(
  canvasManager: CanvasManager,
  targetMode: boolean,
  transitionDuration: number,
) {
  const currentTime = performance.now();
  const elapsed = currentTime - state.transitionStartTime;
  const progress = Math.min(elapsed / transitionDuration, 1);

  const easedProgress = easeInOutCubic(progress);

  state.viewAngle.x = lerpAngle(
    state.transition3DStartAngles.x,
    state.transition3DEndAngles.x,
    easedProgress,
  );
  state.viewAngle.y = lerpAngle(
    state.transition3DStartAngles.y,
    state.transition3DEndAngles.y,
    easedProgress,
  );
  state.viewAngle.z = lerpAngle(
    state.transition3DStartAngles.z,
    state.transition3DEndAngles.z,
    easedProgress,
  );

  if (progress < 1) {
    canvasManager.draw();
    requestAnimationFrame(() =>
      animate3DTransition(canvasManager, targetMode, transitionDuration),
    );
  } else {
    state.isTransitioning3D = false;

    if (targetMode) {
      state.viewAngle.x = -1.15;
      state.viewAngle.y = 0.4;
      state.viewAngle.z = 0;
    } else {
      state.viewAngle.x = 0;
      state.viewAngle.y = 0;
      state.viewAngle.z = 0;
    }

    canvasManager.draw();
  }
}
