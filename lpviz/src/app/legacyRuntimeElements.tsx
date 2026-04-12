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
  replaySpeedSlider: HTMLInputElement;
  topResult: HTMLDivElement;
  nullStateMessage: HTMLDivElement;
  maximize: HTMLDivElement;
  objectiveDisplay: HTMLDivElement;
  subjectTo: HTMLDivElement;
  inequalities: HTMLDivElement;
  result: HTMLDivElement;
  iteratePathButton: HTMLButtonElement;
  ipmButton: HTMLButtonElement;
  simplexButton: HTMLButtonElement;
  simplexDualMode: HTMLInputElement;
  pdhgButton: HTMLButtonElement;
  animateButton: HTMLButtonElement;
  startRotateObjectiveButton: HTMLButtonElement;
  stopRotateObjectiveButton: HTMLButtonElement;
  traceCheckbox: HTMLInputElement;
  objectiveRotationSettings: HTMLDivElement;
  alphaMaxSlider: HTMLInputElement;
  correctorThresholdSlider: HTMLInputElement;
  ipmColorByPhase: HTMLInputElement;
  pdhgEtaSlider: HTMLInputElement;
  pdhgTauSlider: HTMLInputElement;
  centralPathIterSlider: HTMLInputElement;
  objectiveAngleStepSlider: HTMLInputElement;
  objectiveRotationSpeedSlider: HTMLInputElement;
  maxitInput: HTMLInputElement;
  maxitInputPDHG: HTMLInputElement;
  pdhgIneqMode: HTMLInputElement;
  pdhgHalpernMode: HTMLInputElement;
  pdhgColorByBasis: HTMLInputElement;
  alphaMaxValue: HTMLSpanElement;
  correctorThresholdValue: HTMLSpanElement;
  pdhgEtaValue: HTMLSpanElement;
  pdhgTauValue: HTMLSpanElement;
  centralPathIterValue: HTMLSpanElement;
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
    replaySpeedSlider: createRef<HTMLInputElement>(),
    topResult: createRef<HTMLDivElement>(),
    nullStateMessage: createRef<HTMLDivElement>(),
    maximize: createRef<HTMLDivElement>(),
    objectiveDisplay: createRef<HTMLDivElement>(),
    subjectTo: createRef<HTMLDivElement>(),
    inequalities: createRef<HTMLDivElement>(),
    result: createRef<HTMLDivElement>(),
    iteratePathButton: createRef<HTMLButtonElement>(),
    ipmButton: createRef<HTMLButtonElement>(),
    simplexButton: createRef<HTMLButtonElement>(),
    simplexDualMode: createRef<HTMLInputElement>(),
    pdhgButton: createRef<HTMLButtonElement>(),
    animateButton: createRef<HTMLButtonElement>(),
    startRotateObjectiveButton: createRef<HTMLButtonElement>(),
    stopRotateObjectiveButton: createRef<HTMLButtonElement>(),
    traceCheckbox: createRef<HTMLInputElement>(),
    objectiveRotationSettings: createRef<HTMLDivElement>(),
    alphaMaxSlider: createRef<HTMLInputElement>(),
    correctorThresholdSlider: createRef<HTMLInputElement>(),
    ipmColorByPhase: createRef<HTMLInputElement>(),
    pdhgEtaSlider: createRef<HTMLInputElement>(),
    pdhgTauSlider: createRef<HTMLInputElement>(),
    centralPathIterSlider: createRef<HTMLInputElement>(),
    objectiveAngleStepSlider: createRef<HTMLInputElement>(),
    objectiveRotationSpeedSlider: createRef<HTMLInputElement>(),
    maxitInput: createRef<HTMLInputElement>(),
    maxitInputPDHG: createRef<HTMLInputElement>(),
    pdhgIneqMode: createRef<HTMLInputElement>(),
    pdhgHalpernMode: createRef<HTMLInputElement>(),
    pdhgColorByBasis: createRef<HTMLInputElement>(),
    alphaMaxValue: createRef<HTMLSpanElement>(),
    correctorThresholdValue: createRef<HTMLSpanElement>(),
    pdhgEtaValue: createRef<HTMLSpanElement>(),
    pdhgTauValue: createRef<HTMLSpanElement>(),
    centralPathIterValue: createRef<HTMLSpanElement>(),
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
