import { useEffect, useRef } from "react";

import type { ViewportBridge } from "@/features/viewport/types";
import { SceneManager } from "@/three/SceneManager";
import { CameraController } from "@/three/controllers/CameraController";
import { ControlsController } from "@/three/controllers/ControlsController";
import { TransitionController } from "@/three/controllers/TransitionController";
import { SharedMaterialsController } from "@/three/controllers/SharedMaterialsController";
import { GridLayer } from "@/three/layers/GridLayer";
import { PolytopeBaseLayer } from "@/three/layers/PolytopeBaseLayer";
import { PolytopeRubberBandLayer } from "@/three/layers/PolytopeRubberBandLayer";
import { ObjectiveLayer } from "@/three/layers/ObjectiveLayer";
import { TraceLineLayer } from "@/three/layers/TraceLineLayer";
import { TracePointsLayer } from "@/three/layers/TracePointsLayer";
import { PolytopeVerticesLayer } from "@/three/layers/PolytopeVerticesLayer";
import { ConstraintHighlightLayer } from "@/three/layers/ConstraintHighlightLayer";
import { IterateLineLayer } from "@/three/layers/IterateLineLayer";
import { IteratePointsLayer } from "@/three/layers/IteratePointsLayer";
import { IterateRestartPointsLayer } from "@/three/layers/IterateRestartPointsLayer";
import { IterateStarLayer } from "@/three/layers/IterateStarLayer";
import { IterateHighlightLayer } from "@/three/layers/IterateHighlightLayer";
import type { Layer } from "@/three/Layer";

export function LpvizCanvasGL({
  onBridgeReady,
  onBridgeDispose,
}: {
  onBridgeReady: (bridge: ViewportBridge) => void;
  onBridgeDispose?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mgr = new SceneManager(canvas, { dpr: [1, 2] });
    const cameraCtl = new CameraController(mgr);
    const controlsCtl = new ControlsController(mgr);
    const transitionCtl = new TransitionController(mgr);
    const materialsCtl = new SharedMaterialsController(mgr);

    mgr.addTick(() => transitionCtl.tick());

    const layers: Layer[] = [
      new GridLayer(),
      new PolytopeBaseLayer(),
      new PolytopeRubberBandLayer(),
      new ObjectiveLayer(),
      new TraceLineLayer(),
      new ConstraintHighlightLayer(),
      new PolytopeVerticesLayer(),
      new TracePointsLayer(),
      new IterateLineLayer(),
      new IteratePointsLayer(),
      new IterateRestartPointsLayer(),
      new IterateStarLayer(),
      new IterateHighlightLayer(),
    ];
    for (const l of layers) mgr.addLayer(l);

    onBridgeReady({
      getCanvasElement: () => canvas,
      getCanvasRect: () => canvas.getBoundingClientRect(),
      invalidate: () => mgr.invalidate(),
    });

    mgr.start();

    return () => {
      for (const l of layers) {
        mgr.removeLayer(l);
        l.dispose();
      }
      controlsCtl.dispose();
      cameraCtl.dispose();
      transitionCtl.dispose();
      materialsCtl.dispose();
      mgr.dispose();
      onBridgeDispose?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="canvas-stage__gl-canvas"
      tabIndex={0}
    />
  );
}
