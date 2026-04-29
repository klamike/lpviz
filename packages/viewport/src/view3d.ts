import { Euler, PerspectiveCamera, Vector3 } from "three";

import type { BoundingBox } from "@lpviz/math/geometry";
import type { PointXYZ } from "@lpviz/math/types";
import { DEFAULT_VIEW_ANGLE } from "./defaults";
import {
  buildPerspectivePoseFromViewAngle,
  getPerspectiveDistanceForUnitsPerPixel,
  getScaleFactorFromPerspectiveDistance,
  getViewportVisibleCenterCanvasPoint,
  projectCanvasPointToWorldPlane,
} from "./transition";
import type { ViewportPerspectivePose, ViewportRenderSnapshot } from "./types";

type ViewportRect = Pick<DOMRect, "width" | "height">;

type ViewportZBounds = {
  minZ: number;
  maxZ: number;
};

export type Viewport3DViewState = {
  viewAngle: PointXYZ;
  target: PointXYZ;
  distance: number;
  pose: ViewportPerspectivePose;
};

const DEFAULT_TARGET: PointXYZ = { x: 0, y: 0, z: 0 };
const ORTHO_MIN_SCALE_FACTOR = 0.05;
const MIN_PERSPECTIVE_DISTANCE = 10;
const EPS = 1e-6;

const snapshotCamera = new PerspectiveCamera();
const snapshotTarget = new Vector3();
const fitEuler = new Euler();
const fitForward = new Vector3();
const fitUp = new Vector3();
const fitRight = new Vector3();
const fitRelative = new Vector3();

const getViewportSize = (
  snapshot: ViewportRenderSnapshot,
  rect?: ViewportRect,
) => ({
  width: rect?.width || snapshot.width || 1,
  height: rect?.height || snapshot.height || 1,
});

const configurePerspectiveCameraFromSnapshot = (
  snapshot: ViewportRenderSnapshot,
) => {
  snapshotCamera.fov = snapshot.perspective.fov;
  snapshotCamera.aspect = snapshot.perspective.aspect;
  snapshotCamera.near = snapshot.perspective.near;
  snapshotCamera.far = snapshot.perspective.far;
  snapshotCamera.position.set(
    snapshot.perspective.position.x,
    snapshot.perspective.position.y,
    snapshot.perspective.position.z,
  );
  snapshotCamera.up.set(
    snapshot.perspective.up.x,
    snapshot.perspective.up.y,
    snapshot.perspective.up.z,
  );
  snapshotTarget.set(snapshot.target.x, snapshot.target.y, snapshot.target.z);
  snapshotCamera.lookAt(snapshotTarget);
  snapshotCamera.updateProjectionMatrix();
  snapshotCamera.updateMatrixWorld();
};

const configureFitBasisFromViewAngle = (viewAngle: PointXYZ) => {
  fitEuler.set(-viewAngle.x, -viewAngle.y, -viewAngle.z, "XYZ");
  fitForward.set(0, 0, 1).applyEuler(fitEuler).normalize();
  fitUp.set(0, 1, 0).applyEuler(fitEuler).normalize();
  fitRight.crossVectors(fitUp, fitForward).normalize();
};

const approxEqual = (a: number, b: number, tolerance = 1e-3) =>
  Math.abs(a - b) <= tolerance;

const clampPerspectiveDistance3D = (
  snapshot: ViewportRenderSnapshot,
  distance: number,
  rect?: ViewportRect,
) =>
  Math.min(
    getMaxPerspectiveDistance3D(snapshot, rect),
    Math.max(MIN_PERSPECTIVE_DISTANCE, distance),
  );

const getPerspectiveDistanceToFitBounds3D = (
  snapshot: ViewportRenderSnapshot,
  rect: ViewportRect,
  sidebarWidth: number,
  bounds: BoundingBox,
  padding = 50,
) => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) {
    return getDefaultPerspectiveDistance3D(snapshot, rect);
  }

  const viewport = getViewportSize(snapshot, rect);
  const availWidth = Math.max(100, viewport.width - sidebarWidth - 2 * padding);
  const availHeight = Math.max(100, viewport.height - 2 * padding);
  const verticalFov = snapshot.perspective.fov * (Math.PI / 180);
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * (availWidth / availHeight));
  const distanceX = width / (2 * Math.tan(horizontalFov / 2));
  const distanceY = height / (2 * Math.tan(verticalFov / 2));

  return Math.max(MIN_PERSPECTIVE_DISTANCE, distanceX, distanceY);
};

