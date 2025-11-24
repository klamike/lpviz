import { useMemo, useState } from "react";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";

type Props = {
  payload: ResultRenderPayload | null;
  onHoverRow?: (index: number | null) => void;
};

export function ResultPanel({ payload, onHoverRow }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleEnter = (index: number) => {
    setHoverIndex(index);
    onHoverRow?.(index);
  };
  const handleLeave = () => {
    setHoverIndex(null);
    onHoverRow?.(null);
  };

  if (!payload) {
    return (
      <div id="result">
        <div id="usageTips">
          <br />
          <br />
          <strong className="usage-title">Usage Tips:</strong>
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
          <strong>3D Mode</strong>: click 3D button, left-drag to pan, right-drag to orbit, scroll to zoom
          <br />
          <strong>3D Z Scale</strong>: Shift + scroll or use the Z Scale slider
          <br />
          <strong>Reset</strong>: refresh the page
          <br />
          <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo
          <br />
        </div>
      </div>
    );
  }

  if (payload.type === "html") {
    return <div id="result" dangerouslySetInnerHTML={{ __html: payload.html }} />;
  }

  const rows = useMemo(
    () =>
      payload.rows.map((row, idx) => ({
        text: row,
        idx,
      })),
    [payload.rows]
  );

  return (
    <div id="result" className="virtualized">
      <div className="iterate-header">{payload.header}</div>
      <div className="iterate-scroll">
        {rows.length === 0 ? (
          <div className="iterate-item-nohover">No iterations available.</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.idx}
              className={hoverIndex === row.idx ? "iterate-item hover" : "iterate-item"}
              onMouseEnter={() => handleEnter(row.idx)}
              onMouseLeave={handleLeave}
            >
              {row.text}
            </div>
          ))
        )}
      </div>
      {payload.footer && <div className="iterate-footer">{payload.footer}</div>}
    </div>
  );
}
