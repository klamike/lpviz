import { useLegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { lpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import {
  areInequalitiesUiStatesEqual,
  areTopResultUiStatesEqual,
  selectInequalitiesUiState,
  selectTopResultUiState,
} from "../../app/uiSelectors";
import { TerminalFrame } from "../layout/TerminalFrame";
import { useNullStateLogo } from "./useNullStateLogo";

export function TopResultPanel() {
  const refs = useLegacyRuntimeElementRefs();
  const topResultUiState = useLpvizSelector(selectTopResultUiState, areTopResultUiStatesEqual);
  const inequalitiesUiState = useLpvizSelector(selectInequalitiesUiState, areInequalitiesUiStatesEqual);
  useNullStateLogo(refs.nullStateMessage);

  return (
    <TerminalFrame containerId="terminal-container2" delayClassName="scanlines--delay-8">
      <div id="topResult" ref={refs.topResult}>
        <div id="nullStateMessage" ref={refs.nullStateMessage} className={topResultUiState.nullStateVisible ? undefined : "is-hidden"} aria-label="lpviz logo"></div>
        <div id="maximize" ref={refs.maximize} className={topResultUiState.maximizeVisible ? "is-block" : "is-hidden"}>maximize</div>
        <div
          id="objectiveDisplay"
          ref={refs.objectiveDisplay}
          className={topResultUiState.objectiveActive ? "objective-item objective-active" : undefined}
        >
          {topResultUiState.objectiveDisplayText}
        </div>
        <div id="subjectTo" ref={refs.subjectTo} className={topResultUiState.subjectToVisible ? "is-block" : "is-hidden"}>subject to</div>
        <div id="inequalities" ref={refs.inequalities}>
          {inequalitiesUiState.message !== null
            ? inequalitiesUiState.message
            : inequalitiesUiState.items.map((inequality, index) => (
              <div
                key={`${index}-${inequality}`}
                className="inequality-item"
                onMouseEnter={() => {
                  lpvizRuntimeCommands.setConstraintHighlight(index);
                }}
                onMouseLeave={() => {
                  lpvizRuntimeCommands.setConstraintHighlight(null);
                }}
              >
                {inequality}
              </div>
            ))}
        </div>
      </div>
    </TerminalFrame>
  );
}
