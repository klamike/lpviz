import { render } from "solid-js/web";
import ZoomControls from "./ZoomControls";

const zoomRoot = document.getElementById("zoomControls");
if (!zoomRoot) {
  throw new Error("Missing #zoomControls element for Solid zoom controls.");
}

render(() => <ZoomControls />, zoomRoot);
