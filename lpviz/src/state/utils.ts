export function setButtonsEnabled(buttonStates: Record<string, boolean>): void {
  Object.entries(buttonStates).forEach(([buttonId, enabled]) => {
    const button = document.getElementById(buttonId) as HTMLButtonElement;
    if (button) button.disabled = !enabled;
  });
}

export function setElementDisplay(elementId: string, display: "block" | "none"): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.style.removeProperty("display");
  element.classList.toggle("is-hidden", display === "none");
  element.classList.toggle("is-block", display === "block");
}
