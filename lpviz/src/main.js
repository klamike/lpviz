import { CanvasManager } from "./ui/canvasManager.js";
import { UIManager } from "./ui/uiManager.js";
import { setupEventHandlers } from "./ui/eventHandlers.js";

const canvas = document.getElementById("gridCanvas");
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

setupEventHandlers(canvasManager, uiManager);

uiManager.update3DButtonState();
uiManager.updateZScaleValue();
