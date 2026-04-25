import { useEffect, useRef } from "react";

import type { ViewportBridge } from "@/features/viewport/types";
import { SceneManager } from "@/canvas3d/SceneManager";
import { CameraController } from "@/canvas3d/controllers/CameraController";
import { ControlsController } from "@/canvas3d/controllers/ControlsController";
import { TransitionController } from "@/canvas3d/controllers/TransitionController";
import { SharedMaterialsController } from "@/canvas3d/controllers/SharedMaterialsController";
import { GridLayer } from "@/canvas3d/layers/GridLayer";
import { PolytopeBaseLayer } from "@/canvas3d/layers/PolytopeBaseLayer";
import { PolytopeRubberBandLayer } from "@/canvas3d/layers/PolytopeRubberBandLayer";
import { ObjectiveLayer } from "@/canvas3d/layers/ObjectiveLayer";
import { TraceLineLayer } from "@/canvas3d/layers/TraceLineLayer";
import { TracePointsLayer } from "@/canvas3d/layers/TracePointsLayer";
import { PolytopeVerticesLayer } from "@/canvas3d/layers/PolytopeVerticesLayer";
import { ConstraintHighlightLayer } from "@/canvas3d/layers/ConstraintHighlightLayer";
import { IterateLineLayer } from "@/canvas3d/layers/IterateLineLayer";
import { IteratePointsLayer } from "@/canvas3d/layers/IteratePointsLayer";
import { IterateRestartPointsLayer } from "@/canvas3d/layers/IterateRestartPointsLayer";
import { IterateStarLayer } from "@/canvas3d/layers/IterateStarLayer";
import { IterateHighlightLayer } from "@/canvas3d/layers/IterateHighlightLayer";
import type { Layer } from "@/canvas3d/Layer";

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

    // Register transition tick
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
