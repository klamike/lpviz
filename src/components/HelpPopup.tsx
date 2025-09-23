import { Show, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { state } from "../state/state";
import { useGuidedTour } from "../context/GuidedTourContext";

interface HelpPopupProps {
  autoShowDelay?: number;
}

export function HelpPopup(props: HelpPopupProps) {
  const [isVisible, setIsVisible] = createSignal(false);
  const [hasShownPopup, setHasShownPopup] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);

  const guidedTour = useGuidedTour();
  let timer: number | null = null;
  let checkInterval: number | null = null;

  const showPopup = () => {
    if (hasShownPopup() || guidedTour?.isTouring()) return;
    setIsVisible(true);
    setHasShownPopup(true);
  };

  const hidePopup = () => {
    setIsVisible(false);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const startTour = () => {
    hidePopup();
    guidedTour?.startGuidedTour();
  };

  const startTimer = () => {
    if (hasShownPopup() || timer) return;

    timer = window.setTimeout(() => {
      if (state.objectiveVector === null && !guidedTour?.isTouring()) {
        showPopup();
      }
    }, props.autoShowDelay || 15000);

    checkInterval = window.setInterval(() => {
      if (state.objectiveVector !== null) {
        stopTimer();
      }
    }, 300);
  };

  const stopTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    hidePopup();
  };

  const resetTimer = () => {
    stopTimer();
    setHasShownPopup(false);
    startTimer();
  };

  onMount(() => {
    startTimer();
  });

  onCleanup(() => {
    stopTimer();
  });

  createEffect(() => {
    if (state.objectiveVector !== null) {
      stopTimer();
    }
  });

  return (
    <Portal>
      <Show when={isVisible()}>
        <div
          id="helpPopup"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            "border-radius": "12px",
            "box-shadow": "0 8px 32px rgba(0, 0, 0, 0.3)",
            "z-index": "9999",
            "font-family": "'JuliaMono', monospace",
            cursor: "pointer",
            transform: isHovered()
              ? "translateY(0) scale(1.02)"
              : "translateY(0) scale(1)",
            opacity: "1",
            transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            "backdrop-filter": "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (
              (e.target as HTMLElement)?.classList.contains("help-popup-close")
            )
              return;
            startTour();
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseMove={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            class="help-popup-content"
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              padding: "16px 20px",
              gap: "12px",
            }}
          >
            <div
              class="help-popup-text"
              style={{
                "font-size": "14px",
                "font-weight": "500",
                "line-height": "1.4",
              }}
            >
              Stuck? Try a random LP
            </div>
            <button
              class="help-popup-close"
              aria-label="Close"
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                border: "none",
                color: "white",
                width: "24px",
                height: "24px",
                "border-radius": "50%",
                cursor: "pointer",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                "font-size": "16px",
                "line-height": "1",
                transition: "background 0.2s ease",
                "flex-shrink": "0",
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                hidePopup();
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background =
                  "rgba(255, 255, 255, 0.3)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background =
                  "rgba(255, 255, 255, 0.2)";
              }}
            >
              ×
            </button>
          </div>
        </div>
      </Show>
    </Portal>
  );
}

export default HelpPopup;
