import { state } from "../state/state.js";

export class UIManager {
  constructor() {
    this.uiContainer = document.getElementById("uiContainer");
    this.topTerminal = document.getElementById("terminal-container2");
    this.objectiveDisplay = document.getElementById("objectiveDisplay");
    this.inequalitiesDiv = document.getElementById("inequalities");
    this.resultDiv = document.getElementById("result");
    this.zoomButton = document.getElementById("zoomButton");
    this.unzoomButton = document.getElementById("unzoomButton");
    this.toggle3DButton = document.getElementById("toggle3DButton");
    this.zScaleSliderContainer = document.getElementById("zScaleSliderContainer");
    this.zScaleSlider = document.getElementById("zScaleSlider");
    this.zScaleValue = document.getElementById("zScaleValue");
    this.iteratePathButton = document.getElementById("iteratePathButton");
    this.ipmButton = document.getElementById("ipmButton");
    this.simplexButton = document.getElementById("simplexButton");
    this.pdhgButton = document.getElementById("pdhgButton");
    this.animateButton = document.getElementById("animateButton");
    this.addedLandscapeWarning = false;
  }

  checkMobileOrientation() {
    if (!this.addedLandscapeWarning && window.innerWidth < 750 && window.innerHeight > window.innerWidth) {
      this.topTerminal.innerHTML = "<div class=\"landscape-warning\" style=\"display: block;\">Switch to landscape mode or a larger screen.</div>" + this.topTerminal.innerHTML;
      this.addedLandscapeWarning = true;
      this.objectiveDisplay = document.getElementById("objectiveDisplay");
      this.inequalitiesDiv = document.getElementById("inequalities");
    } else if (this.addedLandscapeWarning && window.innerWidth >= 750) {
      this.topTerminal.removeChild(document.querySelector(".landscape-warning"));
      this.addedLandscapeWarning = false;
      this.objectiveDisplay = document.getElementById("objectiveDisplay");
      this.inequalitiesDiv = document.getElementById("inequalities");
    }
  }

  hideNullStateMessage() {
    document.getElementById("nullStateMessage").style.display = "none";
  }

  updateZoomButtonsState(canvasManager) {
    if (
      canvasManager.scaleFactor === 1 &&
      canvasManager.offset.x === 0 &&
      canvasManager.offset.y === 0
    ) {
      this.zoomButton.disabled = false;
    } else {
      this.unzoomButton.disabled = false;
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

  update3DButtonState() {
    if (state.is3DMode) {
      this.toggle3DButton.textContent = "2D";
      this.toggle3DButton.style.backgroundColor = "#4CAF50";
      this.toggle3DButton.style.color = "white";
      this.zScaleSliderContainer.style.display = "flex";
    } else {
      this.toggle3DButton.textContent = "3D";
      this.toggle3DButton.style.backgroundColor = "";
      this.toggle3DButton.style.color = "";
      this.zScaleSliderContainer.style.display = "none";
    }
  }

  updateZScaleValue() {
    this.zScaleValue.textContent = state.zScale.toFixed(2);
    this.zScaleSlider.value = state.zScale;
  }
}
