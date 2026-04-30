import type { AppContext } from "@/app/appContext";
import { getState, on, type State } from "@/features/core/store";
import { el } from "@/ui/dom";

function usageTips(): HTMLDivElement {
  const tips = el("div", { id: "usageTips" });
  tips.innerHTML = `
    <br>
    <br>
    <strong class="usage-title">Usage Tips:</strong>
    <br>
    <br>
    <strong>Draw a polygon</strong>: click to add vertices
    <br>
    <strong>Select a solver</strong>: select a solver to solve immediately
    <br>
    <strong>Change objective</strong>: drag it or click <strong>Rotate Objective</strong>
    <br>
    <strong>Add new vertices</strong>: double‐click an edge
    <br>
    <strong>Move vertices</strong>: drag vertices to reshape
    <br>
    <strong>Press S</strong>: toggle snapping to the grid
    <br>
    <strong>3D Mode</strong>: click 3D button, left-drag to pan, right-drag to orbit, scroll to zoom
    <br>
    <strong>3D Z Scale</strong>: Shift + scroll or use the Z Scale slider<br>
    <strong>Reset</strong>: refresh the page<br>
    <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo<br>
    <strong>Delete a vertex</strong>: right-click it <br>
    <strong>Stop drawing</strong>: press enter
  `;
  return tips;
}

export function mountSolverLogPanel(parent: HTMLElement, ctx: AppContext) {
  const frame = el("div", { id: "terminal-container" });
  const result = el("div", { id: "result" });
  frame.append(
    result,
    el("div", { id: "terminal-window" }),
    el("div", { className: "scanlines" }),
    el("div", { className: "scanlines scanlines--delay-12" }),
  );
  parent.append(frame);
  const onMove = (e: MouseEvent) => {
    const row = (e.target as Element | null)?.closest<HTMLElement>(
      ".iterate-item",
    );
    const idx = row?.dataset.index;
    ctx.actions.setIterateHighlight(
      idx !== undefined && idx !== "" ? Number(idx) : null,
    );
  };
  result.addEventListener("mousemove", onMove);
  result.addEventListener("mouseleave", () =>
    ctx.actions.setIterateHighlight(null),
  );
  function fit(s: State) {
    if (s.resultMaxLineChars > 0) {
      const containerStyle = window.getComputedStyle(result);
      const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
      const effectiveWidth = result.clientWidth - paddingLeft - paddingRight;
      if (effectiveWidth > 0) {
        const baseSize = 18;
        const targetWidth = Math.max(1, effectiveWidth - 10);
        const maxLineWidth = s.resultMaxLineChars * baseSize * 0.55;
        const scale = Math.min(4, Math.max(0, targetWidth / maxLineWidth));
        const fontSize = Math.min(24, Math.max(10, baseSize * scale * 0.875));
        result.style.fontSize = `${fontSize}px`;
        result.style.setProperty("--virtual-font-size", `${fontSize}px`);
      }
    } else {
      result.style.fontSize = "";
      result.style.removeProperty("--virtual-font-size");
    }
  }
  function render(s: State) {
    result.className = s.resultDisplayMode === "virtual" ? "virtualized" : "";
    result.replaceChildren();
    fit(s);
    if (s.resultDisplayMode === "usage") {
      result.append(usageTips());
      return;
    }
    if (s.resultDisplayMode === "blocks" && s.resultBlocks) {
      const c = el("div");
      for (const block of s.resultBlocks)
        c.append(
          el("div", {
            className: block.className,
            text: block.text,
            attrs:
              block.index !== undefined
                ? { "data-index": String(block.index) }
                : {},
          }),
        );
      result.append(c);
      return;
    }
    if (s.resultDisplayMode === "virtual") {
      result.append(
        el("div", {
          className: "iterate-header",
          text: s.resultVirtualHeader ?? "",
        }),
      );
      const sc = el("div", { className: "iterate-scroll" });
      if (s.resultVirtualShowEmpty)
        sc.append(
          el("div", {
            className: "iterate-item-nohover",
            text: "No iterations available.",
          }),
        );
      else {
        const rows = el("div", { className: "iterate-rows" });
        for (const row of s.resultVirtualRows)
          rows.append(
            el("div", {
              className: row.className,
              text: row.text,
              attrs:
                row.index !== undefined
                  ? { "data-index": String(row.index) }
                  : {},
            }),
          );
        sc.append(
          el("div", { className: "iterate-virtual-wrapper" }, [
            el("div"),
            rows,
            el("div"),
          ]),
        );
      }
      result.append(
        sc,
        el("div", {
          className: "iterate-footer",
          text: s.resultVirtualFooter ?? "",
        }),
      );
    }
  }
  render(getState());
  const controller = new AbortController();
  on(
    [
      "resultDisplayMode",
      "resultBlocks",
      "resultVirtualHeader",
      "resultVirtualFooter",
      "resultVirtualShowEmpty",
      "resultVirtualRows",
      "resultMaxLineChars",
    ],
    () => render(getState()),
    controller.signal,
  );
  return {
    destroy: () => {
      controller.abort();
      frame.remove();
    },
  };
}
