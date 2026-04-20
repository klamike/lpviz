import { useEffect, useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { OrthographicCamera, PerspectiveCamera } from "three";

import {
  resetViewportCameraRefs,
  setViewportCameraRefs,
} from "@/viewport/r3f/viewportCameraStore";
import { useViewportRenderSnapshot } from "@/viewport/r3f/viewportRenderStore";

export function CameraRig() {
  const orthoRef = useRef<OrthographicCamera>(null);
  const perspectiveRef = useRef<PerspectiveCamera>(null);
  const snapshot = useViewportRenderSnapshot();
  const set = useThree((state) => state.set);

  useEffect(() => {
    const orthoCamera = orthoRef.current;
    const perspectiveCamera = perspectiveRef.current;
    if (!orthoCamera || !perspectiveCamera) {
      return;
    }

    setViewportCameraRefs({
      ortho: orthoCamera,
      perspective: perspectiveCamera,
    });

    return () => {
      resetViewportCameraRefs();
    };
  }, []);

  useLayoutEffect(() => {
    const orthoCamera = orthoRef.current;
    const perspectiveCamera = perspectiveRef.current;
    if (!orthoCamera || !perspectiveCamera) {
      return;
    }

    orthoCamera.left = snapshot.orthographic.left;
    orthoCamera.right = snapshot.orthographic.right;
    orthoCamera.top = snapshot.orthographic.top;
    orthoCamera.bottom = snapshot.orthographic.bottom;
    orthoCamera.position.set(
      snapshot.orthographic.position.x,
      snapshot.orthographic.position.y,
      snapshot.orthographic.position.z,
    );
    orthoCamera.up.set(0, 1, 0);
    orthoCamera.lookAt(snapshot.target.x, snapshot.target.y, snapshot.target.z);
    orthoCamera.updateProjectionMatrix();
    orthoCamera.updateMatrixWorld();

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
    perspectiveCamera.lookAt(
      snapshot.target.x,
      snapshot.target.y,
      snapshot.target.z,
    );
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.updateMatrixWorld();

    set({ camera: snapshot.mode === "2d" ? orthoCamera : perspectiveCamera });
  }, [set, snapshot]);

  return (
    <>
      <orthographicCamera ref={orthoRef} near={-1000} far={1000} />
      <perspectiveCamera ref={perspectiveRef} near={0.1} far={10000} />
    </>
  );
}
