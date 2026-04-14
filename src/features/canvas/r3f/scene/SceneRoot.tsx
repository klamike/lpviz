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
import { PolytopeBaseLayer } from "./PolytopeBaseLayer";
import { PolytopeVerticesLayer } from "./PolytopeVerticesLayer";
import { TraceLineLayer } from "./TraceLineLayer";
import { TracePointsLayer } from "./TracePointsLayer";
import { TransitionRig } from "./TransitionRig";

export function SceneRoot() {
  return (
    <>
      <CameraRig />
      <ControlsRig />
      <TransitionRig />
      <GridLayer />
      <PolytopeBaseLayer />
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
