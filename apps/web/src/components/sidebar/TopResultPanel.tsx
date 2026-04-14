import type { RefObject } from "react";

import {
  areInequalitiesUiStatesEqual,
  areTopResultUiStatesEqual,
  selectInequalitiesUiState,
  selectTopResultUiState,
} from "@lpviz/state";
import { useLpvizSelector } from "@lpviz/state/react";
import { useLpvizRuntime } from "../../providers/LpvizRuntimeProvider";
import { NullStateLogo } from "./NullStateLogo";
import { TerminalFrame } from "./TerminalFrame";

export function TopResultPanel({
  topResultRef,
}: {
  topResultRef: RefObject<HTMLDivElement | null>;
}) {
  const runtimeActions = useLpvizRuntime();
  const topResultUiState = useLpvizSelector(
    selectTopResultUiState,
    areTopResultUiStatesEqual,
  );
  const inequalitiesUiState = useLpvizSelector(
    selectInequalitiesUiState,
    areInequalitiesUiStatesEqual,
  );

  return (
    <TerminalFrame
      containerId="terminal-container2"
      delayClassName="scanlines--delay-8"
    >
      <div id="topResult" ref={topResultRef}>
        <div
          id="nullStateMessage"
          className={
            topResultUiState.nullStateVisible ? undefined : "is-hidden"
          }
          aria-label="lpviz logo"
        >
          <NullStateLogo />
        </div>
        <div
          id="maximize"
          className={
            topResultUiState.maximizeVisible ? "is-block" : "is-hidden"
          }
        >
          maximize
        </div>
        <div
          id="objectiveDisplay"
          className={
            topResultUiState.objectiveActive
              ? "objective-item objective-active"
              : undefined
          }
        >
          {topResultUiState.objectiveDisplayText}
        </div>
        <div
          id="subjectTo"
          className={
            topResultUiState.subjectToVisible ? "is-block" : "is-hidden"
          }
        >
          subject to
        </div>
        <div id="inequalities">
          {inequalitiesUiState.message !== null
            ? inequalitiesUiState.message
            : inequalitiesUiState.items.map((inequality, index) => (
                <div
                  key={`${index}-${inequality}`}
                  className="inequality-item"
                  onMouseEnter={() => {
                    runtimeActions.setConstraintHighlight(index);
                  }}
                  onMouseLeave={() => {
                    runtimeActions.setConstraintHighlight(null);
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
