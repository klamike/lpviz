// tries to maximize font size to fit in a container
function adjustTextSize(config: { containerId: string; selector: string; baseSize: number; minSize: number; maxSize: number; padding: number; scaleFactor: number; skipCondition?: () => boolean }): void {
  const container = document.getElementById(config.containerId) as HTMLElement | null;
  if (!container || config.skipCondition?.()) return;

  const containerStyle = window.getComputedStyle(container);
  const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
  const effectiveWidth = container.clientWidth - paddingLeft - paddingRight;

  const texts = container.querySelectorAll(config.selector);
  if (texts.length === 0) return;

  const measurementDiv = document.createElement("div");
  Object.assign(measurementDiv.style, {
    position: "absolute",
    visibility: "hidden",
    fontFamily: containerStyle.fontFamily,
    fontWeight: containerStyle.fontWeight,
    fontStyle: containerStyle.fontStyle,
    whiteSpace: "pre-wrap",
  });
  document.body.appendChild(measurementDiv);

  let minScale = Infinity;
  texts.forEach((text) => {
    measurementDiv.style.fontSize = `${config.baseSize}px`;
    measurementDiv.textContent = text.textContent;
    const scale = (effectiveWidth - config.padding) / measurementDiv.getBoundingClientRect().width;
    if (scale < minScale && scale < 4) minScale = scale;
  });

  if (!Number.isFinite(minScale) || minScale <= 0) minScale = 1;

  const newSize = Math.min(config.maxSize, Math.max(config.minSize, config.baseSize * minScale * config.scaleFactor));
  texts.forEach((text) => {
    (text as HTMLElement).style.fontSize = `${newSize}px`;
  });

  document.body.removeChild(measurementDiv);
}

export function adjustFontSize(containerId: string = "result"): void {
  const container = document.getElementById(containerId);
  const selector = container?.classList.contains("virtualized") ? ".iterate-header, .iterate-item, .iterate-footer" : "div";
  adjustTextSize({
    containerId,
    selector,
    baseSize: 18,
    minSize: 10,
    maxSize: 24,
    padding: 10,
    scaleFactor: 0.875,
    skipCondition: () => !!container?.querySelector("#usageTips"),
  });
}

export function adjustLogoFontSize(): void {
  adjustTextSize({
    containerId: "topResult",
    selector: "#nullStateMessage",
    baseSize: 16,
    minSize: 8,
    maxSize: 20,
    padding: 20,
    scaleFactor: 0.9,
    skipCondition: () => {
      const logo = document.getElementById("nullStateMessage");
      return !logo || logo.style.display === "none";
    },
  });
}

export function refreshResponsiveLayout(options: { includeTerminal?: boolean } = {}): void {
  adjustFontSize();
  adjustLogoFontSize();
  if (options.includeTerminal) {
    const terminalContainer = document.getElementById("terminal-container2") as HTMLElement | null;
    const sidebar = document.getElementById("sidebar") as HTMLElement | null;
    if (!terminalContainer || !sidebar) return;

    const height = Math.max(120, Math.min(300, sidebar.offsetWidth * 0.4));
    terminalContainer.style.minHeight = `${height}px`;
  }
}
