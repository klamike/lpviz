import type { TourActionTarget, TourUiController } from "@/types/tour";
import { createContext, useCallback, useContext } from "react";

export type { TourActionTarget, TourUiController } from "@/types/tour";

export type TourContextValue = {
  controller: TourUiController;
  registerActionTarget: (
    target: TourActionTarget,
    element: HTMLElement | null,
  ) => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

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
