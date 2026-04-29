import { MOUSE, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SceneManager } from "../SceneManager";
import {
  getViewport2DControlsConfig,
  startViewport2DPan,
  stopViewport2DPan,
  updateViewport2DPan,
  zoomViewport2DAtCanvasPoint,
} from "@/features/viewport/runtime/controls2d";
import {
  type ViewportPerspectivePose,
  subscribeViewport3DControlsConfig,
  getViewport3DControlsConfig,
} from "@/features/viewport/runtime/controls3d";
import {
  subscribeViewportCameraRefs,
  getViewportCameraRefs,
} from "@/features/viewport/runtime/cameraRefs";

const WHEEL_ZOOM_FACTOR = 1.05;

export class ControlsController {
  private controls: OrbitControls | null = null;
  private syncToken = -1;
  private applyingSnapshot = false;
  private controlsConfig = getViewport3DControlsConfig();
  private perspectiveCamera = getViewportCameraRefs().perspective;
  private unsubscribeConfig: () => void;
  private unsubscribeCameras: () => void;
  private cleanup2D: (() => void) | null = null;
  private cleanup3D: (() => void) | null = null;

  constructor(private sceneManager: SceneManager) {
    const canvas = sceneManager.renderer.domElement;
    this.setup2DListeners(canvas);

    this.unsubscribeConfig = subscribeViewport3DControlsConfig(() => {
      this.controlsConfig = getViewport3DControlsConfig();
      this.applyControlsConfig();
    });

    this.unsubscribeCameras = subscribeViewportCameraRefs(() => {
      const next = getViewportCameraRefs().perspective;
      if (next !== this.perspectiveCamera) {
        this.perspectiveCamera = next;
        this.dispose3DControls();
        if (next) {
          this.setup3DControls(next, canvas);
        }
      }
    });

    if (this.perspectiveCamera) {
      this.setup3DControls(this.perspectiveCamera, canvas);
    }

    this.applyControlsConfig();
  }

  private setup2DListeners(canvas: HTMLCanvasElement): void {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!startViewport2DPan(event.clientX, event.clientY, canvas.getBoundingClientRect())) {
        return;
      }
      canvas.focus();
      event.preventDefault();
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!updateViewport2DPan(event.clientX, event.clientY)) return;
      event.preventDefault();
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || !stopViewport2DPan()) return;
      event.preventDefault();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch || !startViewport2DPan(touch.clientX, touch.clientY, canvas.getBoundingClientRect())) {
        return;
      }
      canvas.focus();
      event.preventDefault();
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch || !updateViewport2DPan(touch.clientX, touch.clientY)) return;
      event.preventDefault();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!stopViewport2DPan()) return;
      event.preventDefault();
    };
    const handleTouchCancel = (event: TouchEvent) => {
      if (!stopViewport2DPan()) return;
      event.preventDefault();
    };
    const handleWheel = (event: WheelEvent) => {
      const dominantDelta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (dominantDelta === 0) return;

      const rect = canvas.getBoundingClientRect();
      const { state } = getViewport2DControlsConfig();
      if (
        !zoomViewport2DAtCanvasPoint(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          rect,
          state.scaleFactor * (dominantDelta < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR),
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: false });
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    this.cleanup2D = () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }

  private setup3DControls(perspectiveCamera: import("three").PerspectiveCamera, canvas: HTMLCanvasElement): void {
    const controls = new OrbitControls(perspectiveCamera, canvas);
    controls.enabled = false;
    controls.enableDamping = false;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT = MOUSE.PAN;
    controls.mouseButtons.RIGHT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    this.controls = controls;

    const buildPose = (): ViewportPerspectivePose => ({
      position: {
        x: perspectiveCamera.position.x,
        y: perspectiveCamera.position.y,
        z: perspectiveCamera.position.z,
      },
      up: {
        x: perspectiveCamera.up.x,
        y: perspectiveCamera.up.y,
        z: perspectiveCamera.up.z,
      },
      target: {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      },
    });

    const handleStart = () => {
      if (!controls.enabled || this.applyingSnapshot) return;
      this.controlsConfig.onStart?.();
    };
    const handleChange = () => {
      if (!controls.enabled || this.applyingSnapshot) return;
      this.controlsConfig.onChange?.(buildPose());
      this.sceneManager.invalidate({ layers: false });
    };
    const handleEnd = () => {
      if (!controls.enabled || this.applyingSnapshot) return;
      this.controlsConfig.onEnd?.();
    };

    controls.addEventListener("start", handleStart);
    controls.addEventListener("change", handleChange);
    controls.addEventListener("end", handleEnd);

    this.cleanup3D = () => {
      controls.removeEventListener("start", handleStart);
      controls.removeEventListener("change", handleChange);
      controls.removeEventListener("end", handleEnd);
      controls.dispose();
      if (this.controls === controls) {
        this.controls = null;
      }
    };
  }

  private dispose3DControls(): void {
    this.cleanup3D?.();
    this.cleanup3D = null;
  }

  private applyControlsConfig(): void {
    const controls = this.controls;
    const perspectiveCamera = this.perspectiveCamera;
    if (!controls || !perspectiveCamera) return;

    controls.enabled = this.controlsConfig.enabled && !this.controlsConfig.blocked;
    controls.maxDistance = this.controlsConfig.maxDistance;

    if (this.syncToken === this.controlsConfig.syncToken) {
      const target = new Vector3(controls.target.x, controls.target.y, controls.target.z);
      const distance = perspectiveCamera.position.distanceTo(target);
      if (!Number.isFinite(distance) || distance > controls.maxDistance) {
        controls.maxDistance = this.controlsConfig.maxDistance;
      }
      return;
    }

    this.syncToken = this.controlsConfig.syncToken;
    this.applyingSnapshot = true;

    const snapshot = this.controlsConfig.snapshot;
    perspectiveCamera.fov = snapshot.perspective.fov;
    perspectiveCamera.aspect = snapshot.perspective.aspect;
    perspectiveCamera.near = snapshot.perspective.near;
    perspectiveCamera.far = snapshot.perspective.far;
    perspectiveCamera.position.set(
      snapshot.perspective.position.x,
      snapshot.perspective.position.y,
      snapshot.perspective.position.z,
    );
    perspectiveCamera.up.set(
      snapshot.perspective.up.x,
      snapshot.perspective.up.y,
      snapshot.perspective.up.z,
    );
    controls.target.set(snapshot.target.x, snapshot.target.y, snapshot.target.z);
    perspectiveCamera.lookAt(snapshot.target.x, snapshot.target.y, snapshot.target.z);
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld();
    controls.update();

    this.applyingSnapshot = false;
    this.sceneManager.invalidate({ layers: false });
  }

  dispose(): void {
    this.unsubscribeConfig();
    this.unsubscribeCameras();
    this.cleanup2D?.();
    this.dispose3DControls();
  }
}
