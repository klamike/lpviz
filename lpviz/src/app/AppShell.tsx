import { LegacyRuntimeElementsProvider } from "./legacyRuntimeElements";
import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";

export function AppShell() {
  return (
    <LegacyRuntimeElementsProvider>
      <header>
        <Sidebar />
      </header>
      <CanvasStage />
    </LegacyRuntimeElementsProvider>
  );
}
