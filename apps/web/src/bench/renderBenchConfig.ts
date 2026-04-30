export type RenderBenchConfig = {
  /** Pre-34189c5: render every layer object through one Three.js scene. */
  singleScene?: boolean;
  /** Pre-822e411: keep one Line2 per trace and call setPositions on all of them. */
  legacyTraceLinePool?: boolean;
  /** Pre-6e22a89/f227be2: allow Three.js to recompute bounds for hot geometries. */
  legacyBounds?: boolean;
  /** Pre-2995c65/34189c5: update every layer on camera-only frames. */
  forceAllDirty?: boolean;
};

declare global {
  interface Window {
    __LPVIZ_RENDER_BENCH_CONFIG__?: RenderBenchConfig;
  }
}

export function getRenderBenchConfig(): RenderBenchConfig {
  if (typeof window === "undefined") {
    return {};
  }
  return window.__LPVIZ_RENDER_BENCH_CONFIG__ ?? {};
}

export function isRenderBenchForceAllDirty(): boolean {
  return getRenderBenchConfig().forceAllDirty === true;
}

export function isRenderBenchLegacyBounds(): boolean {
  return getRenderBenchConfig().legacyBounds === true;
}
