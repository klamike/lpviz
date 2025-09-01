export function updateSliderAndDisplay(
  sliderId: string, 
  displayId: string, 
  value: number, 
  decimalPlaces: number
): void {
  const slider = document.getElementById(sliderId) as HTMLInputElement;
  const display = document.getElementById(displayId) as HTMLElement;
  if (slider && display) {
    slider.value = value.toString();
    display.textContent = value.toFixed(decimalPlaces);
  }
}

export function updateInputValue(inputId: string, value: number | boolean): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (input) {
    if (typeof value === 'boolean') {
      input.checked = value;
    } else {
      input.value = value.toString();
    }
  }
}

export function setButtonsEnabled(buttonStates: Record<string, boolean>): void {
  Object.entries(buttonStates).forEach(([buttonId, enabled]) => {
    const button = document.getElementById(buttonId) as HTMLButtonElement;
    if (button) {
      button.disabled = !enabled;
    }
  });
}

export function getElement<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function setButtonState(id: string, enabled: boolean): void {
  const button = getElement<HTMLButtonElement>(id);
  if (button) button.disabled = !enabled;
}

export function getElementValue(elementId: string): string {
  const element = document.getElementById(elementId) as HTMLInputElement;
  return element?.value || "";
}

export function getElementChecked(elementId: string): boolean {
  const element = document.getElementById(elementId) as HTMLInputElement;
  return element?.checked || false;
}

export function setElementDisplay(elementId: string, display: string): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = display;
  }
}

export function showElement(elementId: string): void {
  setElementDisplay(elementId, "block");
}

export function hideElement(elementId: string): void {
  setElementDisplay(elementId, "none");
}

export function setupHoverHighlight(
  elements: NodeListOf<Element>, 
  onMouseEnter: (index: number) => void,
  onMouseLeave: () => void
): void {
  elements.forEach((item) => {
    item.addEventListener("mouseenter", () => {
      const index = parseInt(item.getAttribute("data-index") || "0");
      onMouseEnter(index);
    });
    item.addEventListener("mouseleave", () => {
      onMouseLeave();
    });
  });
}

// tries to maximize font size to fit in a container
export function adjustFontSize(containerId: string = "result"): void {
  const container = getElement(containerId);
  if (!container || container.querySelector("#usageTips")) return;
  
  const containerStyle = window.getComputedStyle(container);
  const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
  const effectiveContainerWidth = container.clientWidth - paddingLeft - paddingRight;
  
  const texts = container.querySelectorAll("div");
  if (texts.length === 0) return;
  
  const measurementDiv = document.createElement("div");
  Object.assign(measurementDiv.style, {
    position: "absolute",
    visibility: "hidden",
    fontFamily: containerStyle.fontFamily,
    fontWeight: containerStyle.fontWeight,
    fontStyle: containerStyle.fontStyle,
    whiteSpace: "pre-wrap"
  });
  document.body.appendChild(measurementDiv);
  
  const baselineFontSize = 18;
  let minScaleFactor = Infinity;
  
  texts.forEach(text => {
    measurementDiv.style.fontSize = `${baselineFontSize}px`;
    measurementDiv.textContent = text.textContent;
    const measuredWidth = measurementDiv.getBoundingClientRect().width;
    const scaleFactor = (effectiveContainerWidth - 10) / measuredWidth;
    
    if (scaleFactor < minScaleFactor && scaleFactor < 4) {
      minScaleFactor = scaleFactor;
    }
  });
  
  const newFontSize = Math.min(24, baselineFontSize * minScaleFactor * 0.875);
  texts.forEach(text => {
    (text as HTMLElement).style.fontSize = `${newFontSize}px`;
  });
  
  document.body.removeChild(measurementDiv);
}
