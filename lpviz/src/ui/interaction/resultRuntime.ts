import { getState, setState } from "../../state/store";
import type { SolverMode } from "../../state/store";
import { formatVirtualResultRow } from "../../solvers/worker/solverService";
import type { ResultRenderPayload, VirtualResultPayload } from "../../solvers/worker/solverService";
import { ViewportManager } from "../viewport";
import type { ResultTextBlock } from "../resultPayload";

const ROTATE_ROW_LIMIT = 20;
const ESTIMATED_ROW_HEIGHT = 22;

type ResponsiveSyncOptions = { includeTerminal?: boolean; forceResultFont?: boolean };

export function createResultRuntime({
  canvasManager,
  resultDiv,
  resultVirtualHost,
  syncResponsiveUi,
}: {
  canvasManager: ViewportManager;
  resultDiv: HTMLElement;
  resultVirtualHost: HTMLElement;
  syncResponsiveUi: (options?: ResponsiveSyncOptions) => void;
}) {
  const runtime = {
    lastVirtualResult: null as VirtualResultPayload | null,
    activeVirtualizer: null as { destroy(): void; refresh(): void } | null,
    lastSolverFontMode: null as SolverMode | null,
    pendingRender: null as { payload: ResultRenderPayload; options: { limitVirtualRows?: boolean } } | null,

    setHighlight(index: number | null) {
      setState({ highlightIteratePathIndex: index }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
      canvasManager.draw();
    },

    createVirtualizer(container: HTMLElement, rows: VirtualResultPayload["rows"]) {
      let rafId: number | null = null;
      let destroyed = false;
      let lastVisibleStart = -1;
      let lastVisibleEnd = -1;
      let lastPaddingTop = -1;
      let lastPaddingBottom = -1;

      const applyVisibleRows = (visibleRows: ResultTextBlock[], paddingTop: number, paddingBottom: number) => {
        if (
          lastVisibleStart === (visibleRows[0]?.index ?? -1) &&
          lastVisibleEnd === (visibleRows[visibleRows.length - 1]?.index ?? -1) &&
          lastPaddingTop === paddingTop &&
          lastPaddingBottom === paddingBottom
        ) {
          return;
        }

        lastVisibleStart = visibleRows[0]?.index ?? -1;
        lastVisibleEnd = visibleRows[visibleRows.length - 1]?.index ?? -1;
        lastPaddingTop = paddingTop;
        lastPaddingBottom = paddingBottom;

        setState({
          resultVirtualRows: visibleRows,
          resultVirtualPaddingTop: paddingTop,
          resultVirtualPaddingBottom: paddingBottom,
        });
      };

      const renderRows = () => {
        if (destroyed) return;
        const viewportHeight = Math.max(container.clientHeight, ESTIMATED_ROW_HEIGHT);
        const scrollTop = container.scrollTop;
        const totalSize = rows.length * ESTIMATED_ROW_HEIGHT;
        const overscanRows = 25;
        const visibleStart = Math.max(0, Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT) - overscanRows);
        const visibleEnd = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ESTIMATED_ROW_HEIGHT) + overscanRows);
        if (visibleEnd <= visibleStart) {
          applyVisibleRows([], 0, 0);
          return;
        }
        const paddingTop = visibleStart * ESTIMATED_ROW_HEIGHT;
        const paddingBottom = Math.max(totalSize - visibleEnd * ESTIMATED_ROW_HEIGHT, 0);
        applyVisibleRows(
          rows.slice(visibleStart, visibleEnd).map((row, offset) => ({
            className: "iterate-item",
            text: formatVirtualResultRow(row),
            index: visibleStart + offset,
          })),
          paddingTop,
          paddingBottom,
        );
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
          setState({
            resultVirtualRows: [],
            resultVirtualPaddingTop: 0,
            resultVirtualPaddingBottom: 0,
          });
          this.setHighlight(null);
        },
        refresh: () => {
          scheduleRender();
        },
      };
    },

    applyRender(payload: ResultRenderPayload, options: { limitVirtualRows?: boolean } = {}) {
      const limitVirtualRows = options.limitVirtualRows ?? getState().rotateObjectiveMode;

      if (payload.type === "virtual") {
        this.lastVirtualResult = payload;
        const rowsForLayout = limitVirtualRows ? payload.rows.slice(0, ROTATE_ROW_LIMIT) : payload.rows;
        setState({
          resultDisplayMode: "virtual",
          resultBlocks: null,
          resultVirtualHeader: payload.header || "",
          resultVirtualFooter: payload.footer ?? null,
          resultVirtualShowEmpty: rowsForLayout.length === 0,
          resultVirtualRows: [],
          resultVirtualPaddingTop: 0,
          resultVirtualPaddingBottom: 0,
          highlightIteratePathIndex: null,
        });
        this.setHighlight(null);
        this.activeVirtualizer?.destroy();
        this.activeVirtualizer = null;

        const maxLineChars = [payload.header || "", ...(payload.footer ? [payload.footer] : []), ...rowsForLayout.map((row) => formatVirtualResultRow(row))].reduce(
          (max, line) => Math.max(max, line.length),
          0,
        );
        resultDiv.dataset.virtualMaxChars = String(maxLineChars);
        if (rowsForLayout.length > 0) {
          this.activeVirtualizer = this.createVirtualizer(resultVirtualHost, rowsForLayout);
        }
      } else {
        this.lastVirtualResult = null;
        this.activeVirtualizer?.destroy();
        this.activeVirtualizer = null;
        delete resultDiv.dataset.virtualMaxChars;
        setState({
          resultDisplayMode: "blocks",
          resultBlocks: payload.blocks,
          resultVirtualHeader: null,
          resultVirtualFooter: null,
          resultVirtualShowEmpty: false,
          resultVirtualRows: [],
          resultVirtualPaddingTop: 0,
          resultVirtualPaddingBottom: 0,
          highlightIteratePathIndex: null,
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
      setState({
        resultDisplayMode: "usage",
        resultBlocks: null,
        resultVirtualHeader: null,
        resultVirtualFooter: null,
        resultVirtualShowEmpty: false,
        resultVirtualRows: [],
        resultVirtualPaddingTop: 0,
        resultVirtualPaddingBottom: 0,
        highlightIteratePathIndex: null,
      });
      this.setHighlight(null);
      syncResponsiveUi({ forceResultFont: true });
    },

    restoreFullVirtualResult() {
      if (this.lastVirtualResult) {
        this.render(this.lastVirtualResult, { limitVirtualRows: false });
      }
    },

    teardown() {
      this.activeVirtualizer?.destroy();
      this.activeVirtualizer = null;
    },
  };

  return runtime;
}
