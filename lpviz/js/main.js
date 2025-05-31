import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { CanvasManager } from "./canvasManager.js";
import { UIManager } from "./uiManager.js";
import { setupEventHandlers } from "./eventHandlers.js";

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
