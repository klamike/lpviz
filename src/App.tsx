import { onMount } from "solid-js";
import ActionControls from "./components/ActionControls";
import SolverControls from "./components/SolverControls";
import TerminalPanel from "./components/TerminalPanel";
import TopResult from "./components/TopResult";
import { initializeLegacyApplication } from "./legacy/legacyMain";

export default function App() {
  onMount(() => {
    initializeLegacyApplication();
  });

  return (
    <>
      <TopResult />
      <SolverControls />
      <ActionControls />
      <TerminalPanel />
    </>
  );
}
