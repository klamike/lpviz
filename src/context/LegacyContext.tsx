import { JSX, ParentProps, createContext, useContext } from "solid-js";
import type { LegacyHandles } from "../legacy/legacyMain";

const LegacyContext = createContext<LegacyHandles | null>(null);

export function LegacyProvider(props: ParentProps<{ value: LegacyHandles }>): JSX.Element {
  return (
    <LegacyContext.Provider value={props.value}>
      {props.children}
    </LegacyContext.Provider>
  );
}

export function useLegacy(): LegacyHandles {
  const ctx = useContext(LegacyContext);
  if (!ctx) {
    throw new Error(
      "Legacy context is unavailable. Did you call initializeLegacyApplication()?",
    );
  }
  return ctx;
}
