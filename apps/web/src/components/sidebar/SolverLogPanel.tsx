import { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

import { getState, subscribe, useLpvizStore } from "@/features/core/store";
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

    const totalHeight = `${rowCount * rh}px`;
    if (spacer.style.height !== totalHeight) spacer.style.height = totalHeight;

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

    const height = `${rh}px`;
    for (let i = 0; i < count; i++) {
      const rowIdx = first + i;
      const row = rows[rowIdx];
      const div = pool[i]!;
      // Only touch styles when they actually change. During objective
      // rotation only text changes frame-to-frame, so skipping these writes
      // avoids gratuitous style invalidations and is the biggest per-frame
      // savings vs. the previous implementation.
      if (div.style.display !== "") div.style.display = "";
      const top = `${rowIdx * rh}px`;
      if (div.style.top !== top) div.style.top = top;
      if (div.style.height !== height) div.style.height = height;
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

export function SolverLogPanel() {
  const runtimeActions = useAppActions();
  const resultPanelUiState = useLpvizStore(
    selectResultPanelUiState,
    areResultPanelUiStatesEqual,
  );
  // maxLineChars drives useResultTypography, which performs a forced reflow
  // (getComputedStyle + clientWidth) inside a layout effect on every change.
  // During objective rotation the solver produces new results at animation
  // speed, so defer this to transition priority — the font size can lag a
  // frame behind without any perceptual issue, but forced reflows on the hot
  // path can noticeably hurt responsiveness of pointer events and the canvas.
  const deferredMaxLineChars = useDeferredValue(resultPanelUiState.maxLineChars);
  const { resultRef, resultStyle, fontSize } = useResultTypography({
    enabled: resultPanelUiState.mode !== "usage",
    maxLineChars: deferredMaxLineChars,
  });

  const rowHeight = fontSize != null ? Math.ceil(fontSize * 1.2) : 22;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VirtualListHandle | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const mouseClientPosRef = useRef<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const runtimeActionsRef = useRef(runtimeActions);
  runtimeActionsRef.current = runtimeActions;
  const virtualRowsRef = useRef(getState().resultVirtualRows);

  // Drive virtual panel updates imperatively, bypassing React's render cycle
  // for row data, header, and footer. During objective rotation the solver
  // writes fresh results at animation speed; routing these through
  // useSyncExternalStore + reconciliation adds latency on the hot path.
  useLayoutEffect(() => {
    const s0 = getState();
    virtualRowsRef.current = s0.resultVirtualRows;
    if (headerRef.current) headerRef.current.textContent = s0.resultVirtualHeader ?? "";
    if (footerRef.current) {
      footerRef.current.textContent = s0.resultVirtualFooter ?? "";
      footerRef.current.style.display = s0.resultVirtualFooter ? "" : "none";
    }
    listRef.current?.paint();

    let prevRows = s0.resultVirtualRows;
    let prevHeader = s0.resultVirtualHeader;
    let prevFooter = s0.resultVirtualFooter;

    return subscribe((s) => {
      if (s.resultVirtualRows !== prevRows) {
        prevRows = s.resultVirtualRows;
        virtualRowsRef.current = s.resultVirtualRows;
        listRef.current?.paint();
      }
      if (s.resultVirtualHeader !== prevHeader) {
        prevHeader = s.resultVirtualHeader;
        if (headerRef.current) headerRef.current.textContent = s.resultVirtualHeader ?? "";
      }
      if (s.resultVirtualFooter !== prevFooter) {
        prevFooter = s.resultVirtualFooter;
        if (footerRef.current) {
          footerRef.current.textContent = s.resultVirtualFooter ?? "";
          footerRef.current.style.display = s.resultVirtualFooter ? "" : "none";
        }
      }
    });
  }, []);

  // rowHeight is React-owned (driven by useResultTypography) — repaint when
  // it changes so row positions pick up the new height.
  useLayoutEffect(() => {
    listRef.current?.paint();
  }, [rowHeight]);

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
                key={index}
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
          <div className="iterate-header" ref={headerRef} />
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
          <div className="iterate-footer" ref={footerRef} />
        </div>
      </div>
    </TerminalFrame>
  );
}
