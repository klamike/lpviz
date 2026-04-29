import type { AppContext } from "@/app/appContext";
import { getState, subscribe, type State } from "@/features/core/store";
import { el } from "@/ui/dom";

const usage = `\n\nUsage Tips:\n\nDraw a polygon: click to add vertices\nSelect a solver: select a solver to solve immediately\nChange objective: drag it or click Rotate Objective\nAdd new vertices: double-click an edge\nMove vertices: drag vertices to reshape\nPress S: toggle snapping to the grid\n3D Mode: click 3D button, left-drag to pan, right-drag to orbit, scroll to zoom\n3D Z Scale: Shift + scroll or use the Z Scale slider\nReset: refresh the page\nUndo/Redo: ⌘+z to undo, ⇧⌘+z to redo\n\nATTN: Unbounded regions are now supported!\n\nDelete a vertex: right-click it\nStop drawing: press enter`;

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
      const px = Math.max(
        8,
        Math.min(
          16,
          Math.floor(
            (result.clientWidth / Math.max(20, s.resultMaxLineChars)) * 1.6,
          ),
        ),
      );
      result.style.fontSize = `${px}px`;
    } else result.style.fontSize = "";
  }
  function render(s: State) {
    result.className = s.resultDisplayMode === "virtual" ? "virtualized" : "";
    result.replaceChildren();
    fit(s);
    if (s.resultDisplayMode === "usage") {
      const pre = el("pre", { id: "usageTips", text: usage });
      result.append(pre);
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
      else
        for (const row of s.resultVirtualRows)
          sc.append(
            el("div", {
              className: row.className,
              text: row.text,
              attrs:
                row.index !== undefined
                  ? { "data-index": String(row.index) }
                  : {},
            }),
          );
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
  const unsub = subscribe(render);
  return {
    destroy: () => {
      unsub();
      frame.remove();
    },
  };
}
