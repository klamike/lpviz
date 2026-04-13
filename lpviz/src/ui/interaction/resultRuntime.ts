import { getState, setState } from "../../state/store";
import { formatVirtualResultRow } from "../../solvers/worker/solverService";
import type { ResultRenderPayload, VirtualResultPayload } from "../../solvers/worker/solverService";
import { ViewportManager } from "../viewport";
import type { ResultTextBlock } from "../resultPayload";

const ROTATE_ROW_LIMIT = 20;

const getMaxLineChars = (lines: string[]) => lines.reduce((maxChars, line) => {
  const lineMaxChars = line.split("\n").reduce((maxLineChars, textLine) => Math.max(maxLineChars, textLine.length), 0);
  return Math.max(maxChars, lineMaxChars);
}, 0);

const createVirtualBlock = (row: VirtualResultPayload["rows"][number], index: number): ResultTextBlock => ({
  className: "iterate-item",
  text: formatVirtualResultRow(row),
  index,
});

export function createResultRuntime({
  canvasManager,
}: {
  canvasManager: ViewportManager;
}) {
  const runtime = {
    lastVirtualResult: null as VirtualResultPayload | null,
    pendingRender: null as { payload: ResultRenderPayload; options: { limitVirtualRows?: boolean } } | null,

    setHighlight(index: number | null) {
      setState({ highlightIteratePathIndex: index }, { viewportDirty: canvasManager.getIterateDirtyFlags() });
      canvasManager.draw();
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
          resultVirtualRows: rowsForLayout.map(createVirtualBlock),
          resultMaxLineChars: getMaxLineChars([
            payload.header || "",
            ...(payload.footer ? [payload.footer] : []),
            ...rowsForLayout.map((row) => formatVirtualResultRow(row)),
          ]),
          highlightIteratePathIndex: null,
        });
        this.setHighlight(null);
      } else {
        this.lastVirtualResult = null;
        setState({
          resultDisplayMode: "blocks",
          resultBlocks: payload.blocks,
          resultVirtualHeader: null,
          resultVirtualFooter: null,
          resultVirtualShowEmpty: false,
          resultVirtualRows: [],
          resultMaxLineChars: getMaxLineChars(payload.blocks.map((block) => block.text)),
          highlightIteratePathIndex: null,
        });
      }

      canvasManager.draw();
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
      setState({
        resultDisplayMode: "usage",
        resultBlocks: null,
        resultVirtualHeader: null,
        resultVirtualFooter: null,
        resultVirtualShowEmpty: false,
        resultVirtualRows: [],
        resultMaxLineChars: 0,
        highlightIteratePathIndex: null,
      });
      this.setHighlight(null);
    },

    restoreFullVirtualResult() {
      if (this.lastVirtualResult) {
        this.render(this.lastVirtualResult, { limitVirtualRows: false });
      }
    },

    teardown() {
    },
  };

  return runtime;
}
