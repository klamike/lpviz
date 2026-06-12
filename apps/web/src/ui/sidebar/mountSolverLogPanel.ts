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
  let pointerInsideResult = false;
  let pointerX = 0;
  let pointerY = 0;
  let hoverRafId: number | null = null;
  let currentHoveredRow: HTMLElement | null = null;

  const setHoveredRow = (next: HTMLElement | null) => {
    if (currentHoveredRow === next) return;
    currentHoveredRow?.classList.remove("hover");
    currentHoveredRow = next;
    currentHoveredRow?.classList.add("hover");
    const idx = currentHoveredRow?.dataset.index;
    ctx.actions.setIterateHighlight(
      idx !== undefined && idx !== "" ? Number(idx) : null,
    );
  };
  const syncHoverState = () => {
    hoverRafId = null;
    if (!pointerInsideResult) {
      return;
    }
    const element = document.elementFromPoint(pointerX, pointerY);
    const row =
      element instanceof Element
        ? element.closest<HTMLElement>(".iterate-item")
        : null;
    setHoveredRow(row && result.contains(row) ? row : null);
  };
  const scheduleHoverSync = () => {
    if (!pointerInsideResult || hoverRafId !== null) return;
    hoverRafId = requestAnimationFrame(syncHoverState);
  };
  const clearHoverState = () => {
    pointerInsideResult = false;
    setHoveredRow(null);
    if (hoverRafId !== null) {
      cancelAnimationFrame(hoverRafId);
      hoverRafId = null;
    }
  };
  frame.append(
    result,
    el("div", { id: "terminal-window" }),
    el("div", { className: "scanlines" }),
    el("div", { className: "scanlines scanlines--delay-12" }),
  );
  parent.append(frame);
  result.addEventListener("pointerenter", (e) => {
    pointerInsideResult = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
    scheduleHoverSync();
  });
  result.addEventListener("pointermove", (e) => {
    if (!pointerInsideResult) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    scheduleHoverSync();
  });
  result.addEventListener("scroll", scheduleHoverSync, {
    capture: true,
    passive: true,
  });
  result.addEventListener("pointerleave", clearHoverState);
  // The horizontal padding is static CSS; reading computed style per render
  // (interleaved with the DOM writes below) forced a layout pass per solve
  // result and per rotation step.
  let cachedPadding: number | null = null;
  let lastFitKey = "";
  function fit(s: State) {
    if (s.resultMaxLineChars > 0) {
      if (cachedPadding === null) {
        const containerStyle = window.getComputedStyle(result);
        cachedPadding =
          (parseFloat(containerStyle.paddingLeft) || 0) +
          (parseFloat(containerStyle.paddingRight) || 0);
      }
      const effectiveWidth = result.clientWidth - cachedPadding;
      const fitKey = `${s.resultMaxLineChars}|${effectiveWidth}`;
      if (fitKey === lastFitKey) return;
      lastFitKey = fitKey;
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
      lastFitKey = "";
      result.style.fontSize = "";
      result.style.removeProperty("--virtual-font-size");
    }
  }
  function render(s: State) {
    // fit() reads layout (clientWidth); keep it ahead of the DOM writes below
    fit(s);
    result.className = s.resultDisplayMode === "virtual" ? "virtualized" : "";
    result.replaceChildren();
    currentHoveredRow = null;
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
      result.append(
        sc,
        el("div", {
          className: "iterate-footer",
          text: s.resultVirtualFooter ?? "",
        }),
      );
      if (s.resultVirtualShowEmpty)
        sc.append(
          el("div", {
            className: "iterate-item-nohover",
            text: "No iterations available.",
          }),
        );
      else mountVirtualRows(sc, s.resultVirtualRows);
    }
    scheduleHoverSync();
  }

  // Windowed rendering: only the rows near the viewport get DOM nodes, with
  // spacer divs holding the scroll height. Materializing every row (100k at
  // max solver settings) costs seconds of main-thread time per render.
  const VIRTUAL_OVERSCAN_ROWS = 20;
  function mountVirtualRows(
    sc: HTMLElement,
    blocks: State["resultVirtualRows"],
  ) {
    const topSpacer = el("div");
    const rowsEl = el("div", { className: "iterate-rows" });
    const bottomSpacer = el("div");
    sc.append(
      el("div", { className: "iterate-virtual-wrapper" }, [
        topSpacer,
        rowsEl,
        bottomSpacer,
      ]),
    );
    if (blocks.length === 0) return;

    let rowHeight = 0;
    let windowStart = -1;
    let windowEnd = -1;
    const fillWindow = () => {
      if (rowHeight <= 0) {
        const first = blocks.at(0)!;
        const probe = el("div", {
          className: first.className,
          text: first.text,
        });
        rowsEl.append(probe);
        rowHeight = probe.offsetHeight || 18;
        probe.remove();
      }
      const viewHeight = sc.clientHeight || result.clientHeight || 600;
      const start = Math.max(
        0,
        Math.floor(sc.scrollTop / rowHeight) - VIRTUAL_OVERSCAN_ROWS,
      );
      const end = Math.min(
        blocks.length,
        Math.ceil((sc.scrollTop + viewHeight) / rowHeight) +
          VIRTUAL_OVERSCAN_ROWS,
      );
      if (start === windowStart && end === windowEnd) return;
      windowStart = start;
      windowEnd = end;
      topSpacer.style.height = `${start * rowHeight}px`;
      bottomSpacer.style.height = `${(blocks.length - end) * rowHeight}px`;
      const fragment = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const row = blocks.at(i)!;
        fragment.append(
          el("div", {
            className: row.className,
            text: row.text,
            attrs:
              row.index !== undefined
                ? { "data-index": String(row.index) }
                : {},
          }),
        );
      }
      rowsEl.replaceChildren(fragment);
    };

    let scrollRafId: number | null = null;
    sc.addEventListener(
      "scroll",
      () => {
        if (scrollRafId !== null) return;
        scrollRafId = requestAnimationFrame(() => {
          scrollRafId = null;
          fillWindow();
        });
      },
      { passive: true },
    );
    fillWindow();
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
      clearHoverState();
      frame.remove();
    },
  };
}
