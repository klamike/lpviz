import type { TourActionTarget, TourUiController } from "@/types/tour";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";

export type { TourActionTarget, TourUiController } from "@/types/tour";

const POPUP_ANIMATION_MS = 300;

type PopupOptions = {
  id: "helpPopup" | "nonconvexHint";
  text: string;
  side: "left" | "right";
  gradient: string;
  onClick?: () => void;
  onClose?: () => void;
};

type PopupState = (PopupOptions & { visible: boolean; token: number }) | null;

type TourCursorState = {
  visible: boolean;
  x: number;
  y: number;
  clicking: boolean;
};

type TourContextValue = {
  controller: TourUiController;
  registerActionTarget: (
    target: TourActionTarget,
    element: HTMLElement | null,
  ) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

function TourCursor({ cursor }: { cursor: TourCursorState }) {
  return (
    <div
      id="tourCursor"
      className={[
        "tour-cursor",
        cursor.visible ? "is-visible" : "",
        cursor.clicking ? "is-clicking" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ left: cursor.x, top: cursor.y }}
      aria-hidden="true"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"
          fill="#4A90E2"
          stroke="#fff"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function OverlayPopup({ popup }: { popup: Exclude<PopupState, null> }) {
  return (
    <div
      id={popup.id}
      className={[
        "tour-popup",
        `tour-popup--${popup.side}`,
        popup.visible ? "is-visible" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ background: popup.gradient }}
      onClick={() => {
        popup.onClick?.();
      }}
    >
      <div className="tour-popup__content">
        <div className="tour-popup__text">{popup.text}</div>
        <button
          className="tour-popup__close"
          aria-label="Close"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            popup.onClose?.();
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function TourProvider({ children }: PropsWithChildren) {
  const actionTargetsRef = useRef<
    Partial<Record<TourActionTarget, HTMLElement>>
  >({});
  const popupTimersRef = useRef<{
    help: number | null;
    nonconvex: number | null;
  }>({
    help: null,
    nonconvex: null,
  });
  const popupTokenRef = useRef(0);
  const popupRafIdsRef = useRef<number[]>([]);
  const [helpPopup, setHelpPopup] = useState<PopupState>(null);
  const [nonconvexPopup, setNonconvexPopup] = useState<PopupState>(null);
  const [cursor, setCursor] = useState<TourCursorState>({
    visible: false,
    x: 0,
    y: 0,
    clicking: false,
  });

  useEffect(() => {
    return () => {
      if (popupTimersRef.current.help !== null) {
        clearTimeout(popupTimersRef.current.help);
      }
      if (popupTimersRef.current.nonconvex !== null) {
        clearTimeout(popupTimersRef.current.nonconvex);
      }
      popupRafIdsRef.current.forEach((rafId) => {
        cancelAnimationFrame(rafId);
      });
      popupRafIdsRef.current = [];
    };
  }, []);

  const registerActionTarget = useCallback(
    (target: TourActionTarget, element: HTMLElement | null) => {
      if (element) {
        actionTargetsRef.current[target] = element;
        return;
      }
      delete actionTargetsRef.current[target];
    },
    [],
  );

  const showPopup = useCallback(
    (kind: "help" | "nonconvex", popup: PopupOptions) => {
      const setPopup = kind === "help" ? setHelpPopup : setNonconvexPopup;
      const timer =
        kind === "help"
          ? popupTimersRef.current.help
          : popupTimersRef.current.nonconvex;
      if (timer !== null) {
        clearTimeout(timer);
        if (kind === "help") {
          popupTimersRef.current.help = null;
        } else {
          popupTimersRef.current.nonconvex = null;
        }
      }

      const token = ++popupTokenRef.current;
      setPopup({ ...popup, visible: false, token });
      const rafId = requestAnimationFrame(() => {
        setPopup((current) => {
          if (!current || current.token !== token) {
            return current;
          }
          return { ...current, visible: true };
        });
      });
      popupRafIdsRef.current.push(rafId);
    },
    [],
  );

  const hidePopup = useCallback((kind: "help" | "nonconvex") => {
    const setPopup = kind === "help" ? setHelpPopup : setNonconvexPopup;
    const currentTimer =
      kind === "help"
        ? popupTimersRef.current.help
        : popupTimersRef.current.nonconvex;
    if (currentTimer !== null) {
      clearTimeout(currentTimer);
      if (kind === "help") {
        popupTimersRef.current.help = null;
      } else {
        popupTimersRef.current.nonconvex = null;
      }
    }

    setPopup((current) => {
      if (!current) {
        return current;
      }
      const token = current.token;
      const timer = window.setTimeout(() => {
        setPopup((latest) =>
          latest && latest.token === token ? null : latest,
        );
        if (kind === "help") {
          popupTimersRef.current.help = null;
        } else {
          popupTimersRef.current.nonconvex = null;
        }
      }, POPUP_ANIMATION_MS);
      if (kind === "help") {
        popupTimersRef.current.help = timer;
      } else {
        popupTimersRef.current.nonconvex = timer;
      }
      return { ...current, visible: false };
    });
  }, []);

  const controller = useMemo<TourUiController>(
    () => ({
      getActionTarget(target) {
        return actionTargetsRef.current[target] ?? null;
      },
      showCursor() {
        setCursor((current) => ({ ...current, visible: true }));
      },
      hideCursor() {
        setCursor((current) => ({
          ...current,
          visible: false,
          clicking: false,
        }));
      },
      moveCursor(x, y) {
        setCursor((current) => ({ ...current, visible: true, x, y }));
      },
      setCursorClicking(clicking) {
        setCursor((current) => ({ ...current, clicking }));
      },
      showHelpPopup(options) {
        showPopup("help", {
          id: "helpPopup",
          side: "right",
          ...options,
        });
      },
      hideHelpPopup() {
        hidePopup("help");
      },
      showNonconvexHint(options) {
        showPopup("nonconvex", {
          id: "nonconvexHint",
          side: "left",
          ...options,
        });
      },
      hideNonconvexHint() {
        hidePopup("nonconvex");
      },
    }),
    [hidePopup, showPopup],
  );

  const contextValue = useMemo<TourContextValue>(
    () => ({
      controller,
      registerActionTarget,
    }),
    [controller, registerActionTarget],
  );

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="tour-layer" aria-hidden="true">
              <TourCursor cursor={cursor} />
              {nonconvexPopup ? <OverlayPopup popup={nonconvexPopup} /> : null}
              {helpPopup ? <OverlayPopup popup={helpPopup} /> : null}
            </div>,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}

export function useTourUiController() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("TourProvider is missing");
  }
  return context.controller;
}

export function useTourActionTarget<T extends HTMLElement = HTMLElement>(
  target: TourActionTarget,
) {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("TourProvider is missing");
  }

  return useCallback(
    (element: T | null) => {
      context.registerActionTarget(target, element);
    },
    [context, target],
  );
}
