import { CameraRig } from "./CameraRig";
import { ConstraintHighlightLayer } from "./ConstraintHighlightLayer";
import { GridLayer } from "./GridLayer";
import { ObjectiveLayer } from "./ObjectiveLayer";
import { PolytopeBaseLayer } from "./PolytopeBaseLayer";
import { PolytopeVerticesLayer } from "./PolytopeVerticesLayer";
import { TraceLineLayer } from "./TraceLineLayer";

export function SceneRoot() {
  return (
    <>
      <CameraRig />
      <GridLayer />
      <PolytopeBaseLayer />
      <ObjectiveLayer />
      <TraceLineLayer />
      <ConstraintHighlightLayer />
      <PolytopeVerticesLayer />
    </>
  );
}
