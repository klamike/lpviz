import { render } from "solid-js/web";
import App from "./App";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element for Solid bootstrap.");
}

render(() => <App />, root);
