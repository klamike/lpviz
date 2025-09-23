import { onMount } from "solid-js";
import { initializeLegacyApplication } from "./legacy/legacyMain";

export default function App() {
  onMount(() => {
    initializeLegacyApplication();
  });

  return <></>;
}
