import { useLegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { TerminalFrame } from "../layout/TerminalFrame";
import { useNullStateLogo } from "./useNullStateLogo";

export function TopResultPanel() {
  const refs = useLegacyRuntimeElementRefs();
  useNullStateLogo(refs.nullStateMessage);

  return (
    <TerminalFrame containerId="terminal-container2" delayClassName="scanlines--delay-8">
      <div id="topResult" ref={refs.topResult}>
        <div id="nullStateMessage" ref={refs.nullStateMessage} aria-label="lpviz logo"></div>
        <div id="maximize" ref={refs.maximize}>maximize</div>
        <div id="objectiveDisplay" ref={refs.objectiveDisplay}></div>
        <div id="subjectTo" ref={refs.subjectTo}>subject to</div>
        <div id="inequalities" ref={refs.inequalities}></div>
      </div>
    </TerminalFrame>
  );
}
