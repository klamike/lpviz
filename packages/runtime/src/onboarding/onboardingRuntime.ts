import type { PointXY } from "@lpviz/math";
import { VRep } from "@lpviz/polytope";
import {
  computeDrawingPhase,
  getState,
  mutate,
  setState,
  subscribe,
  type DrawingPhase,
  type State,
} from "@lpviz/state";
import type { ViewportApi } from "@lpviz/viewport";
import type {
  OnboardingActionTarget,
  OnboardingUiController,
} from "../uiContracts";

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
  | { type: "run-action"; target: OnboardingActionTarget };

export function createOnboardingRuntime({
  canvasManager,
  ui,
  saveHistory,
  sendPolytope,
  runAction,
}: {
  canvasManager: ViewportApi;
  ui: OnboardingUiController;
  saveHistory: () => void;
  sendPolytope: () => void;
  runAction: (target: OnboardingActionTarget) => void;
}) {
  let running = false;
  let clickBlocker: ((event: Event) => void) | null = null;
  let nonconvexHintTimer: number | null = null;
  let nonconvexHintShown = false;
  let helpOverlayTimer: number | null = null;
  let helpOverlayShown = false;
  let lastHelpPhase: DrawingPhase | null = null;
  let initialized = false;
  let tornDown = false;
  let unsubscribeHelpOverlay: (() => void) | null = null;
  let handleBeforeUnload: (() => void) | null = null;

  const delay = (ms = TOUR_DEFAULT_DELAY_MS) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const logicalToScreen = (point: { x: number; y: number }) => {
    const rect = canvasManager.getCanvasRect();
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
    steps.push({ type: "run-action", target: "activate-ipm" });
    steps.push({ type: "wait", duration: 750 });
    steps.push({ type: "run-action", target: "toggle-3d" });
    steps.push({ type: "wait", duration: 750 });
    steps.push({ type: "run-action", target: "start-rotation" });
    steps.push({ type: "wait", duration: 2000 });
    steps.push({ type: "run-action", target: "activate-central" });
    steps.push({ type: "wait", duration: 1500 });
    steps.push({ type: "run-action", target: "toggle-trace" });
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
        const target = event.target as HTMLElement;
        if (
          target?.id === "tourCursor" ||
          target?.closest("#helpPopup") ||
          target?.closest("#nonconvexHint")
        ) {
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
    ui.showCursor();
  };

  const moveCursorToScreen = async (x: number, y: number) => {
    ui.moveCursor(x, y);
    await delay(TOUR_CURSOR_TRANSITION_MS);
  };

  const moveCursorToPoint = async (point: PointXY) => {
    const screenPoint = logicalToScreen(point);
    await moveCursorToScreen(screenPoint.x, screenPoint.y);
  };

  const animateCursorClick = async () => {
    ui.setCursorClicking(true);
    await delay(TOUR_CURSOR_CLICK_ANIMATION_MS);
    ui.setCursorClicking(false);
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

  const clickActionTarget = async (target: OnboardingActionTarget) => {
    const element = ui.getActionTarget(target);
    if (element) {
      const rect = element.getBoundingClientRect();
      await moveCursorToScreen(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    }
    await animateCursorClick();
    runAction(target);
    await delay(TOUR_BUTTON_CLICK_DELAY_MS);
  };

  const runStep = async (step: TourStep) => {
    if (step.type === "wait") {
      await delay(step.duration);
      return;
    }
    if (step.type === "run-action") {
      await clickActionTarget(step.target);
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
    ui.hideCursor();
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

  const dismissNonconvexHint = () => {
    nonconvexHintShown = false;
    if (nonconvexHintTimer !== null) {
      clearTimeout(nonconvexHintTimer);
      nonconvexHintTimer = null;
    }
    ui.hideNonconvexHint();
  };

  const scheduleNonconvexHint = () => {
    const state = getState();
    const polytope = VRep.fromPoints(state.vertices);
    const nonconvex =
      state.completionMode === "closed" &&
      state.vertices.length >= 3 &&
      !polytope.isConvex();
    if (!nonconvex || state.tourActive) {
      dismissNonconvexHint();
      return;
    }
    if (nonconvexHintShown || nonconvexHintTimer !== null) {
      return;
    }
    nonconvexHintTimer = window.setTimeout(() => {
      nonconvexHintTimer = null;
      if (getState().tourActive) {
        return;
      }
      nonconvexHintShown = true;
      ui.showNonconvexHint({
        text: "Tip: double-click inside the polytope to replace it with its convex hull.",
        gradient: "linear-gradient(135deg,#ff9966 0%,#ff5e62 100%)",
        onClose: dismissNonconvexHint,
      });
    }, 4000);
  };

  const dismiss = () => {
    if (helpOverlayTimer !== null) {
      clearTimeout(helpOverlayTimer);
      helpOverlayTimer = null;
    }
    ui.hideHelpPopup();
  };

  const show = () => {
    if (running || helpOverlayShown) {
      return;
    }
    helpOverlayShown = true;
    ui.showHelpPopup({
      text: "Stuck? Try a random LP",
      gradient: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      onClose: dismiss,
      onClick: () => {
        dismiss();
        void start();
      },
    });
  };

  const scheduleIfNeeded = () => {
    const state = getState();
    if (
      state.objectiveVector !== null ||
      state.tourActive ||
      helpOverlayShown ||
      helpOverlayTimer !== null
    ) {
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
