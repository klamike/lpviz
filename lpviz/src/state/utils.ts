export function updateSliderAndDisplay(sliderId: string, displayId: string, value: number, decimalPlaces: number): void {
  const slider = document.getElementById(sliderId) as HTMLInputElement;
  const display = document.getElementById(displayId) as HTMLElement;
  if (slider && display) {
    slider.value = value.toString();
    display.textContent = value.toFixed(decimalPlaces);
  }
}

export function updateInputValue(inputId: string, value: number | boolean): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) return;
  if (typeof value === "boolean") input.checked = value;
  else input.value = value.toString();
}

export function setButtonsEnabled(buttonStates: Record<string, boolean>): void {
  Object.entries(buttonStates).forEach(([buttonId, enabled]) => {
    const button = document.getElementById(buttonId) as HTMLButtonElement;
    if (button) button.disabled = !enabled;
  });
}

export function setElementDisplay(elementId: string, display: string): void {
  const element = document.getElementById(elementId);
  if (element) element.style.display = display;
}

export function showElement(elementId: string): void {
  setElementDisplay(elementId, "block");
}

export function hideElement(elementId: string): void {
  setElementDisplay(elementId, "none");
}
