import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";
import { useSidebarLayout } from "../components/layout/useSidebarLayout";
import { SmallScreenOverlay } from "./SmallScreenOverlay";

export function App() {
  const { sidebarWidth, topResultRef, beginResize } = useSidebarLayout();

  return (
    <>
      <Sidebar sidebarWidth={sidebarWidth} topResultRef={topResultRef} />
      <CanvasStage sidebarWidth={sidebarWidth} onResizeStart={beginResize} />
      <SmallScreenOverlay />
    </>
  );
}
