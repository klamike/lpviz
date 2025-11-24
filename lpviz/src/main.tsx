import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./react/App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root not found");
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
