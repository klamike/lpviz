import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";

export function AppShell() {
  return (
    <>
      <header>
        <Sidebar />
      </header>
      <CanvasStage />
    </>
  );
}
