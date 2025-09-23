import { render } from "solid-js/web";
import RootApp from "./RootApp";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element for Solid bootstrap.");
}

render(() => <RootApp />, root);
