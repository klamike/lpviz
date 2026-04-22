export type R3FViewportBridge = {
  getCanvasElement: () => HTMLCanvasElement;
  getCanvasRect: () => DOMRect;
  invalidate: () => void;
};

export type ViewportRenderSnapshot = {
  mode: "2d" | "3d";
  width: number;
  height: number;
  gridSpacing: number;
  scaleFactor: number;
  unitsPerPixel: number;
  target: {
    x: number;
    y: number;
    z: number;
  };
  orthographic: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    position: {
      x: number;
      y: number;
      z: number;
    };
  };
  perspective: {
    position: {
      x: number;
      y: number;
      z: number;
    };
    up: {
      x: number;
      y: number;
      z: number;
    };
    fov: number;
    near: number;
    far: number;
    aspect: number;
  };
};

export type ViewportPerspectivePose = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  up: {
    x: number;
    y: number;
    z: number;
  };
  target: {
    x: number;
    y: number;
    z: number;
  };
};

export const DEFAULT_VIEWPORT_RENDER_SNAPSHOT: ViewportRenderSnapshot = {
  mode: "2d",
  width: window.innerWidth,
  height: window.innerHeight,
  gridSpacing: 20,
  scaleFactor: 1,
  unitsPerPixel: 1 / 20,
  target: { x: 0, y: 0, z: 0 },
  orthographic: {
    left: -window.innerWidth / 40,
    right: window.innerWidth / 40,
    top: window.innerHeight / 40,
    bottom: -window.innerHeight / 40,
    position: { x: 0, y: 0, z: 10 },
  },
  perspective: {
    position: { x: 0, y: 0, z: 100 },
    up: { x: 0, y: 1, z: 0 },
    fov: 45,
    near: 0.1,
    far: 10000,
    aspect: window.innerWidth / Math.max(1, window.innerHeight),
  },
};
