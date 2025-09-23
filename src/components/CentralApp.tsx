import ActionControls from "./ActionControls";
import SolverControls from "./SolverControls";
import TerminalPanel from "./TerminalPanel";
import TopResult from "./TopResult";

export function CentralApp() {
  return (
    <>
      <TopResult />
      <SolverControls />
      <ActionControls />
      <TerminalPanel />
    </>
  );
}

export default CentralApp;
