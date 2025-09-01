import { CanvasManager } from "./ui/canvasManager";
import { UIManager } from "./ui/uiManager";
import { setupEventHandlers } from "./ui/eventHandlers";
import { adjustLogoFontSize, adjustFontSize, adjustTerminalHeight } from "./utils/uiHelpers";
import JSONCrush from "jsoncrush";

const canvas = document.getElementById("gridCanvas") as HTMLCanvasElement;
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
resizeCanvas();

const handlers = setupEventHandlers(canvasManager, uiManager);

const params = new URLSearchParams(window.location.search);
if (params.has("s")) {
  try {
    const crushed = decodeURIComponent(params.get("s") || "");
    const jsonString = JSONCrush.uncrush(crushed);
    const data = JSON.parse(jsonString);
    handlers.loadStateFromObject(data);
    history.replaceState(null, "", window.location.pathname);
  } catch (err) {
    console.error("Failed to load shared state", err);
  }
}

uiManager.update3DButtonState();
uiManager.updateZScaleValue();
