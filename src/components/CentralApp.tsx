import ActionControls from "./ActionControls";
import SolverControls from "./SolverControls";
import TerminalPanel from "./TerminalPanel";
import TopResult from "./TopResult";

export function CentralApp() {
  return (
    <div id="uiContainer">
      <TopResult />
      <SolverControls />
      <ActionControls />
      <TerminalPanel />
    </div>
  );
}

export default CentralApp;
