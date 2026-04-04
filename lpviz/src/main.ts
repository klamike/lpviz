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

initializeApplication().catch((err) => {
  console.error("Failed to initialize lpviz", err);
});
