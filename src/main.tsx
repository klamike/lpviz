import { render } from "solid-js/web";
import App from "./App";
import ZoomControls from "./components/ZoomControls";

const zoomRoot = document.getElementById("zoomControls");
if (!zoomRoot) {
  throw new Error("Missing #zoomControls element for Solid zoom controls.");
}

render(() => <ZoomControls />, zoomRoot);

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element for Solid bootstrap.");
}

render(() => <App />, root);
