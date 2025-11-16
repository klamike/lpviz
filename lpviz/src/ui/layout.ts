import { getState } from "../state/store";
import { computeDrawingSnapshot } from "../state/drawing";
import { CanvasViewportManager } from "./viewport";
import { hasPolytopeLines } from "../types/problem";

export class InterfaceLayoutManager {
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
    const ids: Record<string, string> = {
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

    const target = this as unknown as Record<string, HTMLElement>;
    for (const [prop, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) target[prop] = el as HTMLElement;
      else console.warn(`Element with id "${id}" not found`);
    }
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
    const overlay = Object.assign(document.createElement("div"), {
      id: "smallScreenOverlay",
      className: "small-screen-overlay",
    });
    overlay.style.display = "none";
    document.body.appendChild(overlay);
    return overlay;
  }

  checkMobileOrientation() {
    const tooSmall = window.innerWidth < InterfaceLayoutManager.MIN_SCREEN_WIDTH;
    this.smallScreenOverlay.textContent = `The window is not wide enough (${window.innerWidth}px < ${InterfaceLayoutManager.MIN_SCREEN_WIDTH}px) for lpviz.`;
    this.smallScreenOverlay.style.display = tooSmall ? "flex" : "none";
  }

  hideNullStateMessage() {
    this.setElementDisplay("nullStateMessage", "none");
  }

  private setElementDisplay(id: string, display: string): void {
    const element = document.getElementById(id);
    if (element) element.style.display = display;
  }

  updateZoomButtonsState(canvasManager: CanvasViewportManager) {
    if (canvasManager.scaleFactor === 1 && canvasManager.offset.x === 0 && canvasManager.offset.y === 0) {
      this.zoomButton!.disabled = false;
    } else {
      this.unzoomButton!.disabled = false;
    }
  }

  updateObjectiveDisplay() {
    const { objectiveVector } = getState();
    if (objectiveVector) {
      const round = (v: number) => Math.round(v * 1000) / 1000;
      const a = round(objectiveVector.x);
      const b = round(objectiveVector.y);
      const bTerm = b >= 0 ? `+ ${b}y` : `- ${-b}y`;

      this.objectiveDisplay.classList.add("objective-item");
      this.objectiveDisplay.innerHTML = `${a}x ${bTerm}`;
      this.objectiveDisplay.style.color = "#eee";
    } else {
      this.objectiveDisplay.classList.remove("objective-item");
      this.objectiveDisplay.innerHTML = "";
    }
  }

  updateSolverModeButtons() {
    const state = getState();
    const phaseSnapshot = computeDrawingSnapshot(state);
    const hasComputedLines = hasPolytopeLines(state.polytope);
    const hasSolution = state.originalIteratePath?.length > 0;
    const hasObjective = phaseSnapshot.objectiveDefined;

    if (!hasComputedLines) {
      this.setButtonsDisabled([this.iteratePathButton, this.ipmButton, this.simplexButton, this.pdhgButton, this.animateButton, this.startRotateObjectiveButton], true);
    } else {
      [
        [this.iteratePathButton, "central"],
        [this.ipmButton, "ipm"],
        [this.simplexButton, "simplex"],
        [this.pdhgButton, "pdhg"],
      ].forEach(([btn, mode]) => {
        (btn as HTMLButtonElement).disabled = state.solverMode === mode;
      });

      this.animateButton.disabled = !hasSolution;
      this.startRotateObjectiveButton.disabled = !hasObjective;
    }

    this.stopRotateObjectiveButton.disabled = !state.rotateObjectiveMode;
  }

  private setButtonsDisabled(buttons: HTMLButtonElement[], disabled: boolean): void {
    buttons.forEach((button) => { if (button) button.disabled = disabled; });
  }

  updateResult(html: string) {
    this.resultDiv!.innerHTML = html;
  }

  update3DButtonState() {
    const { is3DMode } = getState();
    const btn = this.toggle3DButton;
    
    btn.textContent = is3DMode ? "2D" : "3D";
    btn.style.backgroundColor = is3DMode ? "#4CAF50" : "";
    btn.style.color = is3DMode ? "white" : "";
    this.zScaleSliderContainer.style.display = is3DMode ? "flex" : "none";
  }

  updateZScaleValue() {
    const { zScale } = getState();
    this.zScaleValue.textContent = zScale.toFixed(2);
    this.zScaleSlider.value = String(zScale);
  }

  synchronizeUIWithState() {
    this.update3DButtonState();
    this.updateZScaleValue();
    this.updateObjectiveDisplay();
    this.updateSolverModeButtons();
    const state = getState();
    const phaseSnapshot = computeDrawingSnapshot(state);
    if (state.vertices.length > 0 || phaseSnapshot.objectiveDefined) {
      this.hideNullStateMessage();
    }
    this.checkMobileOrientation();
  }
}
