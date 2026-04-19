import { CanvasStage } from "@/components/canvas/CanvasStage";
import { SmallScreenOverlay } from "@/components/overlays/SmallScreenOverlay";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { LpvizController } from "@/controller/LpvizController";
import { useSidebarLayout } from "@/hooks/useSidebarLayout";

export function App() {
  const { sidebarWidth, topResultRef, beginResize } = useSidebarLayout();

  return (
    <LpvizController sidebarWidth={sidebarWidth}>
      <Sidebar sidebarWidth={sidebarWidth} topResultRef={topResultRef} />
      <CanvasStage sidebarWidth={sidebarWidth} onResizeStart={beginResize} />
      <SmallScreenOverlay />
    </LpvizController>
  );
}
