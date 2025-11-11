import { getViewState, mutateViewState } from "../state/state";
import { CanvasManager } from "../ui/canvasManager";
import { UIManager } from "../ui/uiManager";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function start3DTransition(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  targetMode: boolean
) {
  if (getViewState().isTransitioning3D) {
    return;
  }

  const transitionDuration = targetMode ? 400 : 500;

  mutateViewState((draft) => {
    draft.isTransitioning3D = true;
    draft.transitionStartTime = performance.now();
    
    if (targetMode) {
      draft.transition3DStartAngles = { x: 0, y: 0, z: 0 };
      draft.transition3DEndAngles = { x: -1.15, y: 0.4, z: 0 };
    } else {
      draft.transition3DStartAngles = { 
        x: draft.viewAngle.x, 
        y: draft.viewAngle.y, 
        z: draft.viewAngle.z 
      };
      draft.transition3DEndAngles = { x: 0, y: 0, z: 0 };
    }
    
    draft.is3DMode = targetMode;
  });

  uiManager.update3DButtonState();
  
  animate3DTransition(canvasManager, uiManager, targetMode, transitionDuration);
}

function animate3DTransition(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  targetMode: boolean,
  transitionDuration: number
) {
  const currentTime = performance.now();
  const snapshot = getViewState();
  const elapsed = currentTime - snapshot.transitionStartTime;
  const progress = Math.min(elapsed / transitionDuration, 1);
  
  const easedProgress = easeInOutCubic(progress);
  mutateViewState((draft) => {
    draft.viewAngle.x = lerpAngle(
      draft.transition3DStartAngles.x, 
      draft.transition3DEndAngles.x, 
      easedProgress
    );
    draft.viewAngle.y = lerpAngle(
      draft.transition3DStartAngles.y, 
      draft.transition3DEndAngles.y, 
      easedProgress
    );
    draft.viewAngle.z = lerpAngle(
      draft.transition3DStartAngles.z, 
      draft.transition3DEndAngles.z, 
      easedProgress
    );
  });
  
  if (progress < 1) {
    canvasManager.draw();
    requestAnimationFrame(() => animate3DTransition(canvasManager, uiManager, targetMode, transitionDuration));
  } else {
    mutateViewState((draft) => {
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
