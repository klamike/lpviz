import { createContext, createRef, useContext, useMemo, type PropsWithChildren, type RefObject } from "react";

export type LegacyRuntimeElements = {
  canvas: HTMLCanvasElement;
};

export type LegacyRuntimeElementRefs = {
  [K in keyof LegacyRuntimeElements]: RefObject<LegacyRuntimeElements[K] | null>;
};

const LegacyRuntimeElementRefsContext = createContext<LegacyRuntimeElementRefs | null>(null);

export function LegacyRuntimeElementsProvider({ children }: PropsWithChildren) {
  const refs = useMemo<LegacyRuntimeElementRefs>(() => ({
    canvas: createRef<HTMLCanvasElement>(),
  }), []);

  return <LegacyRuntimeElementRefsContext.Provider value={refs}>{children}</LegacyRuntimeElementRefsContext.Provider>;
}

export function useLegacyRuntimeElementRefs() {
  const refs = useContext(LegacyRuntimeElementRefsContext);
  if (!refs) {
    throw new Error("LegacyRuntimeElementsProvider is missing");
  }
  return refs;
}
