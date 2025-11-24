import { useSyncExternalStore } from "react";
import { getState, subscribe, type State } from "../../state/store";

export function useStoreSelector<T>(selector: (state: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(getState())
  );
}
