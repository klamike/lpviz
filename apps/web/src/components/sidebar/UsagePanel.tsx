import { useCallback, useEffect, useRef } from "react";
import { AutoSizer, List, type ListRowProps } from "react-virtualized";

import { useLpvizStore } from "@/features/core/store";
import { areResultPanelUiStatesEqual, selectResultPanelUiState } from "@/features/core/selectors";

import { TerminalFrame } from "@/components/sidebar/TerminalFrame";
import { useAppActions } from "@/features/core/actions";
import { useResultTypography } from "@/hooks/useResultTypography";

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

  // Row height must stay in sync with the List's rowHeight prop.
  const rowHeight = fontSize != null ? Math.ceil(fontSize * 1.2) : 22;

  // Refs kept current every render so RAF/scroll callbacks always see latest values.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List | null>(null);
  const mouseClientPosRef = useRef<{ x: number; y: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const runtimeActionsRef = useRef(runtimeActions);
  runtimeActionsRef.current = runtimeActions;
  const virtualRowsRef = useRef(resultPanelUiState.virtualRows);
  virtualRowsRef.current = resultPanelUiState.virtualRows;

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
        // Compute row under cursor from geometry instead of elementFromPoint —
        // elementFromPoint lags behind compositor-thread scroll and returns wrong
        // results during active scrolling.
        const relY = pos.y - r.top + scrollTopRef.current;
        const idx = Math.floor(relY / rowHeightRef.current);
        const rows = virtualRowsRef.current;
        if (idx >= 0 && idx < rows.length) {
          const row = rows[idx];
          runtimeActionsRef.current.setIterateHighlight(row?.index ?? null);
        } else {
          runtimeActionsRef.current.setIterateHighlight(null);
        }
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  // Sync scrollTop so the RAF loop always has the current scroll position.
  const handleListScroll = useCallback(({ scrollTop }: { scrollTop: number }) => {
    scrollTopRef.current = scrollTop;
  }, []);

  useEffect(() => {
    listRef.current?.recomputeRowHeights(0);
  }, [rowHeight]);

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

  // wheel events fire even when the browser suppresses mousemove during scroll
  const handleScrollAreaWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    mouseClientPosRef.current = { x: e.clientX, y: e.clientY };
    startHighlightTracking();
  }, [startHighlightTracking]);

  const renderVirtualRow = useCallback(
    ({ index, key, style }: ListRowProps) => {
      const row = resultPanelUiState.virtualRows[index];
      if (!row) return null;
      return (
        <div key={key} style={style} className={row.className} data-index={row.index}>
          {row.text}
        </div>
      );
    },
    [resultPanelUiState.virtualRows],
  );

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
              <AutoSizer>
                {({ width, height }) =>
                  width > 0 && height > 0 ? (
                    <List
                      ref={listRef}
                      width={width}
                      height={height}
                      rowCount={resultPanelUiState.virtualRows.length}
                      rowHeight={rowHeight}
                      overscanRowCount={25}
                      rowRenderer={renderVirtualRow}
                      onScroll={handleListScroll}
                    />
                  ) : null
                }
              </AutoSizer>
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
