import { useLegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { useLpvizSelector } from "../../app/lpvizStore";
import { areAnimationControlsUiStatesEqual, selectAnimationControlsUiState } from "../../app/uiSelectors";

export function AnimationControlsPanel() {
  const refs = useLegacyRuntimeElementRefs();
  const animationControlsUiState = useLpvizSelector(selectAnimationControlsUiState, areAnimationControlsUiStatesEqual);

  return (
    <div className="controlPanel controlPanel--compact">
      <div className="button-group">
        <button id="animateButton" ref={refs.animateButton} disabled={animationControlsUiState.animateDisabled}>
          Animate
        </button>
      </div>
      <div className="button-group">
        <button
          id="startRotateObjectiveButton"
          ref={refs.startRotateObjectiveButton}
          disabled={animationControlsUiState.startRotateDisabled}
        >
          Rotate Objective
        </button>
        <button
          id="stopRotateObjectiveButton"
          ref={refs.stopRotateObjectiveButton}
          disabled={animationControlsUiState.stopRotateDisabled}
        >
          Stop Rotation
        </button>
      </div>
      <div id="objectiveRotationSettings" ref={refs.objectiveRotationSettings} className="objective-rotation is-hidden">
        <div className="rotation-layout">
          <div className="rotation-column">
            <label htmlFor="objectiveAngleStepSlider" className="label-centered">
              Angle Step
            </label>
            <input
              type="range"
              id="objectiveAngleStepSlider"
              ref={refs.objectiveAngleStepSlider}
              min="0.01"
              max="0.5"
              step="0.01"
              defaultValue="0.1"
              autoComplete="off"
            />
          </div>
          <div className="rotation-column">
            <label htmlFor="objectiveRotationSpeedSlider" className="label-centered">
              Rotation Speed
            </label>
            <input
              type="range"
              id="objectiveRotationSpeedSlider"
              ref={refs.objectiveRotationSpeedSlider}
              min="0.2"
              max="3"
              step="0.1"
              defaultValue="1"
              autoComplete="off"
            />
          </div>
          <div className="rotation-checkbox">
            <label htmlFor="traceCheckbox" className="label-centered">
              Trace
            </label>
            <input type="checkbox" id="traceCheckbox" ref={refs.traceCheckbox} />
          </div>
        </div>
      </div>
    </div>
  );
}
