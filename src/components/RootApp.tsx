import { onMount } from "solid-js";
import { Portal } from "solid-js/web";
import CentralApp from "./CentralApp";
import ZoomControls from "./ZoomControls";
import { initializeLegacyApplication } from "../legacy/legacyMain";

const zoomMount = document.getElementById("zoomControls");
if (!zoomMount) {
  throw new Error("Missing #zoomControls element for Solid zoom controls.");
}

export function RootApp() {
  onMount(() => {
    initializeLegacyApplication();
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
