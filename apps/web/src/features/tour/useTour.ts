import {
  computeDrawingPhase,
  getState,
  setState,
  subscribe,
  type DrawingPhase,
  type State,
} from "@/features/core/store";
import { setCurrentMouse } from "@/features/core/currentMouse";
import type { TourActionTarget, TourUiController } from "@/features/tour/types";
import type { ViewportApi } from "@/features/viewport/runtime";
import type { PointXY } from "@lpviz/math/types";
import { VRep } from "@lpviz/math/geometry";
import { useEffect, useMemo, useRef } from "react";
import { useLatest } from "@/hooks/useLatest";

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
  | { type: "run-action"; target: TourActionTarget };

export type TourActions = {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  scheduleNonconvexHint: () => void;
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

const delay = (ms = TOUR_DEFAULT_DELAY_MS) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useTour({
  canvasManager,
  ui,
  saveHistory,
  sendPolytope,
  runAction,
}: {
  canvasManager: ViewportApi | null;
  ui: TourUiController;
  saveHistory: () => void;
  sendPolytope: () => void;
  runAction: (target: TourActionTarget) => void;
}): TourActions {
  const canvasManagerRef = useLatest<ViewportApi | null>(canvasManager);
  const uiRef = useLatest(ui);
  const saveHistoryRef = useLatest(saveHistory);
  const sendPolytopeRef = useLatest(sendPolytope);
  const runActionRef = useLatest(runAction);

  const runningRef = useRef(false);
  const clickBlockerRef = useRef<((event: Event) => void) | null>(null);
  const nonconvexHintTimerRef = useRef<number | null>(null);
  const nonconvexHintShownRef = useRef(false);
  const helpOverlayTimerRef = useRef<number | null>(null);
  const helpOverlayShownRef = useRef(false);

  const logicalToScreen = (point: PointXY) => {
    const cm = canvasManagerRef.current;
    if (!cm) return { x: 0, y: 0 };
    const rect = cm.getCanvasRect();
    const canvasPoint = cm.toCanvasCoords(point.x, point.y);
    return { x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y };
  };

  const setClickBlocker = (enabled: boolean) => {
    if (enabled) {
      if (clickBlockerRef.current) return;
      const handler = (event: Event) => {
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
      clickBlockerRef.current = handler;
      ["click", "mousedown", "mouseup"].forEach((eventName) => {
        document.addEventListener(eventName, handler, true);
      });
      return;
    }

    const existing = clickBlockerRef.current;
    if (!existing) return;
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      document.removeEventListener(eventName, existing, true);
    });
    clickBlockerRef.current = null;
  };

  const moveCursorToScreen = async (x: number, y: number) => {
    uiRef.current.moveCursor(x, y);
    await delay(TOUR_CURSOR_TRANSITION_MS);
  };

  const moveCursorToPoint = async (point: PointXY) => {
    const screenPoint = logicalToScreen(point);
    await moveCursorToScreen(screenPoint.x, screenPoint.y);
  };

  const animateCursorClick = async () => {
    uiRef.current.setCursorClicking(true);
    await delay(TOUR_CURSOR_CLICK_ANIMATION_MS);
    uiRef.current.setCursorClicking(false);
  };

  const resetWorkspace = () => {
    setState({
      vertices: [],
      completionMode: "draft",
      interiorPoint: null,
      objectiveVector: null,
      currentObjective: null,
    });
    setCurrentMouse(null);
    canvasManagerRef.current?.draw();
  };

  const clickPoint = async (point: PointXY, apply: () => void) => {
    await moveCursorToPoint(point);
    await animateCursorClick();
    apply();
    await delay(TOUR_CLICK_AT_POINT_DELAY_MS);
  };

  const clickActionTarget = async (target: TourActionTarget) => {
    const element = uiRef.current.getActionTarget(target);
    if (element) {
      const rect = element.getBoundingClientRect();
      await moveCursorToScreen(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    }
    await animateCursorClick();
    runActionRef.current(target);
    await delay(TOUR_BUTTON_CLICK_DELAY_MS);
  };

  const runStep = async (step: TourStep) => {
    const cm = canvasManagerRef.current;
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
        saveHistoryRef.current();
        setState({ vertices: [...getState().vertices, step.point], completionMode: "draft" });
        cm?.draw();
        sendPolytopeRef.current();
      });
      return;
    }
    if (step.type === "set-objective") {
      await clickPoint(step.point, () => {
        saveHistoryRef.current();
        setState({ objectiveVector: step.point });
        cm?.draw();
      });
      return;
    }
    await clickPoint(step.point, () => {
      saveHistoryRef.current();
      setState({ completionMode: "closed", interiorPoint: step.point });
      cm?.draw();
      sendPolytopeRef.current();
    });
  };

  const stop = () => {
    runningRef.current = false;
    uiRef.current.hideCursor();
    setClickBlocker(false);
    setState({ currentObjective: null, tourActive: false });
    setCurrentMouse(null);
    canvasManagerRef.current?.draw();
  };

  const start = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ tourActive: true });
    setClickBlocker(true);
    resetWorkspace();
    uiRef.current.showCursor();

    const script = buildScript(generatePentagon(), generateObjective());
    try {
      for (const step of script) {
        if (!runningRef.current) break;
        await runStep(step);
        if (!runningRef.current) break;
        await delay(TOUR_STEP_PAUSE_MS);
      }
    } finally {
      stop();
    }
  };

  const dismissNonconvexHint = () => {
    nonconvexHintShownRef.current = false;
    if (nonconvexHintTimerRef.current !== null) {
      clearTimeout(nonconvexHintTimerRef.current);
      nonconvexHintTimerRef.current = null;
    }
    uiRef.current.hideNonconvexHint();
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
    if (
      nonconvexHintShownRef.current ||
      nonconvexHintTimerRef.current !== null
    ) {
      return;
    }
    nonconvexHintTimerRef.current = window.setTimeout(() => {
      nonconvexHintTimerRef.current = null;
      if (getState().tourActive) return;
      nonconvexHintShownRef.current = true;
      uiRef.current.showNonconvexHint({
        text: "Tip: double-click inside the polytope to replace it with its convex hull.",
        gradient: "linear-gradient(135deg,#ff9966 0%,#ff5e62 100%)",
        onClose: dismissNonconvexHint,
      });
    }, 4000);
  };

  const dismissHelpOverlay = () => {
    if (helpOverlayTimerRef.current !== null) {
      clearTimeout(helpOverlayTimerRef.current);
      helpOverlayTimerRef.current = null;
    }
    uiRef.current.hideHelpPopup();
  };

  const showHelpOverlay = () => {
    if (runningRef.current || helpOverlayShownRef.current) return;
    helpOverlayShownRef.current = true;
    uiRef.current.showHelpPopup({
      text: "Stuck? Try a random LP",
      gradient: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      onClose: dismissHelpOverlay,
      onClick: () => {
        dismissHelpOverlay();
        void start();
      },
    });
  };

  const scheduleHelpOverlayIfNeeded = () => {
    const state = getState();
    if (
      state.objectiveVector !== null ||
      state.tourActive ||
      helpOverlayShownRef.current ||
      helpOverlayTimerRef.current !== null
    ) {
      return;
    }
    helpOverlayTimerRef.current = window.setTimeout(() => {
      helpOverlayTimerRef.current = null;
      showHelpOverlay();
    }, TOUR_INACTIVITY_TIMEOUT_MS);
  };

  const reset = () => {
    dismissHelpOverlay();
    helpOverlayShownRef.current = false;
    scheduleHelpOverlayIfNeeded();
  };

  useEffect(() => {
    let lastHelpPhase: DrawingPhase | null = null;
    const unsubscribe = subscribe((state: State) => {
      const phase = computeDrawingPhase(state);
      if (state.objectiveVector !== null || state.tourActive) {
        dismissHelpOverlay();
        lastHelpPhase = phase;
        return;
      }
      if (lastHelpPhase !== phase) {
        dismissHelpOverlay();
      }
      scheduleHelpOverlayIfNeeded();
      lastHelpPhase = phase;
    });
    const handleBeforeUnload = () => {
      dismissNonconvexHint();
      dismissHelpOverlay();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    scheduleHelpOverlayIfNeeded();

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      dismissNonconvexHint();
      dismissHelpOverlay();
      runningRef.current = false;
      setClickBlocker(false);
    };
  }, []);

  return { start, stop, reset, scheduleNonconvexHint };
}
