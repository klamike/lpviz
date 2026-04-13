import { CameraRig } from "./CameraRig";
import { GridLayer } from "./GridLayer";
import { PolytopeBaseLayer } from "./PolytopeBaseLayer";

export function SceneRoot() {
  return (
    <>
      <CameraRig />
      <GridLayer />
      <PolytopeBaseLayer />
    </>
  );
}
