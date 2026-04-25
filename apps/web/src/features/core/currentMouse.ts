import { useSyncExternalStore } from "react";
import type { PointXY } from "@lpviz/math/types";

let value: PointXY | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentMouse(): PointXY | null {
  return value;
}

export function setCurrentMouse(next: PointXY | null) {
  if (value === next) {
    return;
  }
  value = next;
  listeners.forEach((listener) => listener());
}

export function useCurrentMouse(): PointXY | null {
  return useSyncExternalStore(subscribe, getCurrentMouse, getCurrentMouse);
}
