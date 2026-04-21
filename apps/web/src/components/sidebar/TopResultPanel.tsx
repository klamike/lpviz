import type { RefObject } from "react";

import { useLpvizStore } from "@/features/core/store";
import {
  areInequalitiesUiStatesEqual,
  areTopResultUiStatesEqual,
  selectInequalitiesUiState,
  selectTopResultUiState,
} from "@/features/core/selectors";

import { NullStateLogo } from "@/components/sidebar/NullStateLogo";
import { TerminalFrame } from "@/components/sidebar/TerminalFrame";
import { useAppActions } from "@/features/core/actions";

export function TopResultPanel({
  topResultRef,
}: {
  topResultRef: RefObject<HTMLDivElement | null>;
}) {
  const runtimeActions = useAppActions();
  const topResultUiState = useLpvizStore(
    selectTopResultUiState,
    areTopResultUiStatesEqual,
  );
  const inequalitiesUiState = useLpvizStore(
    selectInequalitiesUiState,
    areInequalitiesUiStatesEqual,
  );

  return (
    <TerminalFrame
      containerId="terminal-container2"
      delayClassName="scanlines--delay-8"
    >
      <div id="topResult" ref={topResultRef}>
        {topResultUiState.nullStateVisible && (
          <div id="nullStateMessage" aria-label="lpviz logo">
            <NullStateLogo />
          </div>
        )}
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
