import { createEffect, onCleanup, onMount } from "solid-js";
import { useLegacy } from "../context/LegacyContext";
import { state } from "../state/state";
import { calculateOptimalFontSize, calculateTerminalHeight } from "../utils/solidHelpers";

const USAGE_TIPS_HTML = `
  <div id="usageTips">
    <br />
    <br />
    <strong class="usage-title">Usage Tips:</strong>
    <br />
    <br />
    <strong>Draw a polygon</strong>: click to add vertices
    <br />
    <strong>Select a solver</strong>: select a solver and click <strong>Solve</strong>
    <br />
    <strong>Change objective</strong>: drag it or click <strong>Rotate Objective</strong>
    <br />
    <strong>Add new vertices</strong>: double‐click an edge
    <br />
    <strong>Move vertices</strong>: drag vertices to reshape
    <br />
    <strong>Press S</strong>: toggle snapping to the grid
    <br />
    <strong>3D Mode</strong>: click 3D button, hold Shift+drag to rotate
    <br />
    <strong>Z Scale</strong>: adjust slider to scale z-axis
    <br />
    <strong>Reset</strong>: refresh the page
    <br />
    <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo
    <br />
  </div>
`;

export function TerminalPanel() {
  const legacy = useLegacy();
  let resultRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  const updateContent = () => {
    if (!resultRef) return;
    const html = state.resultHtml || USAGE_TIPS_HTML;
    resultRef.innerHTML = html;
    
    // Apply optimal font sizing
    if (!resultRef.querySelector("#usageTips")) {
      const texts = Array.from(resultRef.querySelectorAll("div")).map(div => div.textContent || "");
      if (texts.length > 0) {
        const containerWidth = resultRef.clientWidth;
        const { fontSize } = calculateOptimalFontSize(texts, containerWidth);
        const divs = resultRef.querySelectorAll("div");
        divs.forEach((div) => {
          (div as HTMLElement).style.fontSize = fontSize;
        });
      }
    }
  };

  createEffect(updateContent);

  onMount(() => {
    const resultDiv = resultRef;
    if (!resultDiv) return;

    let mouseX = 0;
    let mouseY = 0;
    let currentHovered: HTMLElement | null = null;

    const updateHoverState = () => {
      const el = document.elementFromPoint(mouseX, mouseY);
      if (el && el.classList.contains("iterate-item")) {
        if (currentHovered !== el) {
          if (currentHovered) {
            currentHovered.classList.remove("hover");
            currentHovered.dispatchEvent(
              new Event("mouseleave", { bubbles: true }),
            );
          }
          el.classList.add("hover");
          el.dispatchEvent(new Event("mouseenter", { bubbles: true }));
          currentHovered = el as HTMLElement;
        }
      } else if (currentHovered) {
        currentHovered.classList.remove("hover");
        currentHovered.dispatchEvent(
          new Event("mouseleave", { bubbles: true }),
        );
        currentHovered = null;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      updateHoverState();
    };

    const handleScroll = () => updateHoverState();

    const handleIterateEnter = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.classList.contains("iterate-item")) return;
      const index = parseInt(target.getAttribute("data-index") || "", 10);
      if (Number.isFinite(index)) {
        state.highlightIteratePathIndex = index;
        legacy.canvasManager.draw();
      }
    };

    const handleIterateLeave = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.classList.contains("iterate-item")) return;
      state.highlightIteratePathIndex = null;
      legacy.canvasManager.draw();
    };

    document.addEventListener("mousemove", handleMouseMove);
    resultDiv.addEventListener("scroll", handleScroll);
    resultDiv.addEventListener("mouseenter", handleIterateEnter, true);
    resultDiv.addEventListener("mouseleave", handleIterateLeave, true);

    onCleanup(() => {
      document.removeEventListener("mousemove", handleMouseMove);
      resultDiv.removeEventListener("scroll", handleScroll);
      resultDiv.removeEventListener("mouseenter", handleIterateEnter, true);
      resultDiv.removeEventListener("mouseleave", handleIterateLeave, true);
    });
  });

  return (
    <div id="terminal-container" ref={(el) => (containerRef = el)}>
      <div id="result" ref={(el) => (resultRef = el)}></div>
      <div id="terminal-window"></div>
      <div class="scanlines"></div>
      <div class="scanlines" style="--delay: -12s"></div>
    </div>
  );
}

export default TerminalPanel;
