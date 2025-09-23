import JSONCrush from "jsoncrush";
import { CanvasManager } from "../ui/canvasManager";
import { setupEventHandlers } from "../ui/eventHandlers";
import { GuidedTour, HelpPopup } from "../ui/guidedTour";
import { UIManager } from "../ui/uiManager";
import {
  adjustFontSize,
  adjustLogoFontSize,
  adjustTerminalHeight,
} from "../utils/uiHelpers";

export function initializeLegacyApplication() {
  const legacyMarker = "__lpvizLegacyInitialized";
  const globalAny = window as typeof window & Record<string, boolean>;
  if (globalAny[legacyMarker]) return;
  globalAny[legacyMarker] = true;

  const canvas = document.getElementById("gridCanvas") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Missing #gridCanvas element needed for legacy UI bootstrap.");
  }
  const canvasManager = new CanvasManager(canvas);
  const uiManager = new UIManager();

  function resizeCanvas() {
    uiManager.checkMobileOrientation();
    canvasManager.updateDimensions();
    canvasManager.draw();
    uiManager.updateZoomButtonsState(canvasManager);
    adjustLogoFontSize();
    adjustTerminalHeight();
  }

  let resizeTimeout: number | null = null;
  function throttledResize() {
    adjustFontSize();
    adjustLogoFontSize();
    adjustTerminalHeight();

    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = window.setTimeout(() => {
      resizeCanvas();
      resizeTimeout = null;
    }, 16);
  }

  window.addEventListener("resize", throttledResize);

  const guidedTour = new GuidedTour(
    canvasManager,
    uiManager,
    () => {},
    () => {},
  );
  const helpPopup = new HelpPopup(guidedTour);

  const handlers = setupEventHandlers(canvasManager, uiManager, helpPopup);

  guidedTour.setSendPolytope(handlers.sendPolytope);
  guidedTour.setSaveToHistory(handlers.saveToHistory);
  canvasManager.setTourComponents(guidedTour);
  uiManager.synchronizeUIWithState();
  resizeCanvas();

  helpPopup.startTimer();
  const params = new URLSearchParams(window.location.search);
  if (params.has("s")) {
    try {
      const crushed = decodeURIComponent(params.get("s") || "");
      const jsonString = JSONCrush.uncrush(crushed);
      const data = JSON.parse(jsonString);
      handlers.loadStateFromObject(data);
      history.replaceState(null, "", window.location.pathname);
      helpPopup.resetTimer();
      uiManager.synchronizeUIWithState();
    } catch (err) {
      console.error("Failed to load shared state", err);
    }
  }
  uiManager.synchronizeUIWithState();
  canvas.focus();
}
