import { getState, setState } from "../../state/store";
import type { SolverMode } from "../../state/store";
import { formatVirtualResultRow } from "../../solvers/worker/solverService";
import type { ResultRenderPayload, VirtualResultPayload } from "../../solvers/worker/solverService";
import { ViewportManager } from "../viewport";

const ROTATE_ROW_LIMIT = 20;
const ESTIMATED_ROW_HEIGHT = 22;

type ResponsiveSyncOptions = { includeTerminal?: boolean; forceResultFont?: boolean };

export function createResultRuntime({
  canvasManager,
  resultDiv,
  resultSelector,
  syncResponsiveUi,
}: {
  canvasManager: ViewportManager;
  resultDiv: HTMLElement;
  resultSelector: string;
  syncResponsiveUi: (options?: ResponsiveSyncOptions) => void;
}) {
  const initialResultHtml = resultDiv.innerHTML;
  const runtime = {
    resultMouseX: 0,
    resultMouseY: 0,
    pointerInsideResult: false,
    resultHoverRafId: null as number | null,
    currentHoveredResult: null as HTMLElement | null,
    lastVirtualResult: null as VirtualResultPayload | null,
    activeVirtualizer: null as { destroy(): void; refresh(): void } | null,
    lastSolverFontMode: null as SolverMode | null,
    pendingRender: null as { payload: ResultRenderPayload; options: { limitVirtualRows?: boolean } } | null,

    clearHover() {
      if (!this.currentHoveredResult) return;
      this.currentHoveredResult.classList.remove("hover");
      this.currentHoveredResult.dispatchEvent(new Event("mouseleave", { bubbles: true }));
      this.currentHoveredResult = null;
    },

    setHighlight(index: number | null) {
      setState({ highlightIteratePathIndex: index }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
      canvasManager.draw();
    },

    setHovered(next: HTMLElement | null) {
      if (this.currentHoveredResult === next) return;
      this.clearHover();
      if (!next) return;
      this.currentHoveredResult = next;
      next.classList.add("hover");
      next.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    },

    updateHoverState() {
      if (!this.pointerInsideResult) {
        this.resultHoverRafId = null;
        return;
      }

      const element = document.elementFromPoint(this.resultMouseX, this.resultMouseY);
      const nextHovered =
        element instanceof HTMLElement && resultDiv.contains(element) && element.matches(resultSelector) ? element : null;
      this.setHovered(nextHovered);
      this.resultHoverRafId = requestAnimationFrame(() => this.updateHoverState());
    },

    createVirtualizer(container: HTMLElement, rows: VirtualResultPayload["rows"]) {
      const wrapper = document.createElement("div");
      wrapper.className = "iterate-virtual-wrapper";
      const topSpacer = document.createElement("div");
      const rowsContainer = document.createElement("div");
      rowsContainer.className = "iterate-rows";
      const bottomSpacer = document.createElement("div");
      wrapper.append(topSpacer, rowsContainer, bottomSpacer);
      container.appendChild(wrapper);

      let rafId: number | null = null;
      let destroyed = false;

      const renderRows = () => {
        if (destroyed) return;
        const viewportHeight = Math.max(container.clientHeight, ESTIMATED_ROW_HEIGHT);
        const scrollTop = container.scrollTop;
        const totalSize = rows.length * ESTIMATED_ROW_HEIGHT;
        const overscanRows = 25;
        const visibleStart = Math.max(0, Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT) - overscanRows);
        const visibleEnd = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ESTIMATED_ROW_HEIGHT) + overscanRows);
        rowsContainer.innerHTML = "";
        if (visibleEnd <= visibleStart) {
          topSpacer.style.height = "0px";
          bottomSpacer.style.height = "0px";
          return;
        }
        const paddingTop = visibleStart * ESTIMATED_ROW_HEIGHT;
        const paddingBottom = Math.max(totalSize - visibleEnd * ESTIMATED_ROW_HEIGHT, 0);
        topSpacer.style.height = `${paddingTop}px`;
        bottomSpacer.style.height = `${paddingBottom}px`;

        for (let index = visibleStart; index < visibleEnd; index++) {
          const rowEl = document.createElement("div");
          rowEl.className = "iterate-item";
          rowEl.dataset.index = String(index);
          rowEl.textContent = formatVirtualResultRow(rows[index]!);
          rowEl.addEventListener("mouseenter", () => this.setHighlight(index));
          rowEl.addEventListener("mouseleave", () => this.setHighlight(null));
          rowsContainer.appendChild(rowEl);
        }
        if (container.scrollTop !== scrollTop) {
          container.scrollTop = scrollTop;
        }
      };

      const scheduleRender = () => {
        if (destroyed || rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          renderRows();
        });
      };

      const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => scheduleRender()) : null;
      resizeObserver?.observe(container);
      container.addEventListener("scroll", scheduleRender, { passive: true });
      renderRows();

      return {
        destroy: () => {
          destroyed = true;
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          container.removeEventListener("scroll", scheduleRender);
          resizeObserver?.disconnect();
          wrapper.remove();
          this.setHighlight(null);
        },
        refresh: () => {
          scheduleRender();
        },
      };
    },

    applyRender(payload: ResultRenderPayload, options: { limitVirtualRows?: boolean } = {}) {
      const limitVirtualRows = options.limitVirtualRows ?? getState().rotateObjectiveMode;
      const createResultElement = (className: string, text: string) => {
        const el = document.createElement("div");
        el.className = className;
        el.textContent = text;
        return el;
      };

      if (payload.type === "virtual") {
        this.lastVirtualResult = payload;
        resultDiv.classList.add("virtualized");
        resultDiv.innerHTML = "";
        this.setHighlight(null);
        this.activeVirtualizer?.destroy();
        this.activeVirtualizer = null;

        const rowsForLayout = limitVirtualRows ? payload.rows.slice(0, ROTATE_ROW_LIMIT) : payload.rows;
        const maxLineChars = [payload.header || "", ...(payload.footer ? [payload.footer] : []), ...rowsForLayout.map((row) => formatVirtualResultRow(row))].reduce(
          (max, line) => Math.max(max, line.length),
          0,
        );
        resultDiv.dataset.virtualMaxChars = String(maxLineChars);
        resultDiv.appendChild(createResultElement("iterate-header", payload.header || ""));

        const bodyEl = document.createElement("div");
        bodyEl.className = "iterate-scroll";
        if (rowsForLayout.length === 0) {
          bodyEl.appendChild(createResultElement("iterate-item-nohover", "No iterations available."));
          resultDiv.appendChild(bodyEl);
        } else {
          resultDiv.appendChild(bodyEl);
          this.activeVirtualizer = this.createVirtualizer(bodyEl, rowsForLayout);
        }

        if (payload.footer) {
          resultDiv.appendChild(createResultElement("iterate-footer", payload.footer));
        }
      } else {
        this.lastVirtualResult = null;
        resultDiv.classList.remove("virtualized");
        this.activeVirtualizer?.destroy();
        this.activeVirtualizer = null;
        delete resultDiv.dataset.virtualMaxChars;
        resultDiv.innerHTML = payload.html;

        resultDiv.querySelectorAll(".iterate-item[data-index]").forEach((item) => {
          item.addEventListener("mouseenter", () => {
            const index = parseInt(item.getAttribute("data-index") || "0");
            this.setHighlight(index);
          });
          item.addEventListener("mouseleave", () => {
            this.setHighlight(null);
          });
        });
      }

      canvasManager.draw();
      const currentMode = getState().solverMode;
      const forceFont = this.lastSolverFontMode !== currentMode;
      this.lastSolverFontMode = currentMode;
      syncResponsiveUi({ forceResultFont: forceFont });
      this.activeVirtualizer?.refresh();
    },

    render(payload: ResultRenderPayload, options: { limitVirtualRows?: boolean } = {}) {
      if (payload.type === "virtual") {
        this.lastVirtualResult = payload;
      } else {
        this.lastVirtualResult = null;
      }

      if (getState().isNavigatingViewport) {
        this.pendingRender = { payload, options };
        canvasManager.draw();
        return;
      }

      this.pendingRender = null;
      this.applyRender(payload, options);
    },

    flushDeferredRender() {
      if (!this.pendingRender || getState().isNavigatingViewport) return;
      const pendingRender = this.pendingRender;
      this.pendingRender = null;
      this.applyRender(pendingRender.payload, pendingRender.options);
    },

    clear() {
      this.lastVirtualResult = null;
      this.pendingRender = null;
      this.activeVirtualizer?.destroy();
      this.activeVirtualizer = null;
      delete resultDiv.dataset.virtualMaxChars;
      resultDiv.classList.remove("virtualized");
      resultDiv.innerHTML = initialResultHtml;
      this.setHighlight(null);
      syncResponsiveUi({ forceResultFont: true });
    },

    restoreFullVirtualResult() {
      if (this.lastVirtualResult) {
        this.render(this.lastVirtualResult, { limitVirtualRows: false });
      }
    },

    bindHoverEvents() {
      resultDiv.addEventListener("pointerenter", (event) => {
        this.pointerInsideResult = true;
        this.resultMouseX = event.clientX;
        this.resultMouseY = event.clientY;
        if (this.resultHoverRafId === null) {
          this.resultHoverRafId = requestAnimationFrame(() => this.updateHoverState());
        }
      });

      resultDiv.addEventListener("pointermove", (event) => {
        if (!this.pointerInsideResult) return;
        this.resultMouseX = event.clientX;
        this.resultMouseY = event.clientY;
      });

      resultDiv.addEventListener("pointerleave", () => {
        this.pointerInsideResult = false;
        this.clearHover();
        if (this.resultHoverRafId !== null) {
          cancelAnimationFrame(this.resultHoverRafId);
          this.resultHoverRafId = null;
        }
      });
    },
  };

  runtime.bindHoverEvents();
  return runtime;
}
