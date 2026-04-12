import { useEffect, useRef, useState } from "react";

import { getState, subscribe, type State } from "../state/store";

type EqualityFn<T> = (current: T, next: T) => boolean;

export function useLpvizStoreSelector<T>(
  selector: (state: State) => T,
  equalityFn: EqualityFn<T> = Object.is,
): T {
  const selectorRef = useRef(selector);
  const equalityFnRef = useRef(equalityFn);
  const [selectedState, setSelectedState] = useState(() => selector(getState()));

  selectorRef.current = selector;
  equalityFnRef.current = equalityFn;

  useEffect(() => {
    const updateSelectedState = (snapshot: State) => {
      const nextSelectedState = selectorRef.current(snapshot);
      setSelectedState((currentSelectedState) =>
        equalityFnRef.current(currentSelectedState, nextSelectedState) ? currentSelectedState : nextSelectedState,
      );
    };

    const unsubscribe = subscribe(updateSelectedState);
    updateSelectedState(getState());
    return unsubscribe;
  }, []);

  return selectedState;
}
