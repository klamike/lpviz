import { getState, mutate, setState, subscribe } from "../../state/store";
import type { State } from "../../state/store";
import { computeDrawingSnapshot } from "../../state/drawing";
import { CanvasViewportManager } from "../managers/canvasViewportManager";
import { InterfaceLayoutManager } from "../managers/interfaceLayoutManager";
import { showElement, setButtonsEnabled } from "../../state/utils";
import { VRep } from "../../utils/math2d";
import { buildGuidedScript, generateObjective, generatePentagon, type GuidedStep } from "./guidedConfig";

const CURSOR_TRANSITION_MS = 700;
const POPUP_ANIMATION_MS = 300;

const DEFAULT_BUTTON_STATES = {
  ipmButton: false,
  simplexButton: false,
  pdhgButton: false,
  iteratePathButton: false,
  traceButton: false,
  zoomButton: true,
};

type PopupOptions = {
  id: string;
  text: string;
  gradient: string;
  position: { bottom: string; left?: string; right?: string };
  maxWidth?: string;
  onClose?: () => void;
  onClick?: () => void;
};

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

function createPopupElement({ id, text, gradient, position, maxWidth, onClose, onClick }: PopupOptions): HTMLElement {
  const popup = document.createElement("div");
  popup.id = id;
  popup.innerHTML = `
    <div class="guided-popup__content">
      <div class="guided-popup__text">${text}</div>
      <button class="guided-popup__close" aria-label="Close">×</button>
    </div>
  `;

  Object.assign(popup.style, {
    position: "fixed",
    bottom: position.bottom,
    left: position.left,
    right: position.right,
    background: gradient,
    color: "#fff",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    zIndex: "9999",
    fontFamily: "JuliaMono, monospace",
    cursor: "pointer",
    transform: "translateY(100px)",
    opacity: "0",
    transition: `all ${POPUP_ANIMATION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.15)",
    maxWidth: maxWidth ?? "min(320px, calc(100% - 40px))",
  });

  const content = popup.querySelector(".guided-popup__content") as HTMLElement;
  Object.assign(content.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    gap: "12px",
  });

  const closeBtn = popup.querySelector(".guided-popup__close") as HTMLElement;
  Object.assign(closeBtn.style, {
    background: "rgba(255,255,255,0.2)",
    border: "none",
    color: "#fff",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClose?.();
  });

  if (onClick) {
    popup.addEventListener("click", (e) => {
      if (e.target !== closeBtn) onClick();
    });
  }

  return popup;
}

function logicalToScreen(canvasManager: CanvasViewportManager, point: { x: number; y: number }) {
  const rect = canvasManager.canvas.getBoundingClientRect();
  const canvasPoint = canvasManager.toCanvasCoords(point.x, point.y);
  return { x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y };
}

export class GuidedExperience {
  private canvasManager: CanvasViewportManager;
  private uiManager: InterfaceLayoutManager;
  private sendPolytope: () => void;
  private saveToHistory: () => void;
  private cursor: HTMLElement | null = null;
  private running = false;
  private allowNextClick = false;
  private clickBlocker: ((e: Event) => void) | null = null;

  constructor(canvasManager: CanvasViewportManager, uiManager: InterfaceLayoutManager, sendPolytope: () => void, saveToHistory: () => void) {
    this.canvasManager = canvasManager;
    this.uiManager = uiManager;
    this.sendPolytope = sendPolytope;
    this.saveToHistory = saveToHistory;
  }

  public setSendPolytope(fn: () => void) {
    this.sendPolytope = fn;
  }

  public setSaveToHistory(fn: () => void) {
    this.saveToHistory = fn;
  }

  public isTouring() {
    return this.running;
  }

  public stopTour() {
    this.running = false;
    this.removeCursor();
    this.toggleClickBlocker(false);
    setState({ currentMouse: null, currentObjective: null });
    this.canvasManager.draw();
  }

  public async startGuidedTour() {
    if (this.running) return;
    this.running = true;
    this.toggleClickBlocker(true);
    this.resetWorkspace();
    this.createCursor();

    const script = buildGuidedScript(generatePentagon(), generateObjective());
    try {
      for (const step of script) {
        if (!this.running) break;
        await this.runStep(step);
        if (!this.running) break;
        await delay(250);
      }
    } finally {
      this.stopTour();
    }
  }

  private resetWorkspace() {
    setState({
      vertices: [],
      polytopeComplete: false,
      interiorPoint: null,
      currentMouse: null,
      objectiveVector: null,
      currentObjective: null,
    });

    setButtonsEnabled(DEFAULT_BUTTON_STATES);
    this.uiManager.updateSolverModeButtons();
    this.uiManager.updateObjectiveDisplay();
    this.canvasManager.draw();
  }

  private async runStep(step: GuidedStep) {
    if (step.type === "wait") {
        await delay(step.duration);
      return;
    }
    if (step.type === "click-button") {
      await this.clickButton(step.id);
      return;
    }
    if (step.type === "draw-vertex") {
        await this.clickAtPoint(step.point, () => {
          this.saveToHistory();
          mutate((draft) => draft.vertices.push(step.point));
          this.uiManager.hideNullStateMessage();
          this.canvasManager.draw();
          this.sendPolytope();
        });
      return;
    }
    if (step.type === "set-objective") {
        await this.clickAtPoint(step.point, () => {
          this.saveToHistory();
        mutate((draft) => { draft.objectiveVector = step.point; });
          showElement("maximize");
          setButtonsEnabled({
            ipmButton: true,
            simplexButton: true,
            pdhgButton: true,
            iteratePathButton: false,
            traceButton: true,
            zoomButton: true,
          });
          this.uiManager.updateSolverModeButtons();
          this.uiManager.updateObjectiveDisplay();
          this.canvasManager.draw();
        });
      return;
    }
    if (step.type === "close-polytope") {
        await this.clickAtPoint(step.point, () => {
          this.saveToHistory();
          mutate((draft) => {
            draft.polytopeComplete = true;
            draft.interiorPoint = step.point;
          });
          this.canvasManager.draw();
          this.sendPolytope();
          setButtonsEnabled({
            ipmButton: true,
            simplexButton: true,
            pdhgButton: true,
            iteratePathButton: false,
            traceButton: true,
            zoomButton: true,
          });
        });
    }
  }

  private async clickAtPoint(point: { x: number; y: number }, apply: () => void) {
    await this.moveCursorTo(point);
    await this.animateCursorClick();
    apply();
    await delay(120);
  }

  private async clickButton(id: string) {
    const element = document.getElementById(id) as HTMLElement | null;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    await this.moveCursorToScreen(rect.left + rect.width / 2, rect.top + rect.height / 2);
    await this.animateCursorClick();
    this.allowNextClick = true;
    element.click();
    await delay(150);
  }

  private createCursor() {
    if (this.cursor) return;
    const cursor = document.createElement("div");
    cursor.id = "guidedTourCursor";
    cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="#4A90E2" stroke="#fff" stroke-width="1.5"/></svg>`;
    Object.assign(cursor.style, {
      position: "fixed",
      zIndex: "10000",
      width: "24px",
      height: "24px",
      pointerEvents: "none",
      transition: `all ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      transform: "translate(-25%, -25%)",
      filter: "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))",
    });
    document.body.appendChild(cursor);
    this.cursor = cursor;
  }

  private removeCursor() {
    this.cursor?.remove();
    this.cursor = null;
  }

  private async moveCursorTo(point: { x: number; y: number }) {
    const { x, y } = logicalToScreen(this.canvasManager, point);
    await this.moveCursorToScreen(x, y);
  }

  private async moveCursorToScreen(x: number, y: number) {
    if (!this.cursor) return;
    this.cursor.style.left = `${x}px`;
    this.cursor.style.top = `${y}px`;
    await delay(CURSOR_TRANSITION_MS);
  }

  private async animateCursorClick() {
    if (!this.cursor) return;
    this.cursor.style.transform = "translate(-25%, -25%) scale(1.8)";
    this.cursor.style.filter = "drop-shadow(2px 2px 8px rgba(74,144,226,0.6))";
    await delay(100);
    this.cursor.style.transform = "translate(-25%, -25%) scale(1)";
    this.cursor.style.filter = "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))";
  }

  private toggleClickBlocker(enable: boolean) {
    if (enable) {
      if (this.clickBlocker) return;
      this.clickBlocker = (event: Event) => {
        if (this.allowNextClick) {
          this.allowNextClick = false;
          return;
        }
        const target = event.target as HTMLElement;
        if (target?.id === "guidedTourCursor" || target?.closest("#helpPopup")) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };
      ["click", "mousedown", "mouseup"].forEach((evt) => document.addEventListener(evt, this.clickBlocker!, true));
    } else if (this.clickBlocker) {
      ["click", "mousedown", "mouseup"].forEach((evt) => document.removeEventListener(evt, this.clickBlocker!, true));
      this.clickBlocker = null;
    }
  }
}

export class InactivityHelpOverlay {
  private popup: HTMLElement | null = null;
  private timer: number | null = null;
  private checker: number | null = null;
  private hasShown = false;
  private guidedTour: GuidedExperience;

  constructor(guidedTour: GuidedExperience) {
    this.guidedTour = guidedTour;
  }

  public startTimer() {
    if (this.hasShown || this.timer) return;
    this.timer = window.setTimeout(() => {
      const phase = computeDrawingSnapshot(getState()).phase;
      if ((phase === "awaiting_objective" || phase === "objective_preview") && !this.guidedTour.isTouring()) {
        this.hasShown = true;
        this.showPopup();
      }
    }, 15000);

    this.checker = window.setInterval(() => {
      if (computeDrawingSnapshot(getState()).objectiveDefined) {
        this.stopTimer();
      }
    }, 300);
  }

  public stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    if (this.checker) clearInterval(this.checker);
    this.timer = this.checker = null;
    this.hidePopup();
  }

  public resetTimer() {
    this.stopTimer();
    this.hasShown = false;
    this.startTimer();
  }

  private showPopup() {
    if (this.popup) return;
    this.popup = createPopupElement({
      id: "helpPopup",
      text: "Stuck? Try a random LP",
      gradient: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      position: { bottom: "20px", right: "20px" },
      onClose: () => this.hidePopup(),
      onClick: () => {
        this.hidePopup();
        this.guidedTour.startGuidedTour();
      },
    });
    document.body.appendChild(this.popup);
    requestAnimationFrame(() => {
      if (this.popup) Object.assign(this.popup.style, { transform: "translateY(0)", opacity: "1" });
    });
  }

  private hidePopup() {
    if (!this.popup) return;
    const current = this.popup;
    Object.assign(current.style, { transform: "translateY(100px)", opacity: "0" });
    setTimeout(() => current.remove(), POPUP_ANIMATION_MS);
    this.popup = null;
  }

  public isTouring() {
    return this.guidedTour.isTouring();
  }
}

export class NonconvexHullHintOverlay {
  private popup: HTMLElement | null = null;
  private timer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private hintShown = false;
  private guidedTour: GuidedExperience;

  constructor(guidedTour: GuidedExperience) {
    this.guidedTour = guidedTour;
    this.handleState(getState());
    this.unsubscribe = subscribe((state) => this.handleState(state as State));
  }

  private handleState(state: State) {
    const polytope = VRep.fromPoints(state.vertices);
    const nonconvex = state.polytopeComplete && state.vertices.length >= 3 && !polytope.isConvex();
    if (nonconvex && !this.hintShown) {
      this.startTimer();
    } else if (!nonconvex) {
      this.reset();
    }
  }

  private startTimer() {
    if (this.timer || this.popup || this.hintShown) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (!this.guidedTour.isTouring()) {
        this.hintShown = true;
        this.showPopup();
      }
    }, 4000);
  }

  private reset() {
    this.hintShown = false;
    if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    this.hidePopup();
  }

  private showPopup() {
    if (this.popup) return;
    this.popup = createPopupElement({
      id: "nonconvexHint",
      text: "Tip: double-click inside the polytope to replace it with its convex hull.",
      gradient: "linear-gradient(135deg,#ff9966 0%,#ff5e62 100%)",
      position: { bottom: "20px", left: "20px" },
      onClose: () => this.hidePopup(),
    });
    document.body.appendChild(this.popup);
    requestAnimationFrame(() => {
      if (this.popup) Object.assign(this.popup.style, { transform: "translateY(0)", opacity: "1" });
    });
  }

  private hidePopup() {
    if (!this.popup) return;
    const popup = this.popup;
    Object.assign(popup.style, { transform: "translateY(100px)", opacity: "0" });
    setTimeout(() => popup.remove(), POPUP_ANIMATION_MS);
    this.popup = null;
  }

  public destroy() {
    this.reset();
    if (this.unsubscribe) this.unsubscribe();
      this.unsubscribe = null;
  }
}

