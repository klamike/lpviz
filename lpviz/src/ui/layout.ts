import { getState } from "../state/store";
import { ViewportManager } from "./viewport";
import { hasPolytopeLines } from "../solvers/utils/polytope";

export class LayoutManager {
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
    this.smallScreenOverlay.classList.add("is-hidden");
  }

  private createSmallScreenOverlay(): HTMLElement {
    const overlay = Object.assign(document.createElement("div"), {
      id: "smallScreenOverlay",
      className: "small-screen-overlay",
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  checkMobileOrientation() {
    const tooSmall = window.innerWidth < LayoutManager.MIN_SCREEN_WIDTH;
    this.smallScreenOverlay.textContent = `The window is not wide enough (${window.innerWidth}px < ${LayoutManager.MIN_SCREEN_WIDTH}px) for lpviz.`;
    this.smallScreenOverlay.classList.toggle("is-hidden", !tooSmall);
    this.smallScreenOverlay.classList.toggle("is-flex", tooSmall);
  }

  hideNullStateMessage() {
    this.setElementDisplay("nullStateMessage", "none");
  }

  private setElementDisplay(id: string, display: string): void {
    const element = document.getElementById(id);
    if (!element) return;

    element.style.removeProperty("display");
    element.classList.toggle("is-hidden", display === "none");
    element.classList.toggle("is-block", display === "block");
  }

  updateZoomButtonsState(canvasManager: ViewportManager) {
    if (canvasManager.isDefaultView()) {
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

      this.objectiveDisplay.classList.add("objective-item", "objective-active");
      this.objectiveDisplay.innerHTML = `${a}x ${bTerm}`;
    } else {
      this.objectiveDisplay.classList.remove("objective-item", "objective-active");
      this.objectiveDisplay.innerHTML = "";
    }
  }

  updateSolverModeButtons() {
    const state = getState();
    const phaseSnapshot = state.snapshot;
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
    buttons.forEach((button) => {
      if (button) button.disabled = disabled;
    });
  }

  updateResult(html: string) {
    this.resultDiv!.innerHTML = html;
  }

  update3DButtonState() {
    const { is3DMode } = getState();
    const btn = this.toggle3DButton;

    btn.textContent = is3DMode ? "2D" : "3D";
    btn.classList.toggle("button-active", is3DMode);
    this.zScaleSliderContainer.classList.toggle("is-hidden", !is3DMode);
  }

  updateZScaleValue() {
    const { zScale } = getState();
    this.zScaleValue.textContent = zScale.toFixed(2);
    this.zScaleSlider.value = String(zScale);
  }

  synchronize() {
    this.update3DButtonState();
    this.updateZScaleValue();
    this.updateObjectiveDisplay();
    this.updateSolverModeButtons();
    const state = getState();
    if (state.snapshot.objectiveDefined) {
      this.hideNullStateMessage();
    }
    this.checkMobileOrientation();
  }
}
