import { getState, mutate, setState, setFields } from "../state/store";
import { CanvasViewportManager } from "../ui/managers/canvasViewportManager";
import { InterfaceLayoutManager } from "../ui/managers/interfaceLayoutManager";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function start3DTransition(canvasManager: CanvasViewportManager, uiManager: InterfaceLayoutManager, targetMode: boolean) {
  const { isTransitioning3D, viewAngle } = getState();
  if (isTransitioning3D) return;

  const transitionDuration = targetMode ? 400 : 500;
  const startAngles = targetMode ? { x: 0, y: 0, z: 0 } : { ...viewAngle };
  const endAngles = targetMode ? { x: -1.15, y: 0.4, z: 0 } : { x: 0, y: 0, z: 0 };

  canvasManager.prepareFor3DTransition(targetMode);

  setFields({
    isTransitioning3D: true,
    transitionStartTime: performance.now(),
    transition3DStartAngles: startAngles,
    transition3DEndAngles: endAngles,
    is3DMode: targetMode,
  });

  uiManager.update3DButtonState();
  animate3DTransition(canvasManager, uiManager, targetMode, transitionDuration);
}

function animate3DTransition(canvasManager: CanvasViewportManager, uiManager: InterfaceLayoutManager, targetMode: boolean, transitionDuration: number) {
  const currentTime = performance.now();
  const snapshot = getState();
  const elapsed = currentTime - snapshot.transitionStartTime;
  const progress = Math.min(elapsed / transitionDuration, 1);

  const easedProgress = easeInOutCubic(progress);
  mutate((draft) => {
    draft.viewAngle.x = lerpAngle(draft.transition3DStartAngles.x, draft.transition3DEndAngles.x, easedProgress);
    draft.viewAngle.y = lerpAngle(draft.transition3DStartAngles.y, draft.transition3DEndAngles.y, easedProgress);
    draft.viewAngle.z = lerpAngle(draft.transition3DStartAngles.z, draft.transition3DEndAngles.z, easedProgress);
  });

  if (progress < 1) {
    canvasManager.draw();
    requestAnimationFrame(() => animate3DTransition(canvasManager, uiManager, targetMode, transitionDuration));
  } else {
    mutate((draft) => {
      draft.isTransitioning3D = false;

      if (targetMode) {
        draft.viewAngle.x = -1.15;
        draft.viewAngle.y = 0.4;
        draft.viewAngle.z = 0;
      } else {
        draft.viewAngle.x = 0;
        draft.viewAngle.y = 0;
        draft.viewAngle.z = 0;
      }
    });

    canvasManager.draw();
  }
}
