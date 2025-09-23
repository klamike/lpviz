import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import CentralApp from "./CentralApp";
import ZoomControls from "./ZoomControls";
import HelpPopup from "./HelpPopup";
import {
  initializeLegacyApplication,
  MIN_SCREEN_WIDTH,
} from "../legacy/legacyMain";
import {
  adjustFontSize,
  adjustLogoFontSize,
  adjustTerminalHeight,
} from "../utils/uiHelpers";
import {
  calculateMinSidebarWidth,
  calculateTerminalHeight,
} from "../utils/solidHelpers";
import { LegacyProvider } from "../context/LegacyContext";
import { GuidedTourProvider } from "../context/GuidedTourContext";
import { state } from "../state/state";

import type { LegacyHandles } from "../legacy/legacyMain";

export function RootApp() {
  const [sidebarWidth, setSidebarWidth] = createSignal<number>(450);
  const [isResizing, setIsResizing] = createSignal(false);
  const [legacyHandles, setLegacyHandles] = createSignal<LegacyHandles | null>(
    null,
  );

  let sidebarRef: HTMLDivElement | undefined;
  let handleRef: HTMLDivElement | undefined;

  onMount(() => {
    const handles = initializeLegacyApplication();
    setLegacyHandles(handles);

    if (!sidebarRef || !handleRef) {
      console.warn("Sidebar or handle missing; resize disabled.");
      return;
    }

    // Use default values for logo text calculation since the component may not be mounted yet
    const minSidebarWidth = calculateMinSidebarWidth("lpviz");
    setSidebarWidth(sidebarRef.offsetWidth || minSidebarWidth);

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

    handleRef.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    onCleanup(() => {
      handleRef?.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    });
  });

  createEffect(() => {
    const width = sidebarWidth();
    if (sidebarRef) sidebarRef.style.width = `${width}px`;
    if (handleRef) handleRef.style.left = `${width}px`;

    adjustFontSize();
    adjustLogoFontSize();
    adjustTerminalHeight();

    const evt = new CustomEvent("sidebar-width-change", { detail: width });
    document.dispatchEvent(evt);
  });

  return (
    <>
      <div id="sidebar" ref={(el) => (sidebarRef = el)}>
        <div id="sidebarContent" style={{ "overflow-y": "auto" }}>
          <div
            class="header controlPanel"
            style={{
              "padding-top": "13px",
              "margin-top": "0px",
              "margin-bottom": "0px",
            }}
          >
            <h1>lpviz</h1>
            <a
              href="https://github.com/klamike/lpviz"
              target="_blank"
              aria-label="GitHub Repository for lpviz"
              rel="noreferrer"
            >
              <svg
                class="github-icon"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 98 96"
                role="img"
                aria-labelledby="githubTitle"
              >
                <title id="githubTitle">GitHub</title>
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                  fill="currentColor"
                />
              </svg>
            </a>
          </div>
          <Show when={legacyHandles()} fallback={<div id="uiContainer"></div>}>
            {(handles) => (
              <LegacyProvider value={handles()}>
                <GuidedTourProvider
                  canvasManager={handles().canvasManager}
                  sendPolytope={handles().sendPolytope}
                  saveToHistory={handles().saveToHistory}
                >
                  <CentralApp />
                  <HelpPopup />
                </GuidedTourProvider>
              </LegacyProvider>
            )}
          </Show>
        </div>
      </div>
      <div id="sidebarHandle" ref={(el) => (handleRef = el)}></div>
      <canvas id="gridCanvas" tabindex={0}></canvas>
      <div id="zoomControls">
        <Show when={legacyHandles()}>
          {(handles) => (
            <LegacyProvider value={handles()}>
              <ZoomControls />
            </LegacyProvider>
          )}
        </Show>
      </div>
      <Portal>
        <Show when={state.isScreenTooSmall}>
          <div id="smallScreenOverlay" class="small-screen-overlay">
            The window is not wide enough ({state.viewportWidth}px &lt;{" "}
            {MIN_SCREEN_WIDTH}px) for lpviz.
          </div>
        </Show>
      </Portal>
    </>
  );
}

export default RootApp;
