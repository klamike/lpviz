import { useEffect, useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { MOUSE, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  getViewport2DControlsConfig,
  startViewport2DPan,
  stopViewport2DPan,
  updateViewport2DPan,
  zoomViewport2DAtCanvasPoint,
} from "@/viewport/r3f/viewport2DControlsStore";
import { useViewportCameraRefs } from "@/viewport/r3f/viewportCameraStore";
import {
  type ViewportPerspectivePose,
  useViewport3DControlsConfig,
} from "@/viewport/r3f/viewport3DControlsStore";

const WHEEL_ZOOM_FACTOR = 1.05;

export function ControlsRig() {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const cameraRefs = useViewportCameraRefs();
  const controlsConfig = useViewport3DControlsConfig();
  const controlsRef = useRef<OrbitControls | null>(null);
  const syncTokenRef = useRef<number>(-1);
  const applyingSnapshotRef = useRef(false);
  const controlsConfigRef = useRef(controlsConfig);

  useEffect(() => {
    controlsConfigRef.current = controlsConfig;
  }, [controlsConfig]);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      if (
        !startViewport2DPan(
          event.clientX,
          event.clientY,
          canvas.getBoundingClientRect(),
        )
      ) {
        return;
      }
      canvas.focus();
      event.preventDefault();
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!updateViewport2DPan(event.clientX, event.clientY)) {
        return;
      }
      event.preventDefault();
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || !stopViewport2DPan()) {
        return;
      }
      event.preventDefault();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      if (
        !touch ||
        !startViewport2DPan(
          touch.clientX,
          touch.clientY,
          canvas.getBoundingClientRect(),
        )
      ) {
        return;
      }
      canvas.focus();
      event.preventDefault();
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      if (!touch || !updateViewport2DPan(touch.clientX, touch.clientY)) {
        return;
      }
      event.preventDefault();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!stopViewport2DPan()) {
        return;
      }
      event.preventDefault();
    };
    const handleTouchCancel = (event: TouchEvent) => {
      if (!stopViewport2DPan()) {
        return;
      }
      event.preventDefault();
    };
    const handleWheel = (event: WheelEvent) => {
      const dominantDelta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      if (dominantDelta === 0) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const { state } = getViewport2DControlsConfig();
      if (
        !zoomViewport2DAtCanvasPoint(
          {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          },
          rect,
          state.scaleFactor *
            (dominantDelta < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR),
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
    window.addEventListener("touchcancel", handleTouchCancel, {
      passive: false,
    });
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [gl]);

  useEffect(() => {
    const perspectiveCamera = cameraRefs.perspective;
    if (!perspectiveCamera) {
      return;
    }

    const controls = new OrbitControls(perspectiveCamera, gl.domElement);
    controls.enabled = false;
    controls.enableDamping = false;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT = MOUSE.PAN;
    controls.mouseButtons.RIGHT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controlsRef.current = controls;

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
      if (!controls.enabled || applyingSnapshotRef.current) {
        return;
      }
      controlsConfigRef.current.onStart?.();
    };
    const handleChange = () => {
      if (!controls.enabled || applyingSnapshotRef.current) {
        return;
      }
      controlsConfigRef.current.onChange?.(buildPose());
      invalidate();
    };
    const handleEnd = () => {
      if (!controls.enabled || applyingSnapshotRef.current) {
        return;
      }
      controlsConfigRef.current.onEnd?.();
    };

    controls.addEventListener("start", handleStart);
    controls.addEventListener("change", handleChange);
    controls.addEventListener("end", handleEnd);

    return () => {
      controls.removeEventListener("start", handleStart);
      controls.removeEventListener("change", handleChange);
      controls.removeEventListener("end", handleEnd);
      controls.dispose();
      if (controlsRef.current === controls) {
        controlsRef.current = null;
      }
    };
  }, [cameraRefs.perspective, gl, invalidate]);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const perspectiveCamera = cameraRefs.perspective;
    if (!controls || !perspectiveCamera) {
      return;
    }

    controls.enabled = controlsConfig.enabled && !controlsConfig.blocked;
    controls.maxDistance = controlsConfig.maxDistance;

    if (syncTokenRef.current === controlsConfig.syncToken) {
      return;
    }

    syncTokenRef.current = controlsConfig.syncToken;
    applyingSnapshotRef.current = true;

    const snapshot = controlsConfig.snapshot;
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
    controls.target.set(
      snapshot.target.x,
      snapshot.target.y,
      snapshot.target.z,
    );
    perspectiveCamera.lookAt(
      snapshot.target.x,
      snapshot.target.y,
      snapshot.target.z,
    );
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld();
    controls.update();

    applyingSnapshotRef.current = false;
    invalidate();
  }, [cameraRefs.perspective, controlsConfig, invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    const perspectiveCamera = cameraRefs.perspective;
    if (!controls || !perspectiveCamera) {
      return;
    }

    const target = new Vector3(
      controls.target.x,
      controls.target.y,
      controls.target.z,
    );
    const distance = perspectiveCamera.position.distanceTo(target);
    if (!Number.isFinite(distance) || distance > controls.maxDistance) {
      controls.maxDistance = controlsConfig.maxDistance;
    }
  }, [cameraRefs.perspective, controlsConfig.maxDistance]);

  return null;
}
