import { LpvizRuntimeProvider } from "./context/LpvizRuntimeProvider";
import { CanvasStage } from "./features/canvas/CanvasStage";
import { OnboardingUiProvider } from "./features/onboarding/OnboardingProvider";
import { Sidebar } from "./features/shell/Sidebar";
import { SmallScreenOverlay } from "./features/shell/SmallScreenOverlay";
import { useSidebarLayout } from "./hooks/useSidebarLayout";

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
