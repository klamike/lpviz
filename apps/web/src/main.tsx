import { createRoot } from "react-dom/client";

import { App } from "./App";
import { LpvizRuntimeProvider } from "./providers/LpvizRuntimeProvider";
import { TourProvider } from "./providers/TourProvider";
import "./style.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Root element with id "root" not found');
}

createRoot(container).render(
  <LpvizRuntimeProvider>
    <TourProvider>
      <App />
    </TourProvider>
  </LpvizRuntimeProvider>,
);
