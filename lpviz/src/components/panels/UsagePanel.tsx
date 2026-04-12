import { useLegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { lpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import { areResultPanelUiStatesEqual, selectResultPanelUiState } from "../../app/uiSelectors";
import { TerminalFrame } from "../layout/TerminalFrame";

export function UsagePanel() {
  const refs = useLegacyRuntimeElementRefs();
  const resultPanelUiState = useLpvizSelector(selectResultPanelUiState, areResultPanelUiStatesEqual);

  return (
    <TerminalFrame containerId="terminal-container" delayClassName="scanlines--delay-12">
      <div id="result" ref={refs.result}>
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
          <div id="resultBlocksContent">
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
        <div className={resultPanelUiState.mode === "virtual" ? undefined : "is-hidden"}>
          <div className="iterate-header">{resultPanelUiState.virtualHeader ?? ""}</div>
          <div
            id="resultVirtualHost"
            ref={refs.resultVirtualHost}
            className="iterate-scroll"
          >
            {resultPanelUiState.virtualShowEmpty ? (
              <div className="iterate-item-nohover">No iterations available.</div>
            ) : null}
          </div>
          {resultPanelUiState.virtualFooter ? <div className="iterate-footer">{resultPanelUiState.virtualFooter}</div> : null}
        </div>
      </div>
    </TerminalFrame>
  );
}
