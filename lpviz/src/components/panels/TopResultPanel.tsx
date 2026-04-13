import type { RefObject } from "react";

import { lpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import {
  areInequalitiesUiStatesEqual,
  areTopResultUiStatesEqual,
  selectInequalitiesUiState,
  selectTopResultUiState,
} from "../../app/uiSelectors";
import { NullStateLogo } from "../logo/NullStateLogo";
import { TerminalFrame } from "../layout/TerminalFrame";

export function TopResultPanel({ topResultRef }: { topResultRef: RefObject<HTMLDivElement | null> }) {
  const topResultUiState = useLpvizSelector(selectTopResultUiState, areTopResultUiStatesEqual);
  const inequalitiesUiState = useLpvizSelector(selectInequalitiesUiState, areInequalitiesUiStatesEqual);

  return (
    <TerminalFrame containerId="terminal-container2" delayClassName="scanlines--delay-8">
      <div id="topResult" ref={topResultRef}>
        <div id="nullStateMessage" className={topResultUiState.nullStateVisible ? undefined : "is-hidden"} aria-label="lpviz logo">
          <NullStateLogo />
        </div>
        <div id="maximize" className={topResultUiState.maximizeVisible ? "is-block" : "is-hidden"}>maximize</div>
        <div
          id="objectiveDisplay"
          className={topResultUiState.objectiveActive ? "objective-item objective-active" : undefined}
        >
          {topResultUiState.objectiveDisplayText}
        </div>
        <div id="subjectTo" className={topResultUiState.subjectToVisible ? "is-block" : "is-hidden"}>subject to</div>
        <div id="inequalities">
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
