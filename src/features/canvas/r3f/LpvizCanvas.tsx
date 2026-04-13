import { Canvas } from "@react-three/fiber";

function SceneRoot() {
  return null;
}

export function LpvizCanvas() {
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
      {/* Empty R3F host while ViewportManager still renders on the legacy canvas. */}
      <SceneRoot />
    </Canvas>
  );
}
