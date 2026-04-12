import type { RefObject } from "react";

import { CanvasStage } from "../components/layout/CanvasStage";
import { Sidebar } from "../components/layout/Sidebar";

type AppShellProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nullStateMessageRef: RefObject<HTMLDivElement | null>;
};

export function AppShell({ canvasRef, nullStateMessageRef }: AppShellProps) {
  return (
    <>
      <header>
        <Sidebar nullStateMessageRef={nullStateMessageRef} />
      </header>
      <CanvasStage canvasRef={canvasRef} />
    </>
  );
}
