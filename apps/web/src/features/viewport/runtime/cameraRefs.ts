import type { OrthographicCamera, PerspectiveCamera } from "three";

type ViewportCameraRefs = {
  ortho: OrthographicCamera | null;
  perspective: PerspectiveCamera | null;
};

let cameraRefs: ViewportCameraRefs = {
  ortho: null,
  perspective: null,
};
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

export function setViewportCameraRefs(nextCameraRefs: ViewportCameraRefs) {
  cameraRefs = nextCameraRefs;
  emit();
}

export function resetViewportCameraRefs() {
  cameraRefs = {
    ortho: null,
    perspective: null,
  };
  emit();
}

export function subscribeViewportCameraRefs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getViewportCameraRefs() {
  return cameraRefs;
}
