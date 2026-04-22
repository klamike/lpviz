import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

import { useLpvizStore } from "@/features/core/store";
import { areResultPanelUiStatesEqual, selectResultPanelUiState } from "@/features/core/selectors";
import type { ResultTextBlock } from "@/features/solver/types";

import { TerminalFrame } from "@/components/sidebar/TerminalFrame";
import { useAppActions } from "@/features/core/actions";
import { useResultTypography } from "@/hooks/useResultTypography";

// Imperative virtual list — pool of DOM divs updated directly, bypassing React
// reconciliation entirely for content updates. React only manages the scroll
// container shell and the spacer div (which sets total scroll height).
type VirtualListHandle = { paint: () => void };

const VirtualList = forwardRef<
  VirtualListHandle,
  {
    rowsRef: React.MutableRefObject<ResultTextBlock[]>;
    rowHeight: number;
    onScrollTop: (scrollTop: number) => void;
  }
>(function VirtualList({ rowsRef, rowHeight, onScrollTop }, ref) {
  const outerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<HTMLDivElement[]>([]);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const onScrollTopRef = useRef(onScrollTop);
  onScrollTopRef.current = onScrollTop;

  const paint = useCallback(() => {
    const outer = outerRef.current;
    const spacer = spacerRef.current;
    if (!outer || !spacer) return;

    const rows = rowsRef.current;
    const rh = rowHeightRef.current;
    const scrollTop = outer.scrollTop;
    const viewHeight = outer.clientHeight;
    const rowCount = rows.length;

    spacer.style.height = `${rowCount * rh}px`;

    const OVERSCAN = 3;
    const first = Math.max(0, Math.floor(scrollTop / rh) - OVERSCAN);
    const last = Math.min(rowCount - 1, Math.ceil((scrollTop + viewHeight) / rh) + OVERSCAN);
    const count = rowCount > 0 ? last - first + 1 : 0;

    const pool = poolRef.current;
    while (pool.length < count) {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;left:0;right:0;";
      outer.appendChild(div);
      pool.push(div);
    }

    for (let i = 0; i < count; i++) {
      const rowIdx = first + i;
      const row = rows[rowIdx];
      const div = pool[i]!;
      if (div.style.display) div.style.display = "";
      div.style.top = `${rowIdx * rh}px`;
      div.style.height = `${rh}px`;
      if (row) {
        if (div.className !== row.className) div.className = row.className;
        const idxStr = row.index != null ? String(row.index) : "";
        if ((div.dataset.index ?? "") !== idxStr) div.dataset.index = idxStr;
        if (div.textContent !== row.text) div.textContent = row.text;
      }
    }
    for (let i = count; i < pool.length; i++) {
      if (pool[i]!.style.display !== "none") pool[i]!.style.display = "none";
    }
  }, [rowsRef]);

  useImperativeHandle(ref, () => ({ paint }), [paint]);
  useLayoutEffect(() => { paint(); }, [paint]);

  const handleScroll = useCallback(() => {
    onScrollTopRef.current(outerRef.current?.scrollTop ?? 0);
    paint();
  }, [paint]);

  return (
    <div
      ref={outerRef}
      style={{ position: "relative", overflow: "auto", width: "100%", height: "100%" }}
      onScroll={handleScroll}
    >
      <div ref={spacerRef} />
    </div>
  );
});

