import { Euler, Matrix4, Vector3 } from "three";
import type { PointXY, PointXYZ } from "../../solvers/utils/blas";
import { getState, mutate, setState } from "../../state/store";
import { ViewportManager } from "../viewport";
import { LayoutManager } from "../layout";

const rotationEuler = new Euler();
const inverseVector = new Vector3();
const inverseRotationMatrix = new Matrix4();

export function inverseTransform2DProjection(projectedPoint2d: PointXY, viewAngles: PointXYZ): PointXY {
  rotationEuler.set(viewAngles.x, viewAngles.y, viewAngles.z, "XYZ");
  inverseRotationMatrix.makeRotationFromEuler(rotationEuler).invert();
  inverseVector.set(projectedPoint2d.x, projectedPoint2d.y, 0).applyMatrix4(inverseRotationMatrix);
  return { x: inverseVector.x, y: inverseVector.y };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function start3DTransition(canvasManager: ViewportManager, uiManager: LayoutManager, targetMode: boolean) {
  const { isTransitioning3D, viewAngle } = getState();
  if (isTransitioning3D) return;

  const transitionDuration = targetMode ? 400 : 500;
  const startAngles = targetMode ? { x: 0, y: 0, z: 0 } : { ...viewAngle };
  const endAngles = targetMode ? { x: -1.15, y: 0.4, z: 0 } : { x: 0, y: 0, z: 0 };

  canvasManager.prepareFor3DTransition(targetMode);

  setState({
    isTransitioning3D: true,
    transitionStartTime: performance.now(),
    transition3DStartAngles: startAngles,
    transition3DEndAngles: endAngles,
    transitionDirection: targetMode ? "to3d" : "to2d",
    transitionProgress: 0,
    is3DMode: targetMode,
  });

  uiManager.update3DButtonState();
  animate3DTransition(canvasManager, uiManager, targetMode, transitionDuration);
}

function animate3DTransition(canvasManager: ViewportManager, uiManager: LayoutManager, targetMode: boolean, transitionDuration: number) {
  const currentTime = performance.now();
  const snapshot = getState();
  const elapsed = currentTime - snapshot.transitionStartTime;
  const progress = Math.min(elapsed / transitionDuration, 1);

  const easedProgress = easeInOutCubic(progress);
  mutate((draft) => {
    draft.viewAngle.x = lerpAngle(draft.transition3DStartAngles.x, draft.transition3DEndAngles.x, easedProgress);
    draft.viewAngle.y = lerpAngle(draft.transition3DStartAngles.y, draft.transition3DEndAngles.y, easedProgress);
    draft.viewAngle.z = lerpAngle(draft.transition3DStartAngles.z, draft.transition3DEndAngles.z, easedProgress);
    draft.transitionProgress = easedProgress;
  });

  if (progress < 1) {
    canvasManager.draw();
    requestAnimationFrame(() => animate3DTransition(canvasManager, uiManager, targetMode, transitionDuration));
  } else {
    mutate((draft) => {
      draft.isTransitioning3D = false;
      draft.transitionDirection = null;
      draft.transitionProgress = 0;
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

    canvasManager.complete3DTransition(targetMode);
    canvasManager.draw();
  }
}
