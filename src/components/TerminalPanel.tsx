import { onCleanup, onMount } from "solid-js";

export function TerminalPanel() {
  let resultRef: HTMLDivElement | undefined;

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

    document.addEventListener("mousemove", handleMouseMove);
    resultDiv.addEventListener("scroll", handleScroll);

    onCleanup(() => {
      document.removeEventListener("mousemove", handleMouseMove);
      resultDiv.removeEventListener("scroll", handleScroll);
    });
  });

  return (
    <div id="terminal-container">
      <div id="result" ref={(el) => (resultRef = el)}>
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
      </div>
      <div id="terminal-window"></div>
      <div class="scanlines"></div>
      <div class="scanlines" style="--delay: -12s"></div>
    </div>
  );
}

export default TerminalPanel;