export function UsagePanel() {
  const runtimeActions = useAppActions();
  const resultPanelUiState = useLpvizStore(
    selectResultPanelUiState,
    areResultPanelUiStatesEqual,
  );
  const { resultRef, resultStyle, fontSize } = useResultTypography({
    enabled: resultPanelUiState.mode !== "usage",
    maxLineChars: resultPanelUiState.maxLineChars,
  });

  const rowHeight = fontSize != null ? Math.ceil(fontSize * 1.2) : 22;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtualListHandle | null>(null);
  const mouseClientPosRef = useRef<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const runtimeActionsRef = useRef(runtimeActions);
  runtimeActionsRef.current = runtimeActions;
  const virtualRowsRef = useRef(resultPanelUiState.virtualRows);
  virtualRowsRef.current = resultPanelUiState.virtualRows;

  // Drive VirtualList updates imperatively — no React reconciliation for rows.
  useLayoutEffect(() => {
    listRef.current?.paint();
  }, [resultPanelUiState.virtualRows, rowHeight]);

  const handleListScrollTop = useCallback((scrollTop: number) => {
    scrollTopRef.current = scrollTop;
  }, []);

  const startHighlightTracking = useCallback(() => {
    if (rafIdRef.current !== null) return;
    const tick = () => {
      const pos = mouseClientPosRef.current;
      if (pos === null) { rafIdRef.current = null; return; }
      const container = scrollContainerRef.current;
      if (container) {
        const r = container.getBoundingClientRect();
        if (pos.x < r.left || pos.x > r.right || pos.y < r.top || pos.y > r.bottom) {
          mouseClientPosRef.current = null;
          runtimeActionsRef.current.setIterateHighlight(null);
          rafIdRef.current = null;
          return;
        }
        const relY = pos.y - r.top + scrollTopRef.current;
        const idx = Math.floor(relY / rowHeightRef.current);
        const rows = virtualRowsRef.current;
        if (idx >= 0 && idx < rows.length) {
          runtimeActionsRef.current.setIterateHighlight(rows[idx]?.index ?? null);
        } else {
          runtimeActionsRef.current.setIterateHighlight(null);
        }
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const handleScrollAreaMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseClientPosRef.current = { x: e.clientX, y: e.clientY };
    startHighlightTracking();
  }, [startHighlightTracking]);

  const handleScrollAreaMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseClientPosRef.current = { x: e.clientX, y: e.clientY };
    startHighlightTracking();
  }, [startHighlightTracking]);

  const handleScrollAreaWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    mouseClientPosRef.current = { x: e.clientX, y: e.clientY };
    startHighlightTracking();
  }, [startHighlightTracking]);

  return (
    <TerminalFrame
      containerId="terminal-container"
      delayClassName="scanlines--delay-12"
    >
      <div
        id="result"
        ref={resultRef}
        style={resultStyle}
        className={
          resultPanelUiState.mode === "virtual" ? "virtualized" : undefined
        }
      >
        {resultPanelUiState.mode === "usage" ? (
          <div id="usageTips">
            <br />
            <br />
            <strong className="usage-title">Usage Tips:</strong>
            <br />
            <br />
            <strong>Draw a polygon</strong>: click to add vertices
            <br />
            <strong>Select a solver</strong>: select a solver to solve
            immediately
            <br />
            <strong>Change objective</strong>: drag it or click{" "}
            <strong>Rotate Objective</strong>
            <br />
            <strong>Add new vertices</strong>: double-click an edge
            <br />
            <strong>Move vertices</strong>: drag vertices to reshape
            <br />
            <strong>Press S</strong>: toggle snapping to the grid
            <br />
            <strong>3D Mode</strong>: click 3D button, left-drag to pan,
            right-drag to orbit, scroll to zoom
            <br />
            <strong>3D Z Scale</strong>: Shift + scroll or use the Z Scale
            slider
            <br />
            <strong>Reset</strong>: refresh the page
            <br />
            <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo
            <br />
            <br />
            <mark style={{ backgroundColor: "whitesmoke", color: "black" }}>
              <strong>
                <em>
                  &nbsp;&nbsp;ATTN: Unbounded regions are now
                  supported!&nbsp;&nbsp;
                </em>
              </strong>
              <br />
              <br />
            </mark>
            <strong>Delete a vertex</strong>: right-click it
            <br />
            <strong>Stop drawing</strong>: press enter
          </div>
        ) : null}
        {resultPanelUiState.mode === "blocks" &&
        resultPanelUiState.blocks !== null ? (
          <div>
            {resultPanelUiState.blocks.map((block, index) => (
              <div
                key={`${index}-${block.className}-${block.text}`}
                className={block.className}
                data-index={block.index}
                onMouseEnter={
                  block.index === undefined
                    ? undefined
                    : () => {
                        runtimeActions.setIterateHighlight(block.index ?? null);
                      }
                }
                onMouseLeave={
                  block.index === undefined
                    ? undefined
                    : () => {
                        runtimeActions.setIterateHighlight(null);
                      }
                }
              >
                {block.text}
              </div>
            ))}
          </div>
        ) : null}
        <div
          className={`result-virtual-layout ${resultPanelUiState.mode === "virtual" ? "" : "is-hidden"}`.trim()}
        >
          <div className="iterate-header">
            {resultPanelUiState.virtualHeader ?? ""}
          </div>
          <div
            ref={scrollContainerRef}
            className="iterate-scroll"
            onMouseEnter={handleScrollAreaMouseEnter}
            onMouseMove={handleScrollAreaMouseMove}
            onWheel={handleScrollAreaWheel}
          >
            {resultPanelUiState.virtualShowEmpty ? (
              <div className="iterate-item-nohover">
                No iterations available.
              </div>
            ) : (
              <VirtualList
                ref={listRef}
                rowsRef={virtualRowsRef}
                rowHeight={rowHeight}
                onScrollTop={handleListScrollTop}
              />
            )}
          </div>
          {resultPanelUiState.virtualFooter ? (
            <div className="iterate-footer">
              {resultPanelUiState.virtualFooter}
            </div>
          ) : null}
        </div>
      </div>
    </TerminalFrame>
  );
}
