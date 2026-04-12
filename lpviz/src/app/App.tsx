import { useRef } from "react";

import { AppShell } from "./AppShell";
import { useLegacyLpvizBridge } from "./useLegacyLpvizBridge";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nullStateMessageRef = useRef<HTMLDivElement>(null);

  useLegacyLpvizBridge({
    canvasRef,
    nullStateMessageRef,
  });

  return <AppShell canvasRef={canvasRef} nullStateMessageRef={nullStateMessageRef} />;
}
