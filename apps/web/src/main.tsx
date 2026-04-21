import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { TourProvider } from "@/providers/TourProvider";
import "@/style.css";
import { StrictMode } from "react";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Root element with id "root" not found');
}

createRoot(container).render(
  <StrictMode>
    <TourProvider>
      <App />
    </TourProvider>
  </StrictMode>,
);
