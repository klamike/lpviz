import type { RefObject } from "react";

import { useLpvizSelector } from "@/hooks/useLpvizSelector";
import {
  areInequalitiesUiStatesEqual,
  areTopResultUiStatesEqual,
  selectInequalitiesUiState,
  selectTopResultUiState,
} from "@/state";

import { NullStateLogo } from "@/components/sidebar/NullStateLogo";
import { TerminalFrame } from "@/components/sidebar/TerminalFrame";
import { useLpvizActions } from "@/context/LpvizActionsContext";

export function TopResultPanel({
  topResultRef,
}: {
  topResultRef: RefObject<HTMLDivElement | null>;
}) {
  const runtimeActions = useLpvizActions();
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
