import {
  OrthographicCamera,
  PerspectiveCamera,
} from "three";
import type { SceneManager } from "../SceneManager";
import {
  setViewportCameraRefs,
  resetViewportCameraRefs,
} from "@/features/viewport/runtime/cameraRefs";
import {
  subscribeFullViewportRenderSnapshot,
  getViewportRenderSnapshot,
} from "@/features/viewport/runtime/snapshot";

export class CameraController {
  private ortho: OrthographicCamera;
  private perspective: PerspectiveCamera;
  private unsubscribe: () => void;

  constructor(private sceneManager: SceneManager) {
    this.ortho = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.perspective = new PerspectiveCamera(45, 1, 0.1, 10000);

    setViewportCameraRefs({
      ortho: this.ortho,
      perspective: this.perspective,
    });

    this.unsubscribe = subscribeFullViewportRenderSnapshot(() => {
      this.applySnapshot();
    });

    // Initial apply
    this.applySnapshot();
  }

  private applySnapshot(): void {
    const snap = getViewportRenderSnapshot();

    this.ortho.left = snap.orthographic.left;
    this.ortho.right = snap.orthographic.right;
    this.ortho.top = snap.orthographic.top;
    this.ortho.bottom = snap.orthographic.bottom;
    this.ortho.position.set(
      snap.orthographic.position.x,
      snap.orthographic.position.y,
      snap.orthographic.position.z,
    );
    this.ortho.up.set(0, 1, 0);
    this.ortho.lookAt(snap.target.x, snap.target.y, snap.target.z);
    this.ortho.updateProjectionMatrix();
    this.ortho.updateMatrixWorld();

    this.perspective.fov = snap.perspective.fov;
    this.perspective.aspect = snap.perspective.aspect;
    this.perspective.near = snap.perspective.near;
    this.perspective.far = snap.perspective.far;
    this.perspective.position.set(
      snap.perspective.position.x,
      snap.perspective.position.y,
      snap.perspective.position.z,
    );
    this.perspective.up.set(
      snap.perspective.up.x,
      snap.perspective.up.y,
      snap.perspective.up.z,
    );
    this.perspective.lookAt(
      snap.target.x,
      snap.target.y,
      snap.target.z,
    );
    this.perspective.updateProjectionMatrix();
    this.perspective.updateMatrixWorld();

    this.sceneManager.setCamera(
      snap.mode === "2d" ? this.ortho : this.perspective,
    );
    this.sceneManager.invalidate();
  }

  getCameras() {
    return { ortho: this.ortho, perspective: this.perspective };
  }

  dispose(): void {
    this.unsubscribe();
    resetViewportCameraRefs();
  }
}
