import { state } from "../state/state";
import { CanvasManager } from "./canvasManager";

export class UIManager {
  uiContainer!: HTMLElement;
  topTerminal!: HTMLElement;
  objectiveDisplay!: HTMLElement;
  inequalitiesDiv!: HTMLElement;
  resultDiv!: HTMLElement;
  zoomButton!: HTMLButtonElement;
  unzoomButton!: HTMLButtonElement;
  toggle3DButton!: HTMLButtonElement;
  zScaleSliderContainer!: HTMLElement;
  zScaleSlider!: HTMLInputElement;
  zScaleValue!: HTMLElement;
  iteratePathButton!: HTMLButtonElement;
  ipmButton!: HTMLButtonElement;
  simplexButton!: HTMLButtonElement;
  pdhgButton!: HTMLButtonElement;
  animateButton!: HTMLButtonElement;
  startRotateObjectiveButton!: HTMLButtonElement;
  stopRotateObjectiveButton!: HTMLButtonElement;
  smallScreenOverlay!: HTMLElement;

  private static readonly MIN_SCREEN_WIDTH = 750;
  constructor() {
    this.initializeElements();
    this.initializeSmallScreenOverlay();
  }

  private initializeElements(): void {
    const elementMappings = {
      uiContainer: "uiContainer",
      topTerminal: "terminal-container2",
      objectiveDisplay: "objectiveDisplay",
      inequalitiesDiv: "inequalities",
      resultDiv: "result",
      zoomButton: "zoomButton",
      unzoomButton: "unzoomButton",
      toggle3DButton: "toggle3DButton",
      zScaleSliderContainer: "zScaleSliderContainer",
      zScaleSlider: "zScaleSlider",
      zScaleValue: "zScaleValue",
      iteratePathButton: "iteratePathButton",
      ipmButton: "ipmButton",
      simplexButton: "simplexButton",
      pdhgButton: "pdhgButton",
      animateButton: "animateButton",
      startRotateObjectiveButton: "startRotateObjectiveButton",
      stopRotateObjectiveButton: "stopRotateObjectiveButton",
    };

    Object.entries(elementMappings).forEach(([property, id]) => {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with id "${id}" not found`);
      }
      (this as any)[property] = element;
    });
  }

  private initializeSmallScreenOverlay(): void {
    const existingOverlay = document.getElementById(
      "smallScreenOverlay",
    ) as HTMLElement | null;
    if (existingOverlay) {
      this.smallScreenOverlay = existingOverlay;
    } else {
      this.smallScreenOverlay = this.createSmallScreenOverlay();
    }
  }

  private createSmallScreenOverlay(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.id = "smallScreenOverlay";
    overlay.className = "small-screen-overlay";
    overlay.style.display = "none";
    document.body.appendChild(overlay);
    return overlay;
  }

  checkMobileOrientation() {
    const tooSmall = window.innerWidth < UIManager.MIN_SCREEN_WIDTH;
    this.smallScreenOverlay.textContent = `The window is not wide enough (${window.innerWidth}px < ${UIManager.MIN_SCREEN_WIDTH}px) for lpviz.`;
    this.smallScreenOverlay.style.display = tooSmall ? "flex" : "none";
  }

  hideNullStateMessage() {
    this.setElementDisplay("nullStateMessage", "none");
  }

  private setElementDisplay(id: string, display: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = display;
    }
  }

  updateZoomButtonsState(canvasManager: CanvasManager) {
    const atDefault =
      canvasManager.scaleFactor === 1 &&
      canvasManager.offset.x === 0 &&
      canvasManager.offset.y === 0;

    if (this.zoomButton) {
      this.zoomButton.disabled = false;
      state.uiButtons["zoomButton"] = true;
    }

    if (this.unzoomButton) {
      this.unzoomButton.disabled = atDefault;
      state.uiButtons["unzoomButton"] = !atDefault;
    }
  }

  updateSolverModeButtons() {
    const hasComputedLines =
      state.computedLines && state.computedLines.length > 0;
    const hasSolution =
      state.originalIteratePath && state.originalIteratePath.length > 0;
    const hasObjective = state.objectiveVector !== null;

    if (!hasComputedLines) {
      // Disable all buttons when no computed lines
      this.setButtonsDisabled(
        [
          this.iteratePathButton,
          this.ipmButton,
          this.simplexButton,
          this.pdhgButton,
          this.animateButton,
          this.startRotateObjectiveButton,
        ],
        true,
      );
    } else {
      // Enable buttons based on current solver mode
      const buttonModeMap = [
        { button: this.iteratePathButton, mode: "central" },
        { button: this.ipmButton, mode: "ipm" },
        { button: this.simplexButton, mode: "simplex" },
        { button: this.pdhgButton, mode: "pdhg" },
      ];

      buttonModeMap.forEach(({ button, mode }) => {
        button.disabled = state.solverMode === mode;
        state.uiButtons[button.id] = !button.disabled;
      });

      // Animate button should only be enabled when there's a solution to animate
      this.animateButton.disabled = !hasSolution;
      state.uiButtons["animateButton"] = hasSolution;

      // Rotate objective button should only be enabled when there's an objective vector
      this.startRotateObjectiveButton.disabled = !hasObjective;
      state.uiButtons["startRotateObjectiveButton"] = hasObjective;
    }

    // Stop rotate button should be enabled when rotation is active
    this.stopRotateObjectiveButton.disabled = !state.rotateObjectiveMode;
    state.uiButtons["stopRotateObjectiveButton"] = state.rotateObjectiveMode;
  }

  private setButtonsDisabled(
    buttons: HTMLButtonElement[],
    disabled: boolean,
  ): void {
    buttons.forEach((button) => {
      if (button) {
        button.disabled = disabled;
        if (button.id) {
          state.uiButtons[button.id] = !disabled;
        }
      }
    });
  }

  updateResult(html: string) {
    this.resultDiv!.innerHTML = html;
  }

  update3DButtonState() {
    const button = this.toggle3DButton;
    const container = this.zScaleSliderContainer;

    if (state.is3DMode) {
      this.set3DButtonActive(button, true);
      container.style.display = "flex";
    } else {
      this.set3DButtonActive(button, false);
      container.style.display = "none";
    }
  }

  private set3DButtonActive(button: HTMLButtonElement, active: boolean): void {
    if (active) {
      button.textContent = "2D";
      button.style.backgroundColor = "#4CAF50";
      button.style.color = "white";
    } else {
      button.textContent = "3D";
      button.style.backgroundColor = "";
      button.style.color = "";
    }
  }

  updateZScaleValue() {
    this.zScaleValue.textContent = state.zScale.toFixed(2);
    this.zScaleSlider.value = String(state.zScale);
  }

  synchronizeUIWithState() {
    this.update3DButtonState();
    this.updateZScaleValue();
    this.updateSolverModeButtons();
    if (state.vertices.length > 0 || state.objectiveVector) {
      this.hideNullStateMessage();
    }
    this.checkMobileOrientation();
  }
}
