import { useFrame } from "@react-three/fiber";

import { tickSharedLineMaterialResolutions } from "./sharedLineMaterials";
import { CameraRig } from "./CameraRig";
import { ConstraintHighlightLayer } from "./ConstraintHighlightLayer";
import { ControlsRig } from "./ControlsRig";
import { GridLayer } from "./GridLayer";
import { IterateHighlightLayer } from "./IterateHighlightLayer";
import { IterateLineLayer } from "./IterateLineLayer";
import { IteratePointsLayer } from "./IteratePointsLayer";
import { IterateRestartPointsLayer } from "./IterateRestartPointsLayer";
import { IterateStarLayer } from "./IterateStarLayer";
import { ObjectiveLayer } from "./ObjectiveLayer";
import { PolytopeBaseLayer, PolytopeRubberBandLayer } from "./PolytopeBaseLayer";
import { PolytopeVerticesLayer } from "./PolytopeVerticesLayer";
import { TraceLineLayer } from "./TraceLineLayer";
import { TracePointsLayer } from "./TracePointsLayer";
import { TransitionRig } from "./TransitionRig";

function SharedMaterialsRig() {
  useFrame(({ size }) => {
    tickSharedLineMaterialResolutions(size.width, size.height);
  });
  return null;
}

export function SceneRoot() {
  return (
    <>
      <SharedMaterialsRig />
      <CameraRig />
      <ControlsRig />
      <TransitionRig />
      <GridLayer />
      <PolytopeBaseLayer />
      <PolytopeRubberBandLayer />
      <ObjectiveLayer />
      <TraceLineLayer />
      <ConstraintHighlightLayer />
      <PolytopeVerticesLayer />
      <TracePointsLayer />
      <IterateLineLayer />
      <IteratePointsLayer />
      <IterateRestartPointsLayer />
      <IterateStarLayer />
      <IterateHighlightLayer />
    </>
  );
}
