import { computeDrawingPhase, getState, mutate, setState, subscribe, type DrawingPhase, type State } from "../../state/store";
import type { PointXY } from "../../solvers/utils/blas";
import { VRep } from "../../solvers/utils/polygon";
import { ViewportManager } from "../viewport";

const POPUP_ANIMATION_MS = 300;
const TOUR_CURSOR_TRANSITION_MS = 700;
const TOUR_DEFAULT_DELAY_MS = 300;
const TOUR_STEP_PAUSE_MS = 250;
const TOUR_CLICK_AT_POINT_DELAY_MS = 120;
const TOUR_BUTTON_CLICK_DELAY_MS = 150;
const TOUR_CURSOR_CLICK_ANIMATION_MS = 100;
const TOUR_INACTIVITY_TIMEOUT_MS = 5000;

type TourStep =
  | { type: "wait"; duration: number }
  | { type: "draw-vertex"; point: PointXY }
  | { type: "close-polytope"; point: PointXY }
  | { type: "set-objective"; point: PointXY }
  | { type: "click-button"; id: string };

export function createOnboardingRuntime({
  canvasManager,
  saveHistory,
  sendPolytope,
  getButtonTarget,
}: {
  canvasManager: ViewportManager;
  saveHistory: () => void;
  sendPolytope: () => void;
  getButtonTarget: (id: string) => HTMLElement | null;
}) {
  let cursor: HTMLElement | null = null;
  let running = false;
  let allowNextClick = false;
  let clickBlocker: ((event: Event) => void) | null = null;
  let nonconvexHintPopup: HTMLElement | null = null;
  let nonconvexHintTimer: number | null = null;
  let nonconvexHintShown = false;
  let helpOverlayPopup: HTMLElement | null = null;
  let helpOverlayTimer: number | null = null;
  let helpOverlayShown = false;
  let lastHelpPhase: DrawingPhase | null = null;
  let initialized = false;
  let tornDown = false;
  let unsubscribeHelpOverlay: (() => void) | null = null;
  let handleBeforeUnload: (() => void) | null = null;

  const delay = (ms = TOUR_DEFAULT_DELAY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

  const logicalToScreen = (point: { x: number; y: number }) => {
    const rect = canvasManager.canvas.getBoundingClientRect();
    const canvasPoint = canvasManager.toCanvasCoords(point.x, point.y);
    return { x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y };
  };

  const buildScript = (vertices: PointXY[], objective: PointXY): TourStep[] => {
    const steps: TourStep[] = [{ type: "wait", duration: 500 }];
    vertices.forEach((point) => steps.push({ type: "draw-vertex", point }));
    steps.push({ type: "close-polytope", point: { x: 0, y: 0 } });
    steps.push({ type: "wait", duration: 1000 });
    steps.push({ type: "set-objective", point: objective });
    steps.push({ type: "wait", duration: 1000 });
    steps.push({ type: "click-button", id: "ipmButton" });
    steps.push({ type: "wait", duration: 750 });
    steps.push({ type: "click-button", id: "toggle3DButton" });
    steps.push({ type: "wait", duration: 750 });
    steps.push({ type: "click-button", id: "startRotateObjectiveButton" });
    steps.push({ type: "wait", duration: 2000 });
    steps.push({ type: "click-button", id: "iteratePathButton" });
    steps.push({ type: "wait", duration: 1500 });
    steps.push({ type: "click-button", id: "traceCheckbox" });
    return steps;
  };

  const generatePentagon = (): PointXY[] => {
    const vertices: PointXY[] = [];
    for (let index = 0; index < 5; index += 1) {
      const angle = (index * 2 * Math.PI) / 5 - Math.PI / 2;
      const radiusVariation = 0.8 + Math.random() * 0.4;
      const radius = 10 * radiusVariation;
      const angleVariation = (Math.random() - 0.5) * 0.3;
      vertices.push({
        x: radius * Math.cos(angle + angleVariation),
        y: radius * Math.sin(angle + angleVariation),
      });
    }
    return vertices;
  };

  const generateObjective = (): PointXY => {
    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
    const magnitude = 6 + Math.random() * 8;
    return {
      x: magnitude * Math.cos(angle),
      y: magnitude * Math.sin(angle),
    };
  };

  const setClickBlocker = (enabled: boolean) => {
    if (enabled) {
      if (clickBlocker) {
        return;
      }
      clickBlocker = (event: Event) => {
        if (allowNextClick) {
          allowNextClick = false;
          return;
        }
        const target = event.target as HTMLElement;
        if (target?.id === "tourCursor" || target?.closest("#helpPopup")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };
      ["click", "mousedown", "mouseup"].forEach((eventName) => {
        document.addEventListener(eventName, clickBlocker!, true);
      });
      return;
    }

    if (!clickBlocker) {
      return;
    }
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      document.removeEventListener(eventName, clickBlocker!, true);
    });
    clickBlocker = null;
  };

  const ensureCursor = () => {
    if (cursor) {
      return;
    }
    cursor = document.createElement("div");
    cursor.id = "tourCursor";
    cursor.innerHTML = "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z\" fill=\"#4A90E2\" stroke=\"#fff\" stroke-width=\"1.5\"/></svg>";
    Object.assign(cursor.style, {
      position: "fixed",
      zIndex: "10000",
      width: "24px",
      height: "24px",
      pointerEvents: "none",
      transition: `all ${TOUR_CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
      transform: "translate(-25%, -25%)",
      filter: "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))",
    });
    document.body.appendChild(cursor);
  };

  const moveCursorToScreen = async (x: number, y: number) => {
    if (!cursor) {
      return;
    }
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    await delay(TOUR_CURSOR_TRANSITION_MS);
  };

  const moveCursorToPoint = async (point: PointXY) => {
    const screenPoint = logicalToScreen(point);
    await moveCursorToScreen(screenPoint.x, screenPoint.y);
  };

  const animateCursorClick = async () => {
    if (!cursor) {
      return;
    }
    cursor.style.transform = "translate(-25%, -25%) scale(1.8)";
    cursor.style.filter = "drop-shadow(2px 2px 8px rgba(74,144,226,0.6))";
    await delay(TOUR_CURSOR_CLICK_ANIMATION_MS);
    cursor.style.transform = "translate(-25%, -25%) scale(1)";
    cursor.style.filter = "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))";
  };

  const resetWorkspace = () => {
    setState({
      vertices: [],
      completionMode: "draft",
      interiorPoint: null,
      currentMouse: null,
      objectiveVector: null,
      currentObjective: null,
    });
    canvasManager.draw();
  };

  const clickPoint = async (point: PointXY, apply: () => void) => {
    await moveCursorToPoint(point);
    await animateCursorClick();
    apply();
    await delay(TOUR_CLICK_AT_POINT_DELAY_MS);
  };

  const clickButton = async (id: string) => {
    const element = getButtonTarget(id);
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    await moveCursorToScreen(rect.left + rect.width / 2, rect.top + rect.height / 2);
    await animateCursorClick();
    allowNextClick = true;
    element.click();
    await delay(TOUR_BUTTON_CLICK_DELAY_MS);
  };

  const runStep = async (step: TourStep) => {
    if (step.type === "wait") {
      await delay(step.duration);
      return;
    }
    if (step.type === "click-button") {
      await clickButton(step.id);
      return;
    }
    if (step.type === "draw-vertex") {
      await clickPoint(step.point, () => {
        saveHistory();
        mutate((draft) => {
          draft.vertices.push(step.point);
          draft.completionMode = "draft";
        });
        canvasManager.draw();
        sendPolytope();
      });
      return;
    }
    if (step.type === "set-objective") {
      await clickPoint(step.point, () => {
        saveHistory();
        mutate((draft) => {
          draft.objectiveVector = step.point;
        });
        canvasManager.draw();
      });
      return;
    }
    await clickPoint(step.point, () => {
      saveHistory();
      mutate((draft) => {
        draft.completionMode = "closed";
        draft.interiorPoint = step.point;
      });
      canvasManager.draw();
      sendPolytope();
    });
  };

  const stop = () => {
    running = false;
    cursor?.remove();
    cursor = null;
    setClickBlocker(false);
    setState({ currentMouse: null, currentObjective: null, tourActive: false });
    canvasManager.draw();
  };

  const start = async () => {
    if (running) {
      return;
    }
    running = true;
    setState({ tourActive: true });
    setClickBlocker(true);
    resetWorkspace();
    ensureCursor();

    const script = buildScript(generatePentagon(), generateObjective());
    try {
      for (const step of script) {
        if (!running) {
          break;
        }
        await runStep(step);
        if (!running) {
          break;
        }
        await delay(TOUR_STEP_PAUSE_MS);
      }
    } finally {
      stop();
    }
  };

  const createOverlayPopup = (options: {
    id: string;
    text: string;
    side: "left" | "right";
    gradient: string;
    onClick?: () => void;
    onClose?: () => void;
  }) => {
    const popup = document.createElement("div");
    popup.id = options.id;
    popup.innerHTML = `
      <div class="tour-popup__content">
        <div class="tour-popup__text">${options.text}</div>
        <button class="tour-popup__close" aria-label="Close">×</button>
      </div>
    `;
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "20px",
      [options.side]: "20px",
      background: options.gradient,
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
      maxWidth: "min(320px, calc(100% - 40px))",
    });
    const content = popup.querySelector(".tour-popup__content") as HTMLElement;
    Object.assign(content.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 20px",
      gap: "12px",
    });
    const closeButton = popup.querySelector(".tour-popup__close") as HTMLButtonElement;
    Object.assign(closeButton.style, {
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
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      options.onClose?.();
    });
    if (options.onClick) {
      popup.addEventListener("click", (event) => {
        if (event.target === closeButton) {
          return;
        }
        options.onClick?.();
      });
    }
    return popup;
  };

  const showOverlayPopup = (popup: HTMLElement) => {
    document.body.appendChild(popup);
    requestAnimationFrame(() => {
      Object.assign(popup.style, { transform: "translateY(0)", opacity: "1" });
    });
  };

  const dismissOverlayPopup = (popup: HTMLElement | null) => {
    if (!popup) {
      return;
    }
    Object.assign(popup.style, { transform: "translateY(100px)", opacity: "0" });
    setTimeout(() => popup.remove(), POPUP_ANIMATION_MS);
  };

  const dismissNonconvexHint = () => {
    nonconvexHintShown = false;
    if (nonconvexHintTimer !== null) {
      clearTimeout(nonconvexHintTimer);
      nonconvexHintTimer = null;
    }
    dismissOverlayPopup(nonconvexHintPopup);
    nonconvexHintPopup = null;
  };

  const scheduleNonconvexHint = () => {
    const state = getState();
    const polytope = VRep.fromPoints(state.vertices);
    const nonconvex = state.completionMode === "closed" && state.vertices.length >= 3 && !polytope.isConvex();
    if (!nonconvex || state.tourActive) {
      dismissNonconvexHint();
      return;
    }
    if (nonconvexHintShown || nonconvexHintTimer !== null || nonconvexHintPopup) {
      return;
    }
    nonconvexHintTimer = window.setTimeout(() => {
      nonconvexHintTimer = null;
      if (getState().tourActive || nonconvexHintPopup) {
        return;
      }
      nonconvexHintShown = true;
      nonconvexHintPopup = createOverlayPopup({
        id: "nonconvexHint",
        text: "Tip: double-click inside the polytope to replace it with its convex hull.",
        side: "left",
        gradient: "linear-gradient(135deg,#ff9966 0%,#ff5e62 100%)",
        onClose: dismissNonconvexHint,
      });
      showOverlayPopup(nonconvexHintPopup);
    }, 4000);
  };

  const dismiss = () => {
    if (helpOverlayTimer !== null) {
      clearTimeout(helpOverlayTimer);
      helpOverlayTimer = null;
    }
    dismissOverlayPopup(helpOverlayPopup);
    helpOverlayPopup = null;
  };

  const show = () => {
    if (running || helpOverlayPopup) {
      return;
    }
    helpOverlayShown = true;
    helpOverlayPopup = createOverlayPopup({
      id: "helpPopup",
      text: "Stuck? Try a random LP",
      side: "right",
      gradient: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      onClose: dismiss,
      onClick: () => {
        dismiss();
        void start();
      },
    });
    showOverlayPopup(helpOverlayPopup);
  };

  const scheduleIfNeeded = () => {
    const state = getState();
    if (state.objectiveVector !== null || state.tourActive || helpOverlayShown || helpOverlayTimer !== null) {
      return;
    }
    helpOverlayTimer = window.setTimeout(() => {
      helpOverlayTimer = null;
      show();
    }, TOUR_INACTIVITY_TIMEOUT_MS);
  };

  const reset = () => {
    dismiss();
    helpOverlayShown = false;
    scheduleIfNeeded();
  };

  const initialize = () => {
    if (initialized || tornDown) {
      return;
    }
    initialized = true;
    unsubscribeHelpOverlay = subscribe((state: State) => {
      const phase = computeDrawingPhase(state);
      if (state.objectiveVector !== null || state.tourActive) {
        dismiss();
        lastHelpPhase = phase;
        return;
      }
      if (lastHelpPhase !== phase) {
        dismiss();
      }
      scheduleIfNeeded();
      lastHelpPhase = phase;
    });
    handleBeforeUnload = () => {
      teardown();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    scheduleIfNeeded();
  };

  const teardown = () => {
    if (tornDown) {
      return;
    }
    tornDown = true;
    dismissNonconvexHint();
    dismiss();
    stop();
    unsubscribeHelpOverlay?.();
    unsubscribeHelpOverlay = null;
    if (handleBeforeUnload) {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload = null;
    }
  };

  return {
    initialize,
    scheduleNonconvexHint,
    reset,
    start,
    stop,
    teardown,
  };
}
