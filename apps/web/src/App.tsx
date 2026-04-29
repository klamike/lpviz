import { CanvasStage } from "@/components/canvas/CanvasStage";
import { SmallScreenOverlay } from "@/components/overlays/SmallScreenOverlay";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { LpvizProvider } from "@/providers/LpvizProvider";

function App() {
  const { sidebarWidth, topResultRef, beginResize } = useSidebarLayout();

  return (
    <LpvizProvider sidebarWidth={sidebarWidth}>
      <Sidebar sidebarWidth={sidebarWidth} topResultRef={topResultRef} />
      <CanvasStage sidebarWidth={sidebarWidth} onResizeStart={beginResize} />
      <SmallScreenOverlay />
    </LpvizProvider>
  );
}

export default App;
