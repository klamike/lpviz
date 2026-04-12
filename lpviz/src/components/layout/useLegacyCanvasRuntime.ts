import { useEffect, type RefObject } from "react";

import { type LegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { initializeUI } from "../../ui/interaction/initialize";

const noop = () => {};

const getRequiredElement = <T extends HTMLElement>(ref: RefObject<T | null>, id: string): T => {
  const element = ref.current;
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

export function useLegacyCanvasRuntime(runtimeElementRefs: LegacyRuntimeElementRefs) {
  const {
    canvas,
    shareButton,
    zoomButton,
    unzoomButton,
    toggle3DButton,
    toggleZOffsetButton,
    zScaleSlider,
    sidebarHandle,
    sidebar,
    replaySpeedSlider,
    topResult,
    nullStateMessage,
    maximize,
    objectiveDisplay,
    subjectTo,
    inequalities,
    result,
    iteratePathButton,
    ipmButton,
    simplexButton,
    simplexDualMode,
    pdhgButton,
    animateButton,
    startRotateObjectiveButton,
    stopRotateObjectiveButton,
    traceCheckbox,
    objectiveRotationSettings,
    alphaMaxSlider,
    correctorThresholdSlider,
    ipmColorByPhase,
    pdhgEtaSlider,
    pdhgTauSlider,
    centralPathIterSlider,
    objectiveAngleStepSlider,
    objectiveRotationSpeedSlider,
    maxitInput,
    maxitInputPDHG,
    pdhgIneqMode,
    pdhgHalpernMode,
    pdhgColorByBasis,
    alphaMaxValue,
    correctorThresholdValue,
    pdhgEtaValue,
    pdhgTauValue,
    centralPathIterValue,
  } = runtimeElementRefs;

  useEffect(() => {
    const runtimeElements = {
      canvas: getRequiredElement(canvas, "gridCanvas"),
      shareButton: getRequiredElement(shareButton, "shareButton"),
      zoomButton: getRequiredElement(zoomButton, "zoomButton"),
      unzoomButton: getRequiredElement(unzoomButton, "unzoomButton"),
      toggle3DButton: getRequiredElement(toggle3DButton, "toggle3DButton"),
      toggleZOffsetButton: getRequiredElement(toggleZOffsetButton, "toggleZOffsetButton"),
      zScaleSlider: getRequiredElement(zScaleSlider, "zScaleSlider"),
      sidebarHandle: getRequiredElement(sidebarHandle, "sidebarHandle"),
      sidebar: getRequiredElement(sidebar, "sidebar"),
      replaySpeedSlider: getRequiredElement(replaySpeedSlider, "replaySpeedSlider"),
      topResult: getRequiredElement(topResult, "topResult"),
      nullStateMessage: getRequiredElement(nullStateMessage, "nullStateMessage"),
      maximize: getRequiredElement(maximize, "maximize"),
      objectiveDisplay: getRequiredElement(objectiveDisplay, "objectiveDisplay"),
      subjectTo: getRequiredElement(subjectTo, "subjectTo"),
      inequalities: getRequiredElement(inequalities, "inequalities"),
      result: getRequiredElement(result, "result"),
      iteratePathButton: getRequiredElement(iteratePathButton, "iteratePathButton"),
      ipmButton: getRequiredElement(ipmButton, "ipmButton"),
      simplexButton: getRequiredElement(simplexButton, "simplexButton"),
      simplexDualMode: getRequiredElement(simplexDualMode, "simplexDualMode"),
      pdhgButton: getRequiredElement(pdhgButton, "pdhgButton"),
      animateButton: getRequiredElement(animateButton, "animateButton"),
      startRotateObjectiveButton: getRequiredElement(startRotateObjectiveButton, "startRotateObjectiveButton"),
      stopRotateObjectiveButton: getRequiredElement(stopRotateObjectiveButton, "stopRotateObjectiveButton"),
      traceCheckbox: getRequiredElement(traceCheckbox, "traceCheckbox"),
      objectiveRotationSettings: getRequiredElement(objectiveRotationSettings, "objectiveRotationSettings"),
      alphaMaxSlider: getRequiredElement(alphaMaxSlider, "alphaMaxSlider"),
      correctorThresholdSlider: getRequiredElement(correctorThresholdSlider, "correctorThresholdSlider"),
      ipmColorByPhase: getRequiredElement(ipmColorByPhase, "ipmColorByPhase"),
      pdhgEtaSlider: getRequiredElement(pdhgEtaSlider, "pdhgEtaSlider"),
      pdhgTauSlider: getRequiredElement(pdhgTauSlider, "pdhgTauSlider"),
      centralPathIterSlider: getRequiredElement(centralPathIterSlider, "centralPathIterSlider"),
      objectiveAngleStepSlider: getRequiredElement(objectiveAngleStepSlider, "objectiveAngleStepSlider"),
      objectiveRotationSpeedSlider: getRequiredElement(objectiveRotationSpeedSlider, "objectiveRotationSpeedSlider"),
      maxitInput: getRequiredElement(maxitInput, "maxitInput"),
      maxitInputPDHG: getRequiredElement(maxitInputPDHG, "maxitInputPDHG"),
      pdhgIneqMode: getRequiredElement(pdhgIneqMode, "pdhgIneqMode"),
      pdhgHalpernMode: getRequiredElement(pdhgHalpernMode, "pdhgHalpernMode"),
      pdhgColorByBasis: getRequiredElement(pdhgColorByBasis, "pdhgColorByBasis"),
      alphaMaxValue: getRequiredElement(alphaMaxValue, "alphaMaxValue"),
      correctorThresholdValue: getRequiredElement(correctorThresholdValue, "correctorThresholdValue"),
      pdhgEtaValue: getRequiredElement(pdhgEtaValue, "pdhgEtaValue"),
      pdhgTauValue: getRequiredElement(pdhgTauValue, "pdhgTauValue"),
      centralPathIterValue: getRequiredElement(centralPathIterValue, "centralPathIterValue"),
    };

    runtimeElements.canvas.focus();

    let disposed = false;
    let cleanup = noop;

    void initializeUI(runtimeElements, new URLSearchParams(window.location.search))
      .then((nextCleanup) => {
        if (disposed) {
          nextCleanup();
          return;
        }
        cleanup = nextCleanup;
      })
      .catch((error) => {
        console.error("Failed to initialize lpviz", error);
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [
    canvas,
    shareButton,
    zoomButton,
    unzoomButton,
    toggle3DButton,
    toggleZOffsetButton,
    zScaleSlider,
    sidebarHandle,
    sidebar,
    replaySpeedSlider,
    topResult,
    nullStateMessage,
    maximize,
    objectiveDisplay,
    subjectTo,
    inequalities,
    result,
    iteratePathButton,
    ipmButton,
    simplexButton,
    simplexDualMode,
    pdhgButton,
    animateButton,
    startRotateObjectiveButton,
    stopRotateObjectiveButton,
    traceCheckbox,
    objectiveRotationSettings,
    alphaMaxSlider,
    correctorThresholdSlider,
    ipmColorByPhase,
    pdhgEtaSlider,
    pdhgTauSlider,
    centralPathIterSlider,
    objectiveAngleStepSlider,
    objectiveRotationSpeedSlider,
    maxitInput,
    maxitInputPDHG,
    pdhgIneqMode,
    pdhgHalpernMode,
    pdhgColorByBasis,
    alphaMaxValue,
    correctorThresholdValue,
    pdhgEtaValue,
    pdhgTauValue,
    centralPathIterValue,
  ]);
}