const getPerspectiveDistanceToFitBox3D = (
  snapshot: ViewportRenderSnapshot,
  rect: ViewportRect,
  sidebarWidth: number,
  bounds: BoundingBox & ViewportZBounds,
  target: PointXYZ,
  viewAngle: PointXYZ,
  padding = 50,
) => {
  const viewport = getViewportSize(snapshot, rect);
  const availWidth = Math.max(100, viewport.width - sidebarWidth - 2 * padding);
  const availHeight = Math.max(100, viewport.height - 2 * padding);
  const verticalFov = snapshot.perspective.fov * (Math.PI / 180);
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * (availWidth / availHeight));
  const tanHalfH = Math.tan(horizontalFov / 2);
  const tanHalfV = Math.tan(verticalFov / 2);

  configureFitBasisFromViewAngle(viewAngle);

  const xs = [bounds.minX, bounds.maxX];
  const ys = [bounds.minY, bounds.maxY];
  const zs = [bounds.minZ, bounds.maxZ];
  let requiredDistance = MIN_PERSPECTIVE_DISTANCE;

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        fitRelative.set(x - target.x, y - target.y, z - target.z);
        const forwardOffset = fitRelative.dot(fitForward);
        const horizontalOffset = Math.abs(fitRelative.dot(fitRight));
        const verticalOffset = Math.abs(fitRelative.dot(fitUp));
        requiredDistance = Math.max(
          requiredDistance,
          forwardOffset + horizontalOffset / Math.max(EPS, tanHalfH),
          forwardOffset + verticalOffset / Math.max(EPS, tanHalfV),
        );
      }
    }
  }

  return requiredDistance;
};

const offsetTargetForVisibleViewport3D = (
  snapshot: ViewportRenderSnapshot,
  rect: ViewportRect,
  target: PointXYZ,
  viewAngle: PointXYZ,
  distance: number,
  sidebarWidth: number,
): PointXYZ => {
  if (sidebarWidth <= 0) {
    return target;
  }

  const viewport = getViewportSize(snapshot, rect);
  const verticalFov = snapshot.perspective.fov * (Math.PI / 180);
  const unitsPerPixelAtTarget =
    (2 *
      Math.tan(verticalFov / 2) *
      Math.max(MIN_PERSPECTIVE_DISTANCE, distance)) /
    Math.max(1, viewport.height);
  const offset = (sidebarWidth / 2) * unitsPerPixelAtTarget;
  configureFitBasisFromViewAngle(viewAngle);

  return {
    x: target.x - fitRight.x * offset,
    y: target.y - fitRight.y * offset,
    z: target.z - fitRight.z * offset,
  };
};

export function getViewAngleFromSnapshot3D(
  snapshot: ViewportRenderSnapshot,
): PointXYZ {
  configurePerspectiveCameraFromSnapshot(snapshot);
  return {
    x: -snapshotCamera.rotation.x,
    y: -snapshotCamera.rotation.y,
    z: -snapshotCamera.rotation.z,
  };
}

export function getPerspectiveDistanceFromSnapshot3D(
  snapshot: ViewportRenderSnapshot,
) {
  return snapshotCamera.position
    .set(
      snapshot.perspective.position.x,
      snapshot.perspective.position.y,
      snapshot.perspective.position.z,
    )
    .distanceTo(
      snapshotTarget.set(
        snapshot.target.x,
        snapshot.target.y,
        snapshot.target.z,
      ),
    );
}

export function getDefaultPerspectiveDistance3D(
  snapshot: ViewportRenderSnapshot,
  rect?: ViewportRect,
) {
  return getPerspectiveDistanceForUnitsPerPixel(
    snapshot,
    1 / Math.max(EPS, snapshot.gridSpacing),
    getViewportSize(snapshot, rect).height,
  );
}

export function getMaxPerspectiveDistance3D(
  snapshot: ViewportRenderSnapshot,
  rect?: ViewportRect,
) {
  return getPerspectiveDistanceForUnitsPerPixel(
    snapshot,
    1 / Math.max(EPS, snapshot.gridSpacing * ORTHO_MIN_SCALE_FACTOR),
    getViewportSize(snapshot, rect).height,
  );
}

