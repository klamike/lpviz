import { state } from "./state.js";

export class UIManager {
  constructor() {
    this.uiContainer = document.getElementById("uiContainer");
    this.nullStateMessage = document.getElementById("nullStateMessage");
    this.objectiveDisplay = document.getElementById("objectiveDisplay");
    this.inequalitiesDiv = document.getElementById("inequalities");
    this.resultDiv = document.getElementById("result");
    this.zoomButton = document.getElementById("zoomButton");
    this.unzoomButton = document.getElementById("unzoomButton");
    this.iteratePathButton = document.getElementById("iteratePathButton");
    this.ipmButton = document.getElementById("ipmButton");
    this.simplexButton = document.getElementById("simplexButton");
    this.pdhgButton = document.getElementById("pdhgButton");
    this.animateButton = document.getElementById("animateButton");
  }

  hideNullStateMessage() {
    this.nullStateMessage.style.display = "none";
  }

  updateZoomButtonsState(canvasManager) {
    if (
      canvasManager.scaleFactor === 1 &&
      canvasManager.offset.x === 0 &&
      canvasManager.offset.y === 0
    ) {
      this.unzoomButton.disabled = true;
      this.zoomButton.disabled = false;
    } else {
      this.unzoomButton.disabled = false;
      this.zoomButton.disabled = true;
    }
  }

  updateObjectiveDisplay() {
    if (state.objectiveVector) {
      const a = Math.round(state.objectiveVector.x * 1000) / 1000;
      const b = Math.round(state.objectiveVector.y * 1000) / 1000;
      this.objectiveDisplay.classList.add("objective-item");
      this.objectiveDisplay.innerHTML = `${a}x ${
        b >= 0 ? "+ " + b + "y" : "- " + (-b) + "y"
      }`;
      this.objectiveDisplay.style.color = "#eee";
    } else {
      this.objectiveDisplay.classList.remove("objective-item");
      this.objectiveDisplay.innerHTML = "";
    }
  }

  updateSolverModeButtons() {
    if (!state.computedLines || state.computedLines.length === 0) {
      this.iteratePathButton.disabled = true;
      this.ipmButton.disabled = true;
      this.simplexButton.disabled = true;
      this.pdhgButton.disabled = true;
      this.animateButton.disabled = true;
    } else {
      if (state.solverMode !== "central") this.iteratePathButton.disabled = false;
      if (state.solverMode !== "ipm") this.ipmButton.disabled = false;
      if (state.solverMode !== "simplex") this.simplexButton.disabled = false;
      if (state.solverMode !== "pdhg") this.pdhgButton.disabled = false;
    }
  }

  updateResult(html) {
    this.resultDiv.innerHTML = html;
  }
}
