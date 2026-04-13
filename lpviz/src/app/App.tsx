import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";
import { LegacyRuntimeElementsProvider } from "./legacyRuntimeElements";
import { SmallScreenOverlay } from "./SmallScreenOverlay";

export function App() {
  return (
    <LegacyRuntimeElementsProvider>
      <Sidebar />
      <CanvasStage />
      <SmallScreenOverlay />
    </LegacyRuntimeElementsProvider>
  );
}
