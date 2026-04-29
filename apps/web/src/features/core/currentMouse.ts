import type { PointXY } from "@lpviz/math/types";

let value: PointXY | null = null;
const listeners = new Set<() => void>();

export function subscribeCurrentMouse(listener: () => void) {
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
