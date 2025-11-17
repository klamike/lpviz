import { LayoutManager } from "./layout";
import { ViewportManager } from "./viewport";
import { refreshResponsiveLayout } from "./utils";

export function initializeResizeManager(canvasManager: ViewportManager, uiManager: LayoutManager) {
  const resizeCanvas = () => {
    uiManager.checkMobileOrientation();
    canvasManager.updateDimensions();
    canvasManager.draw();
    uiManager.updateZoomButtonsState(canvasManager);
    refreshResponsiveLayout({ includeTerminal: true });
  };

  let resizeTimeout: number | null = null;

  const throttledResize = () => {
    refreshResponsiveLayout({ includeTerminal: true });

    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
      resizeCanvas();
      resizeTimeout = null;
    }, 16);
  };

  window.addEventListener("resize", throttledResize);

  return { resizeCanvas, teardown: () => window.removeEventListener("resize", throttledResize) };
}
