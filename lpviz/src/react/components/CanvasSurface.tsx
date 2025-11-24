import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { subscribe } from "../../state/store";
import { SceneContent } from "./SceneContent";

function AutoInvalidate() {
  const { invalidate } = useThree();

  useEffect(() => {
    const unsubscribe = subscribe(() => invalidate());
    return () => unsubscribe();
  }, [invalidate]);

  return null;
}

export function CanvasSurface() {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, Math.min(window.devicePixelRatio ?? 1, 1.75)]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      performance={{ min: 0.2 }}
      camera={{ position: [0, 0, 10], near: 0.1, far: 5000 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0xf7f8fb, 1);
      }}
    >
      <AutoInvalidate />
      <SceneContent />
    </Canvas>
  );
}
