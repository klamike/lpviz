import { state } from "./state";
import { adjustFontSize, adjustLogoFontSize } from "../utils/uiHelpers";

export function setResultHtml(html: string): void {
  state.resultHtml = html;
  queueMicrotask(() => {
    adjustFontSize();
    adjustLogoFontSize();
  });
}

export function setInequalitiesHtml(html: string): void {
  state.inequalitiesHtml = html;
  state.highlightIndex = null;
}
