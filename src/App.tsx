import { LpvizRuntimeProvider } from "./LpvizRuntimeProvider";
import { CanvasStage } from "./features/canvas/components/CanvasStage";
import { OnboardingUiProvider } from "./features/onboarding/OnboardingProvider";
import { Sidebar } from "./features/shell/components/Sidebar";
import { SmallScreenOverlay } from "./features/shell/components/SmallScreenOverlay";
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
