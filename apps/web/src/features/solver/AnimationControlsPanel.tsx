import { useLpvizRuntime } from "../../context/LpvizRuntimeProvider";
import {
  areAnimationControlsUiStatesEqual,
  areSolverSettingsEqual,
  selectAnimationControlsUiState,
  selectSolverSettings,
} from "@lpviz/state";
import { useLpvizSelector } from "@lpviz/state/react";
import { useOnboardingActionTarget } from "../onboarding/OnboardingProvider";

export function AnimationControlsPanel() {
  const runtimeActions = useLpvizRuntime();
  const startRotationTargetRef = useOnboardingActionTarget("start-rotation");
  const toggleTraceTargetRef = useOnboardingActionTarget("toggle-trace");
  const animationControlsUiState = useLpvizSelector(
    selectAnimationControlsUiState,
    areAnimationControlsUiStatesEqual,
  );
  const settings = useLpvizSelector(
    selectSolverSettings,
    areSolverSettingsEqual,
  );

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
          ref={startRotationTargetRef}
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
        className={
          animationControlsUiState.rotateObjectiveMode
            ? "objective-rotation is-block"
            : "objective-rotation is-hidden"
        }
      >
        <div className="rotation-layout">
          <div className="rotation-column">
            <label
              htmlFor="objectiveAngleStepSlider"
              className="label-centered"
            >
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
                runtimeActions.updateSolverSetting(
                  "objectiveAngleStep",
                  parseFloat(e.target.value),
                );
              }}
              autoComplete="off"
            />
          </div>
          <div className="rotation-column">
            <label
              htmlFor="objectiveRotationSpeedSlider"
              className="label-centered"
            >
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
                runtimeActions.updateSolverSetting(
                  "objectiveRotationSpeed",
                  parseFloat(e.target.value),
                );
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
              ref={toggleTraceTargetRef}
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
