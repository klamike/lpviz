import {
  createContext,
  createSignal,
  onCleanup,
  ParentComponent,
  useContext,
} from "solid-js";
import { state } from "../state/state";
import {
  hideNullStateMessage,
  updateSolverButtonStates,
  updateZoomButtonStates,
} from "../state/uiActions";
import { CanvasManager } from "../ui/canvasManager";

interface AnimatedCursor {
  x: number;
  y: number;
  element: HTMLElement;
}

interface TourStep {
  action: "click" | "wait" | "select-solver" | "click-button" | "click-close";
  target?: string | { x: number; y: number };
  duration?: number;
  description?: string;
}

interface GuidedTourContextType {
  startGuidedTour: () => Promise<void>;
  stopTour: () => void;
  isTouring: () => boolean;
}

const GuidedTourContext = createContext<GuidedTourContextType>();

export function useGuidedTour() {
  const context = useContext(GuidedTourContext);
  if (!context) {
    throw new Error("useGuidedTour must be used within a GuidedTourProvider");
  }
  return context;
}

interface GuidedTourProviderProps {
  canvasManager: CanvasManager;
  sendPolytope: () => void;
  saveToHistory: () => void;
}

export const GuidedTourProvider: ParentComponent<GuidedTourProviderProps> = (
  props,
) => {
  const [isRunning, setIsRunning] = createSignal(false);

  let animatedCursor: AnimatedCursor | null = null;
  let globalClickBlocker: ((e: Event) => void) | null = null;
  let allowNextClick = false;

  const createAnimatedCursor = (): void => {
    const cursor = document.createElement("div");
    cursor.id = "guidedTourCursor";
    cursor.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"
              fill="#4A90E2" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    `;
    cursor.style.cssText = `
      position: fixed;
      z-index: 10000;
      width: 24px;
      height: 24px;
      pointer-events: none;
      transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      transform: translate(-25%, -25%);
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));
    `;
    document.body.appendChild(cursor);

    animatedCursor = {
      x: 0,
      y: 0,
      element: cursor,
    };
  };

  const removeAnimatedCursor = (): void => {
    if (animatedCursor) {
      animatedCursor.element.remove();
      animatedCursor = null;
    }
  };

  const moveCursorTo = (x: number, y: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!animatedCursor) return resolve();

      animatedCursor.x = x;
      animatedCursor.y = y;
      animatedCursor.element.style.left = `${x}px`;
      animatedCursor.element.style.top = `${y}px`;

      setTimeout(resolve, 800);
    });
  };

  const generateNicePolytope = (): { x: number; y: number }[] => {
    const centerX = 0;
    const centerY = 0;
    const baseRadius = 10;
    const vertices: { x: number; y: number }[] = [];

    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const radiusVariation = 0.8 + Math.random() * 0.4;
      const radius = baseRadius * radiusVariation;
      const angleVariation = (Math.random() - 0.5) * 0.3;

      vertices.push({
        x: centerX + radius * Math.cos(angle + angleVariation),
        y: centerY + radius * Math.sin(angle + angleVariation),
      });
    }

    return vertices;
  };

  const generateRandomObjective = (): { x: number; y: number } => {
    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
    const magnitude = 6 + Math.random() * 8;

    return {
      x: magnitude * Math.cos(angle),
      y: magnitude * Math.sin(angle),
    };
  };

  const logicalToScreenCoords = (
    logicalX: number,
    logicalY: number,
  ): { x: number; y: number } => {
    const canvas = props.canvasManager.canvas;
    const rect = canvas.getBoundingClientRect();

    const screenX =
      props.canvasManager.centerX +
      (logicalX + props.canvasManager.offset.x) *
        props.canvasManager.gridSpacing *
        props.canvasManager.scaleFactor;
    const screenY =
      props.canvasManager.centerY -
      (logicalY + props.canvasManager.offset.y) *
        props.canvasManager.gridSpacing *
        props.canvasManager.scaleFactor;

    return {
      x: rect.left + screenX,
      y: rect.top + screenY,
    };
  };

  const performClickAnimation = async (): Promise<void> => {
    if (!animatedCursor) return;

    return new Promise((resolve) => {
      animatedCursor!.element.style.transform =
        "translate(-25%, -25%) scale(2.4)";
      animatedCursor!.element.style.filter =
        "drop-shadow(2px 2px 8px rgba(74, 144, 226, 0.6))";

      setTimeout(() => {
        if (animatedCursor) {
          animatedCursor.element.style.transform =
            "translate(-25%, -25%) scale(0.9)";

          setTimeout(() => {
            if (animatedCursor) {
              animatedCursor.element.style.transform =
                "translate(-25%, -25%) scale(1)";
              animatedCursor.element.style.filter =
                "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))";
              resolve();
            }
          }, 80);
        }
      }, 120);
    });
  };

  const addGlobalClickBlocker = (): void => {
    globalClickBlocker = (e: Event) => {
      if (allowNextClick) {
        allowNextClick = false;
        return;
      }

      const target = e.target as HTMLElement;
      if (target?.id === "guidedTourCursor" || target?.closest("#helpPopup")) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    document.addEventListener("click", globalClickBlocker, true);
    document.addEventListener("mousedown", globalClickBlocker, true);
    document.addEventListener("mouseup", globalClickBlocker, true);
  };

  const removeGlobalClickBlocker = (): void => {
    if (globalClickBlocker) {
      document.removeEventListener("click", globalClickBlocker, true);
      document.removeEventListener("mousedown", globalClickBlocker, true);
      document.removeEventListener("mouseup", globalClickBlocker, true);
      globalClickBlocker = null;
    }
  };

  const executeStep = async (step: TourStep): Promise<void> => {
    switch (step.action) {
      case "click":
        if (
          typeof step.target === "object" &&
          "x" in step.target &&
          "y" in step.target
        ) {
          const screenCoords = logicalToScreenCoords(
            step.target.x,
            step.target.y,
          );
          await moveCursorTo(screenCoords.x, screenCoords.y);
          await performClickAnimation();

          props.saveToHistory();
          if (!state.polygonComplete) {
            state.vertices.push(step.target);
            hideNullStateMessage();
            props.canvasManager.draw();
            updateZoomButtonStates(props.canvasManager);
            props.sendPolytope();
          } else if (state.objectiveVector === null) {
            state.objectiveVector = step.target;
            state.uiButtons["traceButton"] = true;
            state.uiButtons["zoomButton"] = true;
            updateSolverButtonStates();
            props.canvasManager.draw();
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        break;
      case "click-close":
        if (
          typeof step.target === "object" &&
          "x" in step.target &&
          "y" in step.target
        ) {
          const screenCoords = logicalToScreenCoords(
            step.target.x,
            step.target.y,
          );
          await moveCursorTo(screenCoords.x, screenCoords.y);
          await performClickAnimation();

          props.saveToHistory();
          state.polygonComplete = true;
          state.interiorPoint = step.target;
          props.canvasManager.draw();
          props.sendPolytope();
          state.uiButtons["ipmButton"] = true;
          state.uiButtons["simplexButton"] = true;
          state.uiButtons["pdhgButton"] = true;
          state.uiButtons["iteratePathButton"] = false;
          state.uiButtons["traceButton"] = true;
          state.uiButtons["zoomButton"] = true;
          updateSolverButtonStates();

          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        break;
      case "click-button":
        if (typeof step.target === "string") {
          const button = document.getElementById(
            step.target,
          ) as HTMLButtonElement;
          if (button) {
            const rect = button.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            await moveCursorTo(centerX, centerY);
            await performClickAnimation();

            allowNextClick = true;
            button.click();

            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        break;
      case "select-solver":
        break;
      case "wait":
        await new Promise((resolve) =>
          setTimeout(resolve, step.duration || 1000),
        );
        break;
    }
  };

  const startGuidedTour = async (): Promise<void> => {
    if (isRunning()) return;

    setIsRunning(true);
    addGlobalClickBlocker();

    // Reset state
    state.vertices = [];
    state.polygonComplete = false;
    state.interiorPoint = null;
    state.objectiveVector = null;
    state.currentMouse = null;
    state.currentObjective = null;

    state.uiButtons["ipmButton"] = false;
    state.uiButtons["simplexButton"] = false;
    state.uiButtons["pdhgButton"] = false;
    state.uiButtons["iteratePathButton"] = false;
    state.uiButtons["traceButton"] = false;
    state.uiButtons["zoomButton"] = true;

    updateSolverButtonStates();
    props.canvasManager.draw();

    const nicePolytope = generateNicePolytope();
    const randomObjective = generateRandomObjective();

    const tourSteps: TourStep[] = [
      { action: "wait", duration: 500 },
      ...nicePolytope.map((vertex) => ({
        action: "click" as const,
        target: vertex,
      })),
      { action: "click-close", target: { x: 0, y: 0 } },
      { action: "wait", duration: 1000 },
      { action: "click", target: randomObjective },
      { action: "wait", duration: 1000 },
      { action: "click-button", target: "ipmButton" },
      { action: "wait", duration: 750 },
      { action: "click-button", target: "traceButton" },
      { action: "wait", duration: 750 },
      { action: "click-button", target: "toggle3DButton" },
      { action: "wait", duration: 750 },
      { action: "click-button", target: "startRotateObjectiveButton" },
      { action: "wait", duration: 2000 },
      { action: "click-button", target: "iteratePathButton" },
      { action: "wait", duration: 1500 },
      { action: "click-button", target: "traceCheckbox" },
    ];

    createAnimatedCursor();

    try {
      for (let i = 0; i < tourSteps.length && isRunning(); i++) {
        await executeStep(tourSteps[i]);

        if (!isRunning()) break;

        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } finally {
      removeAnimatedCursor();
      removeGlobalClickBlocker();
      setIsRunning(false);
    }
  };

  const stopTour = (): void => {
    setIsRunning(false);
    removeGlobalClickBlocker();
    removeAnimatedCursor();

    state.currentMouse = null;
    state.currentObjective = null;
    props.canvasManager.draw();
  };

  onCleanup(() => {
    stopTour();
  });

  const contextValue: GuidedTourContextType = {
    startGuidedTour,
    stopTour,
    isTouring: isRunning,
  };

  return (
    <GuidedTourContext.Provider value={contextValue}>
      {props.children}
    </GuidedTourContext.Provider>
  );
};

export default GuidedTourProvider;
