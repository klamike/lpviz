import { initializeUI } from "./ui/interaction/initialize";
import { getRequiredElementById } from "./ui/interaction/controlPanel";

async function initializeApplication() {
  const canvas = getRequiredElementById<HTMLCanvasElement>("gridCanvas");
  const params = new URLSearchParams(window.location.search);
  await initializeUI(canvas, params);
}

initializeApplication().catch((err) => {
  console.error("Failed to initialize lpviz", err);
});
