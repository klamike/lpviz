import { Canvas } from "@react-three/fiber";

import { ViewportBridge, type R3FViewportBridge } from "./ViewportBridge";
import { SceneRoot } from "./scene/SceneRoot";

export type { R3FViewportBridge } from "./ViewportBridge";

export function LpvizCanvas({
  onBridgeReady,
  onBridgeDispose,
}: {
  onBridgeReady: (bridge: R3FViewportBridge) => void;
  onBridgeDispose?: () => void;
}) {
  return (
    <Canvas
      className="canvas-stage__r3f"
      frameloop="demand"
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <ViewportBridge onReady={onBridgeReady} onDispose={onBridgeDispose} />
      <SceneRoot />
    </Canvas>
  );
}
