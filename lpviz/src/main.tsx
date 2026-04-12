import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import "../style.css";
import { App } from "./app/App";
import { initializeUI } from "./ui/interaction/initialize";
import { renderNullStateLogo } from "./ui/logo";

const getRequiredElementById = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id) as T | null;
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

async function initializeApplication() {
  const canvas = getRequiredElementById<HTMLCanvasElement>("gridCanvas");
  renderNullStateLogo(getRequiredElementById<HTMLElement>("nullStateMessage"));
  const params = new URLSearchParams(window.location.search);
  await initializeUI(canvas, params);
}

const container = document.getElementById("root");

if (!container) {
  throw new Error('Root element with id "root" not found');
}

const root = createRoot(container);

flushSync(() => {
  root.render(<App />);
});

initializeApplication().catch((err) => {
  console.error("Failed to initialize lpviz", err);
});
