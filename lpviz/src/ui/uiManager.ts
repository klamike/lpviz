import {
  getObjectiveState,
  getSolverState,
  getGeometryState,
  getViewState,
} from "../state/state";
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
  private static readonly OBJECTIVE_PRECISION = 3;

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
      stopRotateObjectiveButton: "stopRotateObjectiveButton"
    };

    const target = this as unknown as Record<
      string,
      HTMLElement | HTMLButtonElement | HTMLInputElement | undefined
    >;
    Object.entries(elementMappings).forEach(([property, id]) => {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with id "${id}" not found`);
        return;
      }
      target[property] = element as HTMLElement;
    });
  }

  private initializeSmallScreenOverlay(): void {
    const existingOverlay = document.getElementById("smallScreenOverlay") as HTMLElement | null;
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
    this.smallScreenOverlay.textContent =
      `The window is not wide enough (${window.innerWidth}px < ${UIManager.MIN_SCREEN_WIDTH}px) for lpviz.`;
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
    if (
      canvasManager.scaleFactor === 1 &&
      canvasManager.offset.x === 0 &&
      canvasManager.offset.y === 0
    ) {
      this.zoomButton!.disabled = false;
    } else {
      this.unzoomButton!.disabled = false;
    }
  }

  updateObjectiveDisplay() {
    const snapshot = getObjectiveState();
    if (snapshot.objectiveVector) {
      const a = this.roundToPrecision(snapshot.objectiveVector.x, UIManager.OBJECTIVE_PRECISION);
      const b = this.roundToPrecision(snapshot.objectiveVector.y, UIManager.OBJECTIVE_PRECISION);
      const formattedObjective = this.formatObjectiveString(a, b);
      
      this.objectiveDisplay.classList.add("objective-item");
      this.objectiveDisplay.innerHTML = formattedObjective;
      this.objectiveDisplay.style.color = "#eee";
    } else {
      this.objectiveDisplay.classList.remove("objective-item");
      this.objectiveDisplay.innerHTML = "";
    }
  }

  private roundToPrecision(value: number, precision: number): number {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }

  private formatObjectiveString(a: number, b: number): string {
    const bTerm = b >= 0 ? `+ ${b}y` : `- ${-b}y`;
    return `${a}x ${bTerm}`;
  }

  updateSolverModeButtons() {
    const geometry = getGeometryState();
    const solver = getSolverState();
    const objective = getObjectiveState();
    const hasComputedLines = geometry.computedLines && geometry.computedLines.length > 0;
    const hasSolution = solver.originalIteratePath && solver.originalIteratePath.length > 0;
    const hasObjective = objective.objectiveVector !== null;
    
    if (!hasComputedLines) {
      // Disable all buttons when no computed lines
      this.setButtonsDisabled([
        this.iteratePathButton, 
        this.ipmButton, 
        this.simplexButton, 
        this.pdhgButton, 
        this.animateButton,
        this.startRotateObjectiveButton
      ], true);
    } else {
      // Enable buttons based on current solver mode
      const buttonModeMap = [
        { button: this.iteratePathButton, mode: "central" },
        { button: this.ipmButton, mode: "ipm" },
        { button: this.simplexButton, mode: "simplex" },
        { button: this.pdhgButton, mode: "pdhg" }
      ];
      
      buttonModeMap.forEach(({ button, mode }) => {
        button.disabled = solver.solverMode === mode;
      });
      
      // Animate button should only be enabled when there's a solution to animate
      this.animateButton.disabled = !hasSolution;
      
      // Rotate objective button should only be enabled when there's an objective vector
      this.startRotateObjectiveButton.disabled = !hasObjective;
    }
    
    // Stop rotate button should be enabled when rotation is active
    this.stopRotateObjectiveButton.disabled = !solver.rotateObjectiveMode;
  }

  private setButtonsDisabled(buttons: HTMLButtonElement[], disabled: boolean): void {
    buttons.forEach(button => {
      if (button) {
        button.disabled = disabled;
      }
    });
  }

  updateResult(html: string) {
    this.resultDiv!.innerHTML = html;
  }

  update3DButtonState() {
    const button = this.toggle3DButton;
    const container = this.zScaleSliderContainer;
    
    if (getViewState().is3DMode) {
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
    const snapshot = getViewState();
    this.zScaleValue.textContent = snapshot.zScale.toFixed(2);
    this.zScaleSlider.value = String(snapshot.zScale);
  }

  synchronizeUIWithState() {
    this.update3DButtonState();
    this.updateZScaleValue();
    this.updateObjectiveDisplay();
    this.updateSolverModeButtons();
    const geometry = getGeometryState();
    const objective = getObjectiveState();
    if (geometry.vertices.length > 0 || objective.objectiveVector) {
      this.hideNullStateMessage();
    }
    this.checkMobileOrientation();
  }
}
