import { Accessor, Setter, createSignal } from "solid-js";
import { state } from "../state/state";

export interface SliderConfig {
  value: Accessor<number>;
  setValue: Setter<number>;
  decimalPlaces: number;
}

export function createSliderSignal(
  initialValue: number,
  decimalPlaces: number = 2,
): SliderConfig {
  const [value, setValue] = createSignal(initialValue);
  return {
    value,
    setValue,
    decimalPlaces,
  };
}

export function setButtonState(id: string, enabled: boolean): void {
  state.uiButtons[id] = enabled;
}

export function setButtonsEnabled(buttonStates: Record<string, boolean>): void {
  Object.entries(buttonStates).forEach(([buttonId, enabled]) => {
    state.uiButtons[buttonId] = enabled;
  });
}

export interface FontSizeResult {
  fontSize: string;
  scaleFactor: number;
}

export function calculateOptimalFontSize(
  texts: string[],
  containerWidth: number,
  baselineFontSize: number = 18,
  maxFontSize: number = 24,
  scalingFactor: number = 0.875,
): FontSizeResult {
  if (texts.length === 0) {
    return { fontSize: `${baselineFontSize}px`, scaleFactor: 1 };
  }

  const measurementDiv = document.createElement("div");
  Object.assign(measurementDiv.style, {
    position: "absolute",
    visibility: "hidden",
    fontFamily: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    whiteSpace: "pre-wrap",
    fontSize: `${baselineFontSize}px`,
  });
  document.body.appendChild(measurementDiv);

  let minScaleFactor = Infinity;

  texts.forEach((text) => {
    measurementDiv.textContent = text;
    const measuredWidth = measurementDiv.getBoundingClientRect().width;
    const scaleFactor = (containerWidth - 10) / measuredWidth;

    if (scaleFactor < minScaleFactor && scaleFactor < 4) {
      minScaleFactor = scaleFactor;
    }
  });

  document.body.removeChild(measurementDiv);

  const finalScaleFactor = minScaleFactor === Infinity ? 1 : minScaleFactor;
  const newFontSize = Math.min(
    maxFontSize,
    baselineFontSize * finalScaleFactor * scalingFactor,
  );

  return {
    fontSize: `${newFontSize}px`,
    scaleFactor: finalScaleFactor,
  };
}

export function calculateLogoFontSize(
  logoText: string,
  containerWidth: number,
  baselineFontSize: number = 16,
  maxFontSize: number = 20,
  minFontSize: number = 8,
  scalingFactor: number = 0.9,
): string {
  if (!logoText) return `${baselineFontSize}px`;

  const measurementDiv = document.createElement("div");
  Object.assign(measurementDiv.style, {
    position: "absolute",
    visibility: "hidden",
    fontFamily: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    whiteSpace: "pre-wrap",
    fontSize: `${baselineFontSize}px`,
  });
  document.body.appendChild(measurementDiv);

  measurementDiv.textContent = logoText;
  const measuredWidth = measurementDiv.getBoundingClientRect().width;
  const scaleFactor = (containerWidth - 20) / measuredWidth;

  document.body.removeChild(measurementDiv);

  const newFontSize = Math.min(
    maxFontSize,
    Math.max(minFontSize, baselineFontSize * scaleFactor * scalingFactor),
  );

  return `${newFontSize}px`;
}

export function calculateTerminalHeight(sidebarWidth: number): string {
  const heightPercentage = 0.4;
  const minHeight = 120;
  const maxHeight = 300;

  const calculatedHeight = sidebarWidth * heightPercentage;
  const finalHeight = Math.max(
    minHeight,
    Math.min(maxHeight, calculatedHeight),
  );

  return `${finalHeight}px`;
}

export function calculateMinSidebarWidth(logoText: string): number {
  if (!logoText) return 300;

  const measurementDiv = document.createElement("div");
  Object.assign(measurementDiv.style, {
    position: "absolute",
    visibility: "hidden",
    fontFamily: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    whiteSpace: "pre-wrap",
    fontSize: "12px",
  });
  document.body.appendChild(measurementDiv);

  measurementDiv.textContent = logoText;
  const logoWidth = measurementDiv.getBoundingClientRect().width;

  document.body.removeChild(measurementDiv);

  const paddingAndMargin = 60;
  const minRequiredWidth = logoWidth + paddingAndMargin;

  return Math.max(280, Math.min(minRequiredWidth, 400));
}

export interface HoverHandlers {
  onMouseEnter: (index: number) => void;
  onMouseLeave: () => void;
}

export function createHoverEventHandlers(
  onMouseEnter: (index: number) => void,
  onMouseLeave: () => void,
): HoverHandlers {
  return {
    onMouseEnter,
    onMouseLeave,
  };
}
