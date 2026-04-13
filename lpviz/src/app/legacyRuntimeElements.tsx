import { createContext, createRef, useContext, useMemo, type PropsWithChildren, type RefObject } from "react";

export type LegacyRuntimeElements = {
  canvas: HTMLCanvasElement;
  shareButton: HTMLButtonElement;
  zoomButton: HTMLButtonElement;
  unzoomButton: HTMLButtonElement;
  toggle3DButton: HTMLButtonElement;
  toggleZOffsetButton: HTMLButtonElement;
  zScaleSlider: HTMLInputElement;
  sidebarHandle: HTMLDivElement;
  sidebar: HTMLDivElement;
  topResult: HTMLDivElement;
  nullStateMessage: HTMLDivElement;
  maximize: HTMLDivElement;
  objectiveDisplay: HTMLDivElement;
  subjectTo: HTMLDivElement;
  inequalities: HTMLDivElement;
  result: HTMLDivElement;
  resultVirtualHost: HTMLDivElement;
  iteratePathButton: HTMLButtonElement;
  ipmButton: HTMLButtonElement;
  simplexButton: HTMLButtonElement;
  pdhgButton: HTMLButtonElement;
  animateButton: HTMLButtonElement;
  startRotateObjectiveButton: HTMLButtonElement;
  stopRotateObjectiveButton: HTMLButtonElement;
  objectiveRotationSettings: HTMLDivElement;
};

export type LegacyRuntimeElementRefs = {
  [K in keyof LegacyRuntimeElements]: RefObject<LegacyRuntimeElements[K] | null>;
};

const LegacyRuntimeElementRefsContext = createContext<LegacyRuntimeElementRefs | null>(null);

export function LegacyRuntimeElementsProvider({ children }: PropsWithChildren) {
  const refs = useMemo<LegacyRuntimeElementRefs>(() => ({
    canvas: createRef<HTMLCanvasElement>(),
    shareButton: createRef<HTMLButtonElement>(),
    zoomButton: createRef<HTMLButtonElement>(),
    unzoomButton: createRef<HTMLButtonElement>(),
    toggle3DButton: createRef<HTMLButtonElement>(),
    toggleZOffsetButton: createRef<HTMLButtonElement>(),
    zScaleSlider: createRef<HTMLInputElement>(),
    sidebarHandle: createRef<HTMLDivElement>(),
    sidebar: createRef<HTMLDivElement>(),
    topResult: createRef<HTMLDivElement>(),
    nullStateMessage: createRef<HTMLDivElement>(),
    maximize: createRef<HTMLDivElement>(),
    objectiveDisplay: createRef<HTMLDivElement>(),
    subjectTo: createRef<HTMLDivElement>(),
    inequalities: createRef<HTMLDivElement>(),
    result: createRef<HTMLDivElement>(),
    resultVirtualHost: createRef<HTMLDivElement>(),
    iteratePathButton: createRef<HTMLButtonElement>(),
    ipmButton: createRef<HTMLButtonElement>(),
    simplexButton: createRef<HTMLButtonElement>(),
    pdhgButton: createRef<HTMLButtonElement>(),
    animateButton: createRef<HTMLButtonElement>(),
    startRotateObjectiveButton: createRef<HTMLButtonElement>(),
    stopRotateObjectiveButton: createRef<HTMLButtonElement>(),
    objectiveRotationSettings: createRef<HTMLDivElement>(),
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
