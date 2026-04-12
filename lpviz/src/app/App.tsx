import { LegacyRuntimeElementsProvider } from "./legacyRuntimeElements";
import { SmallScreenOverlay } from "./SmallScreenOverlay";
import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";

export function App() {
  return (
    <LegacyRuntimeElementsProvider>
      <header>
        <Sidebar />
      </header>
      <CanvasStage />
      <SmallScreenOverlay />
    </LegacyRuntimeElementsProvider>
  );
}
