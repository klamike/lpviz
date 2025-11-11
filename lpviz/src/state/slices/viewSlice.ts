import type { PointXYZ } from "../../types/arrays";

const DEFAULT_VIEW_ANGLE: PointXYZ = { x: -1.15, y: 0.4, z: 0 };
const DEFAULT_TRANSITION_DURATION = 500;
const DEFAULT_FOCAL_DISTANCE = 1000;
const DEFAULT_Z_SCALE = 0.1;

export interface ViewSlice {
  is3DMode: boolean;
  viewAngle: PointXYZ;
  focalDistance: number;
  isRotatingCamera: boolean;
  lastRotationMouse: { x: number; y: number };
  zScale: number;
  isTransitioning3D: boolean;
  transitionStartTime: number;
  transitionDuration: number;
  transition3DStartAngles: PointXYZ;
  transition3DEndAngles: PointXYZ;
}

export const createViewSlice = (): ViewSlice => ({
  is3DMode: false,
  viewAngle: { ...DEFAULT_VIEW_ANGLE },
  focalDistance: DEFAULT_FOCAL_DISTANCE,
  isRotatingCamera: false,
  lastRotationMouse: { x: 0, y: 0 },
  zScale: DEFAULT_Z_SCALE,
  isTransitioning3D: false,
  transitionStartTime: 0,
  transitionDuration: DEFAULT_TRANSITION_DURATION,
  transition3DStartAngles: { x: 0, y: 0, z: 0 },
  transition3DEndAngles: { ...DEFAULT_VIEW_ANGLE },
});
