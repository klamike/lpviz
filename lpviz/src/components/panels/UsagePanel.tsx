import { useCallback } from "react";
import { AutoSizer, List, type ListRowProps } from "react-virtualized";

import { lpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import { areResultPanelUiStatesEqual, selectResultPanelUiState } from "../../app/uiSelectors";
import { TerminalFrame } from "../layout/TerminalFrame";
import { useResultTypography } from "./useResultTypography";

export function UsagePanel() {
  const resultPanelUiState = useLpvizSelector(selectResultPanelUiState, areResultPanelUiStatesEqual);
  const { resultRef, resultStyle } = useResultTypography({
    enabled: resultPanelUiState.mode !== "usage",
    maxLineChars: resultPanelUiState.maxLineChars,
  });
  const renderVirtualRow = useCallback(({ index, key, style }: ListRowProps) => {
    const row = resultPanelUiState.virtualRows[index];
    if (!row) {
      return null;
    }

    return (
      <div
        key={key}
        style={style}
        className={row.className}
        data-index={row.index}
        onMouseEnter={row.index === undefined ? undefined : () => {
          lpvizRuntimeCommands.setIterateHighlight(row.index ?? null);
        }}
        onMouseLeave={row.index === undefined ? undefined : () => {
          lpvizRuntimeCommands.setIterateHighlight(null);
        }}
      >
        {row.text}
      </div>
    );
  }, [resultPanelUiState.virtualRows]);

  return (
    <TerminalFrame containerId="terminal-container" delayClassName="scanlines--delay-12">
      <div
        id="result"
        ref={resultRef}
        style={resultStyle}
        className={resultPanelUiState.mode === "virtual" ? "virtualized" : undefined}
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
            <strong>Select a solver</strong>: select a solver to solve immediately
            <br />
            <strong>Change objective</strong>: drag it or click <strong>Rotate Objective</strong>
            <br />
            <strong>Add new vertices</strong>: double-click an edge
            <br />
            <strong>Move vertices</strong>: drag vertices to reshape
            <br />
            <strong>Press S</strong>: toggle snapping to the grid
            <br />
            <strong>3D Mode</strong>: click 3D button, left-drag to pan, right-drag to orbit, scroll to zoom
            <br />
            <strong>3D Z Scale</strong>: Shift + scroll or use the Z Scale slider
            <br />
            <strong>Reset</strong>: refresh the page
            <br />
            <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo
            <br />
            <br />
            <mark style={{ backgroundColor: "whitesmoke", color: "black" }}>
              <strong>
                <em>&nbsp;&nbsp;ATTN: Unbounded regions are now supported!&nbsp;&nbsp;</em>
              </strong>
              <br />
              <br />
            </mark>
            <strong>Delete a vertex</strong>: right-click it
            <br />
            <strong>Stop drawing</strong>: press enter
          </div>
        ) : null}
        {resultPanelUiState.mode === "blocks" && resultPanelUiState.blocks !== null ? (
          <div>
            {resultPanelUiState.blocks.map((block, index) => (
              <div
                key={`${index}-${block.className}-${block.text}`}
                className={block.className}
                data-index={block.index}
                onMouseEnter={block.index === undefined ? undefined : () => {
                  lpvizRuntimeCommands.setIterateHighlight(block.index ?? null);
                }}
                onMouseLeave={block.index === undefined ? undefined : () => {
                  lpvizRuntimeCommands.setIterateHighlight(null);
                }}
              >
                {block.text}
              </div>
            ))}
          </div>
        ) : null}
        <div className={`result-virtual-layout ${resultPanelUiState.mode === "virtual" ? "" : "is-hidden"}`.trim()}>
          <div className="iterate-header">{resultPanelUiState.virtualHeader ?? ""}</div>
          <div className="iterate-scroll">
            {resultPanelUiState.virtualShowEmpty ? (
              <div className="iterate-item-nohover">No iterations available.</div>
            ) : (
              <AutoSizer>
                {({ width, height }) => width > 0 && height > 0 ? (
                  <List
                    width={width}
                    height={height}
                    rowCount={resultPanelUiState.virtualRows.length}
                    rowHeight={22}
                    overscanRowCount={25}
                    rowRenderer={renderVirtualRow}
                  />
                ) : null}
              </AutoSizer>
            )}
          </div>
          {resultPanelUiState.virtualFooter ? <div className="iterate-footer">{resultPanelUiState.virtualFooter}</div> : null}
        </div>
      </div>
    </TerminalFrame>
  );
}
