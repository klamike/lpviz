export function TerminalPanel() {
  return (
    <div id="terminal-container">
      <div id="result">
        <div id="usageTips">
          <br />
          <br />
          <strong class="usage-title">Usage Tips:</strong>
          <br />
          <br />
          <strong>Draw a polygon</strong>: click to add vertices
          <br />
          <strong>Select a solver</strong>: select a solver and click <strong>Solve</strong>
          <br />
          <strong>Change objective</strong>: drag it or click <strong>Rotate Objective</strong>
          <br />
          <strong>Add new vertices</strong>: double‐click an edge
          <br />
          <strong>Move vertices</strong>: drag vertices to reshape
          <br />
          <strong>Press S</strong>: toggle snapping to the grid
          <br />
          <strong>3D Mode</strong>: click 3D button, hold Shift+drag to rotate
          <br />
          <strong>Z Scale</strong>: adjust slider to scale z-axis
          <br />
          <strong>Reset</strong>: refresh the page
          <br />
          <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo
          <br />
        </div>
      </div>
      <div id="terminal-window"></div>
      <div class="scanlines"></div>
      <div class="scanlines" style="--delay: -12s"></div>
    </div>
  );
}

export default TerminalPanel;
