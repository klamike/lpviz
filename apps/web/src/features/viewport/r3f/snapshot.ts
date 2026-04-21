import { useSyncExternalStore } from "react";

import {
  DEFAULT_VIEWPORT_RENDER_SNAPSHOT,
  type ViewportRenderSnapshot,
} from "../types";

let snapshot = DEFAULT_VIEWPORT_RENDER_SNAPSHOT;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

export function setViewportRenderSnapshot(next: ViewportRenderSnapshot) {
  snapshot = next;
  emit();
}

export function resetViewportRenderSnapshot() {
  snapshot = DEFAULT_VIEWPORT_RENDER_SNAPSHOT;
  emit();
}

export function subscribeViewportRenderSnapshot(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getViewportRenderSnapshot() {
  return snapshot;
}

export function useViewportRenderSnapshot() {
  return useSyncExternalStore(
    subscribeViewportRenderSnapshot,
    getViewportRenderSnapshot,
    getViewportRenderSnapshot,
  );
}
