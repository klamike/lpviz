import { useLpvizRuntime } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import {
  areAnimationControlsUiStatesEqual,
  areSolverSettingsEqual,
  selectAnimationControlsUiState,
  selectSolverSettings,
} from "../../app/uiSelectors";

export function AnimationControlsPanel() {
  const runtimeActions = useLpvizRuntime();
  const animationControlsUiState = useLpvizSelector(selectAnimationControlsUiState, areAnimationControlsUiStatesEqual);
  const settings = useLpvizSelector(selectSolverSettings, areSolverSettingsEqual);

  return (
    <div className="controlPanel controlPanel--compact">
      <div className="button-group">
        <button
          disabled={animationControlsUiState.animateDisabled}
          onClick={() => runtimeActions.startReplay()}
        >
          Animate
        </button>
      </div>
      <div className="button-group">
        <button
          id="startRotateObjectiveButton"
          disabled={animationControlsUiState.startRotateDisabled}
          onClick={() => runtimeActions.startRotation()}
        >
          Rotate Objective
        </button>
        <button
          disabled={animationControlsUiState.stopRotateDisabled}
          onClick={() => runtimeActions.stopRotation()}
        >
          Stop Rotation
        </button>
      </div>
      <div
        className={animationControlsUiState.rotateObjectiveMode ? "objective-rotation is-block" : "objective-rotation is-hidden"}
      >
        <div className="rotation-layout">
          <div className="rotation-column">
            <label htmlFor="objectiveAngleStepSlider" className="label-centered">
              Angle Step
            </label>
            <input
              type="range"
              id="objectiveAngleStepSlider"
              min="0.01"
              max="0.5"
              step="0.01"
              value={settings.objectiveAngleStep}
              onChange={(e) => {
                runtimeActions.updateSolverSetting("objectiveAngleStep", parseFloat(e.target.value));
              }}
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
              min="0.2"
              max="3"
              step="0.1"
              value={settings.objectiveRotationSpeed}
              onChange={(e) => {
                runtimeActions.updateSolverSetting("objectiveRotationSpeed", parseFloat(e.target.value));
              }}
              autoComplete="off"
            />
          </div>
          <div className="rotation-checkbox">
            <label htmlFor="traceCheckbox" className="label-centered">
              Trace
            </label>
            <input
              type="checkbox"
              id="traceCheckbox"
              checked={animationControlsUiState.traceEnabled}
              onChange={(e) => {
                runtimeActions.setTraceEnabled(e.target.checked);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
