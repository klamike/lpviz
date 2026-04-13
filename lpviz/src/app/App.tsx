import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";
import { useSidebarLayout } from "../components/layout/useSidebarLayout";
import { LpvizRuntimeProvider } from "./lpvizRuntime";
import { OnboardingUiProvider } from "./onboardingUi";
import { SmallScreenOverlay } from "./SmallScreenOverlay";

function AppContent() {
  const { sidebarWidth, topResultRef, beginResize } = useSidebarLayout();

  return (
    <>
      <Sidebar sidebarWidth={sidebarWidth} topResultRef={topResultRef} />
      <CanvasStage sidebarWidth={sidebarWidth} onResizeStart={beginResize} />
      <SmallScreenOverlay />
    </>
  );
}

export function App() {
  return (
    <LpvizRuntimeProvider>
      <OnboardingUiProvider>
        <AppContent />
      </OnboardingUiProvider>
    </LpvizRuntimeProvider>
  );
}
