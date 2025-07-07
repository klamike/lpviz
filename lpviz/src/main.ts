import { CanvasManager } from "./ui/canvasManager";
import { UIManager } from "./ui/uiManager";
import { setupEventHandlers } from "./ui/eventHandlers";
import JSONCrush from "jsoncrush";

const canvas = document.getElementById("gridCanvas") as HTMLCanvasElement;
const canvasManager = new CanvasManager(canvas);
const uiManager = new UIManager();

function resizeCanvas() {
  uiManager.checkMobileOrientation();
  canvasManager.updateDimensions();
  canvasManager.draw();
  uiManager.updateZoomButtonsState(canvasManager);
}

window.addEventListener("resize", resizeCanvas);
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
