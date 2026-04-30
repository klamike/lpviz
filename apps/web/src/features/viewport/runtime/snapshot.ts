import {
  DEFAULT_VIEWPORT_RENDER_SNAPSHOT,
  type ViewportRenderSnapshot,
} from "../types";

let snapshot = DEFAULT_VIEWPORT_RENDER_SNAPSHOT;

// Full listeners — fire on every snapshot update (camera position included).
const fullListeners = new Set<() => void>();
// Stable listeners — fire only when fields that scene layers actually use change.
// During 3D orbit, perspective.position and perspective.up change every frame but
// nothing else does, so stable listeners are silent during orbit.
const stableListeners = new Set<() => void>();

function hasStableChange(
  prev: ViewportRenderSnapshot,
  next: ViewportRenderSnapshot,
): boolean {
  const isPure3DCameraMove =
    prev.mode === "3d" &&
    next.mode === "3d" &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.scaleFactor === next.scaleFactor &&
    prev.unitsPerPixel === next.unitsPerPixel &&
    prev.gridSpacing === next.gridSpacing &&
    prev.orthographic.left === next.orthographic.left &&
    prev.orthographic.right === next.orthographic.right &&
    prev.orthographic.top === next.orthographic.top &&
    prev.orthographic.bottom === next.orthographic.bottom &&
    prev.perspective.fov === next.perspective.fov &&
    prev.perspective.aspect === next.perspective.aspect &&
    prev.perspective.near === next.perspective.near &&
    prev.perspective.far === next.perspective.far;

  if (isPure3DCameraMove) {
    return false;
  }

  return (
    prev.mode !== next.mode ||
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.scaleFactor !== next.scaleFactor ||
    prev.unitsPerPixel !== next.unitsPerPixel ||
    prev.gridSpacing !== next.gridSpacing ||
    prev.orthographic.left !== next.orthographic.left ||
    prev.orthographic.right !== next.orthographic.right ||
    prev.orthographic.top !== next.orthographic.top ||
    prev.orthographic.bottom !== next.orthographic.bottom ||
    prev.perspective.fov !== next.perspective.fov ||
    prev.perspective.aspect !== next.perspective.aspect ||
    prev.perspective.near !== next.perspective.near ||
    prev.perspective.far !== next.perspective.far
  );
}

export function setViewportRenderSnapshot(
  next: ViewportRenderSnapshot,
): boolean {
  const prev = snapshot;
  const stableChanged = hasStableChange(prev, next);
  snapshot = next;
  fullListeners.forEach((l) => l());
  if (stableChanged) {
    stableListeners.forEach((l) => l());
  }
  return stableChanged;
}

export function resetViewportRenderSnapshot() {
  snapshot = DEFAULT_VIEWPORT_RENDER_SNAPSHOT;
  fullListeners.forEach((l) => l());
  stableListeners.forEach((l) => l());
}

export function subscribeFullViewportRenderSnapshot(listener: () => void) {
  fullListeners.add(listener);
  return () => fullListeners.delete(listener);
}

export function getViewportRenderSnapshot() {
  return snapshot;
}

// Used by most scene layers. Only re-renders when layout-relevant fields change
// (mode, zoom, target, bounds). Silent during pure 3D orbit, preventing ~13
// components from reconciling at 60 fps for no visual reason.

// Used only by CameraRig, which must update the Three.js camera on every orbit
// frame to keep perspective.position/up in sync.
