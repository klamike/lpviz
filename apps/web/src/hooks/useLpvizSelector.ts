import { useRef, useSyncExternalStore } from "react";

import { getState, subscribe, type State } from "../state/lpvizStore";

export type LpvizSelector<T> = (state: State) => T;
export type LpvizEqualityFn<T> = (current: T, next: T) => boolean;

const subscribeToLpvizStore = (listener: () => void) =>
  subscribe(() => listener());

export function useLpvizSelector<T>(
  selector: LpvizSelector<T>,
  equalityFn: LpvizEqualityFn<T> = Object.is,
): T {
  const selectorRef = useRef(selector);
  const equalityFnRef = useRef(equalityFn);
  const cachedSelectionRef = useRef<T | null>(null);
  const hasCachedSelectionRef = useRef(false);

  selectorRef.current = selector;
  equalityFnRef.current = equalityFn;

  const getSelectedSnapshot = () => {
    const nextSelectedState = selectorRef.current(getState());

    if (
      hasCachedSelectionRef.current &&
      equalityFnRef.current(cachedSelectionRef.current as T, nextSelectedState)
    ) {
      return cachedSelectionRef.current as T;
    }

    cachedSelectionRef.current = nextSelectedState;
    hasCachedSelectionRef.current = true;
    return nextSelectedState;
  };

  return useSyncExternalStore(
    subscribeToLpvizStore,
    getSelectedSnapshot,
    getSelectedSnapshot,
  );
}
