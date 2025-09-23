import { createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import CentralApp from "./CentralApp";
import ZoomControls from "./ZoomControls";
import { initializeLegacyApplication } from "../legacy/legacyMain";
import {
  adjustFontSize,
  adjustLogoFontSize,
  adjustTerminalHeight,
  calculateMinSidebarWidth,
} from "../utils/uiHelpers";

const zoomMount = document.getElementById("zoomControls");
if (!zoomMount) {
  throw new Error("Missing #zoomControls element for Solid zoom controls.");
}

export function RootApp() {
  const [sidebarWidth, setSidebarWidth] = createSignal<number>(
    document.getElementById("sidebar")?.offsetWidth ?? 450,
  );
  const [isResizing, setIsResizing] = createSignal(false);

  onMount(() => {
    initializeLegacyApplication();
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebarHandle");
    if (!sidebar || !handle) {
      console.warn("Sidebar or handle missing; resize disabled.");
      return;
    }

    const minSidebarWidth = calculateMinSidebarWidth();
    setSidebarWidth(sidebar.offsetWidth || minSidebarWidth);

    const onMouseMove = (event: MouseEvent) => {
      if (!isResizing()) return;
      const newWidth = Math.max(minSidebarWidth, Math.min(event.clientX, 1000));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
    };

    const onMouseDown = (event: MouseEvent) => {
      setIsResizing(true);
      event.preventDefault();
    };

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    onCleanup(() => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    });
  });

  createEffect(() => {
    const width = sidebarWidth();
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebarHandle");
    if (sidebar) sidebar.style.width = `${width}px`;
    if (handle) handle.style.left = `${width}px`;

    adjustFontSize();
    adjustLogoFontSize();
    adjustTerminalHeight();

    const evt = new CustomEvent("sidebar-width-change", { detail: width });
    document.dispatchEvent(evt);
  });

  return (
    <>
      <CentralApp />
      <Portal mount={zoomMount}>
        <ZoomControls />
      </Portal>
    </>
  );
}

export default RootApp;
