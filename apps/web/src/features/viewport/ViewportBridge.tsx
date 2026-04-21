import type { R3FViewportBridge } from "@/features/viewport";
import { createContext, useContext } from "react";

export type ViewportBridgeSetter = (bridge: R3FViewportBridge | null) => void;

export const ViewportBridgeSetterContext =
  createContext<ViewportBridgeSetter | null>(null);

export function useViewportBridgeSetter(): ViewportBridgeSetter {
  const setter = useContext(ViewportBridgeSetterContext);
  if (!setter) {
    throw new Error("LpvizProvider is missing");
  }
  return setter;
}
