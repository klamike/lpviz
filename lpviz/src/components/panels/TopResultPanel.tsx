import { TerminalFrame } from "../layout/TerminalFrame";
import { useNullStateLogo } from "./useNullStateLogo";

export function TopResultPanel() {
  const nullStateMessageRef = useNullStateLogo();

  return (
    <TerminalFrame containerId="terminal-container2" delayClassName="scanlines--delay-8">
      <div id="topResult">
        <div id="nullStateMessage" ref={nullStateMessageRef} aria-label="lpviz logo"></div>
        <div id="maximize">maximize</div>
        <div id="objectiveDisplay"></div>
        <div id="subjectTo">subject to</div>
        <div id="inequalities"></div>
      </div>
    </TerminalFrame>
  );
}
