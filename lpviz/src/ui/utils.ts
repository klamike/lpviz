type FontSizeConfig = {
  containerId: string;
  selector: string;
  baseSize: number;
  minSize: number;
  maxSize: number;
  padding: number;
  scaleFactor: number;
  skipCondition?: () => boolean;
};

// Measure the widest line for the given selector at the base font size.
const APPROX_CHAR_WIDTH_RATIO = 0.55;

function computeMaxLineWidth(container: HTMLElement, config: FontSizeConfig): number {
  const texts = container.querySelectorAll(config.selector);
  let maxCharWidth = 0;
  texts.forEach((text) => {
    const content = (text.textContent ?? "").split("\n");
    for (const line of content) {
      maxCharWidth = Math.max(maxCharWidth, line.length);
    }
  });
  return maxCharWidth;
}

function applyFontSize(container: HTMLElement, config: FontSizeConfig, fontSize: number) {
  const texts = container.querySelectorAll(config.selector);
  texts.forEach((text) => {
    (text as HTMLElement).style.fontSize = `${fontSize}px`;
  });
}

const fontSizeCache = new Map<string, number>();

export function adjustFontSize(containerId: string = "result", options: { force?: boolean } = {}): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  const config: FontSizeConfig = {
    containerId,
    selector: "div",
    baseSize: 18,
    minSize: 10,
    maxSize: 24,
    padding: 10,
    scaleFactor: 0.875,
    skipCondition: () => !!container.querySelector("#usageTips"),
  };

  if (config.skipCondition?.()) return;

  if (container.classList.contains("virtualized")) {
    config.selector = ".iterate-header, .iterate-item, .iterate-footer";
  }

  let maxLineChars = computeMaxLineWidth(container, config);
  const datasetMax = parseInt(container.dataset.virtualMaxChars || "", 10);
  if (Number.isFinite(datasetMax)) {
    maxLineChars = Math.max(maxLineChars, datasetMax);
  }
  if (maxLineChars <= 0) return;

  const containerStyle = window.getComputedStyle(container);
  const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
  const effectiveWidth = container.clientWidth - paddingLeft - paddingRight;
  if (effectiveWidth <= 0) return;

  const charWidthPx = config.baseSize * APPROX_CHAR_WIDTH_RATIO;
  const maxLineWidth = maxLineChars * charWidthPx;
  const cacheKey = `${maxLineChars}-${Math.round(effectiveWidth)}`;
  if (!options.force && fontSizeCache.has(cacheKey)) {
    applyFontSize(container, config, fontSizeCache.get(cacheKey)!);
    return;
  }

  const targetWidth = Math.max(1, effectiveWidth - config.padding);
  const scale = Math.min(4, Math.max(0, targetWidth / maxLineWidth));
  const newSize = Math.min(config.maxSize, Math.max(config.minSize, config.baseSize * scale * config.scaleFactor));

  fontSizeCache.set(cacheKey, newSize);
  console.warn(`[lpviz] adjustFontSize triggered for '${containerId}', width now ${effectiveWidth}px, scale ${scale.toFixed(2)}`);
  applyFontSize(container, config, newSize);
  container.style.setProperty("--virtual-font-size", `${newSize}px`);
}

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
