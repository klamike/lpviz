import JSONCrush from "jsoncrush";
import { CanvasManager } from "../ui/canvasManager";
import { setupEventHandlers } from "../ui/eventHandlers";
import { GuidedTour, HelpPopup } from "../ui/guidedTour";
import {
  setScreenTooSmall,
  synchronizeUIState,
  updateZoomButtonStates,
} from "../state/uiActions";
import {
  adjustFontSize,
  adjustLogoFontSize,
  adjustTerminalHeight,
} from "../utils/uiHelpers";

export const MIN_SCREEN_WIDTH = 750;

export interface LegacyHandles {
  canvasManager: CanvasManager;
  guidedTour: GuidedTour;
  helpPopup: HelpPopup;
  loadStateFromObject: (data: any) => void;
  generateShareLink: () => string;
  sendPolytope: () => void;
  saveToHistory: () => void;
}

let cachedHandles: LegacyHandles | null = null;

export function initializeLegacyApplication(): LegacyHandles {
  const legacyMarker = "__lpvizLegacyInitialized";
  const globalAny = window as typeof window & Record<string, boolean>;
  if (globalAny[legacyMarker]) {
    if (!cachedHandles) {
      throw new Error("Legacy application initialized without cached handles");
    }
    return cachedHandles;
  }
  globalAny[legacyMarker] = true;

  const canvas = document.getElementById("gridCanvas") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Missing #gridCanvas element needed for legacy UI bootstrap.");
  }
  const canvasManager = new CanvasManager(canvas);

  function resizeCanvas() {
    setScreenTooSmall(window.innerWidth < MIN_SCREEN_WIDTH, window.innerWidth);
    canvasManager.updateDimensions();
    canvasManager.draw();
    updateZoomButtonStates(canvasManager);
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

  const guidedTour = new GuidedTour(canvasManager, () => {}, () => {});
  const helpPopup = new HelpPopup(guidedTour);

  const handlers = setupEventHandlers(canvasManager, helpPopup);

  guidedTour.setSendPolytope(handlers.sendPolytope);
  guidedTour.setSaveToHistory(handlers.saveToHistory);
  canvasManager.setTourComponents(guidedTour);
  synchronizeUIState(canvasManager);
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
      synchronizeUIState(canvasManager);
    } catch (err) {
      console.error("Failed to load shared state", err);
    }
  }
  synchronizeUIState(canvasManager);
  canvas.focus();

  cachedHandles = {
    canvasManager,
    guidedTour,
    helpPopup,
    loadStateFromObject: handlers.loadStateFromObject,
    generateShareLink: handlers.generateShareLink,
    sendPolytope: handlers.sendPolytope,
    saveToHistory: handlers.saveToHistory,
  };

  return cachedHandles;
}
