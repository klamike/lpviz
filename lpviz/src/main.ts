import { CanvasViewportManager } from "./ui/viewport";
import { InterfaceLayoutManager } from "./ui/layout";
import { initializeApplicationInteractions } from "./ui/interactions/registry";
import { adjustLogoFontSize, adjustFontSize, adjustTerminalHeight } from "./ui/utils";
import { GuidedExperience, InactivityHelpOverlay, NonconvexHullHintOverlay } from "./ui/tour/tour";
import JSONCrush from "jsoncrush";

async function initializeApplication() {
  const canvas = document.getElementById("gridCanvas") as HTMLCanvasElement;
  const canvasManager = await CanvasViewportManager.create(canvas);
  const uiManager = new InterfaceLayoutManager();

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

    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
      resizeCanvas();
      resizeTimeout = null;
    }, 16);
  }

  window.addEventListener("resize", throttledResize);

  const guidedTour = new GuidedExperience(canvasManager, uiManager, () => {}, () => {});
  const helpPopup = new InactivityHelpOverlay(guidedTour);
  new NonconvexHullHintOverlay(guidedTour);

  const handlers = initializeApplicationInteractions(canvasManager, uiManager, helpPopup);

  guidedTour.setSendPolytope(handlers.sendPolytope);
  guidedTour.setSaveToHistory(handlers.saveToHistory);
  canvasManager.attachGuidedExperience(guidedTour);
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

  if (params.has("demo")) {
    guidedTour.startGuidedTour();
  }
  uiManager.synchronizeUIWithState();
  canvas.focus();
}

function bootstrapApplication() {
  initializeApplication().catch((err) => {
    console.error("Failed to initialize lpviz", err);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApplication);
} else {
  bootstrapApplication();
}
