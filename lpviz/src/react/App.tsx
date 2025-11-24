import { useEffect, useState } from "react";
import type { ResultRenderPayload } from "../solvers/worker/solverService";
import { CanvasSurface } from "./components/CanvasSurface";
import { Sidebar } from "./components/Sidebar";
import { ZoomControls } from "./components/ZoomControls";
import { usePolytopeSync } from "./hooks/usePolytopeSync";
import { useSolverRunner } from "./logic/solverRunner";
import { loadStateFromUrl } from "./utils/share";
import { mutate } from "../state/store";

export function App() {
  usePolytopeSync();
  const [result, setResult] = useState<ResultRenderPayload | null>(null);
  const { run, loading, error, handleHover } = useSolverRunner((payload) =>
    setResult(payload)
  );

  useEffect(() => {
    loadStateFromUrl();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s") {
        mutate((draft) => {
          draft.snapToGrid = !draft.snapToGrid;
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      <div className="small-screen-overlay">
        <div>
          lpviz works best on a larger screen. Try resizing or rotating your
          device. The React + R3F version is still stabilizing—desktop is
          recommended for now.
        </div>
      </div>
      <header>
        <Sidebar
          result={result}
          onSolve={() => run()}
          onHoverRow={handleHover}
          loading={loading}
          error={error}
        />
      </header>
      <main>
        <CanvasSurface />
        <ZoomControls />
        <div id="sidebarHandle"></div>
      </main>
    </>
  );
}