export function buildResetViewport3DView(
  snapshot: ViewportRenderSnapshot,
  sidebarWidth: number,
  rect: ViewportRect,
): Viewport3DViewState {
  const distance = clampPerspectiveDistance3D(
    snapshot,
    getDefaultPerspectiveDistance3D(snapshot, rect),
    rect,
  );
  const viewAngle = { ...DEFAULT_VIEW_ANGLE };
  const defaultPose = buildPerspectivePoseFromViewAngle(
    viewAngle,
    distance,
    DEFAULT_TARGET,
  );
  const defaultSnapshot = buildViewport3DSnapshot(snapshot, defaultPose, rect);
  const visibleCenter = projectCanvasPointToWorldPlane(
    defaultSnapshot,
    rect,
    getViewportVisibleCenterCanvasPoint(rect, sidebarWidth),
    0,
  );
  const desiredCenter = {
    x: -(sidebarWidth / 2) / Math.max(EPS, snapshot.gridSpacing),
    y: 0,
  };
  const target = visibleCenter
    ? {
        x: DEFAULT_TARGET.x + desiredCenter.x - visibleCenter.x,
        y: DEFAULT_TARGET.y + desiredCenter.y - visibleCenter.y,
        z: DEFAULT_TARGET.z,
      }
    : DEFAULT_TARGET;

  return {
    viewAngle,
    target,
    distance,
    pose: buildPerspectivePoseFromViewAngle(viewAngle, distance, target),
  };
}

export function fitViewport3DToBounds(
  snapshot: ViewportRenderSnapshot,
  rect: ViewportRect,
  sidebarWidth: number,
  bounds: BoundingBox,
  padding = 50,
  zBounds?: ViewportZBounds,
): Viewport3DViewState | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const viewAngle = getViewAngleFromSnapshot3D(snapshot);
  const fitTarget = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: 0,
  };
  const unclampedDistance = zBounds
    ? getPerspectiveDistanceToFitBox3D(
        snapshot,
        rect,
        sidebarWidth,
        {
          ...bounds,
          minZ: zBounds.minZ,
          maxZ: zBounds.maxZ,
        },
        fitTarget,
        viewAngle,
        padding,
      )
    : getPerspectiveDistanceToFitBounds3D(
        snapshot,
        rect,
        sidebarWidth,
        bounds,
        padding,
      );
  const distance = clampPerspectiveDistance3D(
    snapshot,
    unclampedDistance,
    rect,
  );
  const target = offsetTargetForVisibleViewport3D(
    snapshot,
    rect,
    fitTarget,
    viewAngle,
    distance,
    sidebarWidth,
  );

  return {
    viewAngle,
    target,
    distance,
    pose: buildPerspectivePoseFromViewAngle(viewAngle, distance, target),
  };
}

export function buildViewport3DSnapshot(
  snapshot: ViewportRenderSnapshot,
  pose: ViewportPerspectivePose,
  rect?: ViewportRect,
): ViewportRenderSnapshot {
  const { width, height } = getViewportSize(snapshot, rect);
  const distance = Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  );
  const safeDistance =
    Number.isFinite(distance) && distance > 0
      ? distance
      : getPerspectiveDistanceFromSnapshot3D(snapshot);
  const scaleFactor = getScaleFactorFromPerspectiveDistance(
    snapshot,
    safeDistance,
    height,
  );
  const unitsPerPixel = 1 / Math.max(EPS, snapshot.gridSpacing * scaleFactor);

  return {
    ...snapshot,
    mode: "3d",
    width,
    height,
    scaleFactor,
    unitsPerPixel,
    transitionZMultiplier: 1,
    target: { ...pose.target },
    orthographic: {
      left: -(width * unitsPerPixel) / 2,
      right: (width * unitsPerPixel) / 2,
      top: (height * unitsPerPixel) / 2,
      bottom: -(height * unitsPerPixel) / 2,
      position: {
        x: pose.target.x,
        y: pose.target.y,
        z: 10,
      },
    },
    perspective: {
      ...snapshot.perspective,
      position: { ...pose.position },
      up: { ...pose.up },
      aspect: width / Math.max(1, height),
    },
  };
}

export function isDefault3DView(snapshot: ViewportRenderSnapshot) {
  if (snapshot.mode !== "3d") {
    return false;
  }

  const viewAngle = getViewAngleFromSnapshot3D(snapshot);
  return (
    approxEqual(snapshot.scaleFactor, 1) &&
    approxEqual(snapshot.target.x, 0) &&
    approxEqual(snapshot.target.y, 0) &&
    approxEqual(snapshot.target.z, 0) &&
    approxEqual(viewAngle.x, DEFAULT_VIEW_ANGLE.x, 1e-2) &&
    approxEqual(viewAngle.y, DEFAULT_VIEW_ANGLE.y, 1e-2) &&
    approxEqual(viewAngle.z, DEFAULT_VIEW_ANGLE.z, 1e-2)
  );
}
