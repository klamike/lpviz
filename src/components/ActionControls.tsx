import { state } from "../state/state";
import { useAppActions } from "../controllers/useAppActions";

export function ActionControls() {
  const {
    solve,
    animate,
    startRotation,
    stopRotation,
    toggleTrace,
    updateObjectiveAngleStep,
    updateReplaySpeed,
  } = useAppActions();

  const handleAngleStepInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
    updateObjectiveAngleStep(parseFloat(event.currentTarget.value));
  };

  const handleTraceToggle = (event: Event & { currentTarget: HTMLInputElement }) => {
    toggleTrace(event.currentTarget.checked);
  };

  const handleReplaySpeed = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
    updateReplaySpeed(parseInt(event.currentTarget.value, 10));
  };

  return (
    <>
      <div class="controlPanel" style="margin-top: 5px; margin-bottom: 20px">
        <div class="button-group">
          <button
            id="traceButton"
            disabled={!state.uiButtons["traceButton"]}
            onClick={solve}
          >
            Solve
          </button>
          <button
            id="animateButton"
            disabled={!state.uiButtons["animateButton"]}
            onClick={animate}
          >
            Animate
          </button>
        </div>
        <div class="button-group">
          <button
            id="startRotateObjectiveButton"
            disabled={!state.uiButtons["startRotateObjectiveButton"]}
            onClick={startRotation}
          >
            Rotate Objective
          </button>
          <button
            id="stopRotateObjectiveButton"
            disabled={!state.uiButtons["stopRotateObjectiveButton"]}
            onClick={stopRotation}
          >
            Stop Rotation
          </button>
        </div>
        <div
          id="objectiveRotationSettings"
          style={{
            display: state.rotateObjectiveMode ? "block" : "none",
            "margin-top": "1em",
          }}
        >
          <div style="display: flex; gap: 1em">
            <div style="flex: 1">
              <label
                for="objectiveAngleStepSlider"
                style="display: block; text-align: center; margin-bottom: 0.5em"
              >
                Angle Step: {" "}
                <span id="objectiveAngleStepValue">
                  {state.solverSettings.objectiveAngleStep.toFixed(2)}
                </span>{" "}rad
              </label>
              <input
                type="range"
                id="objectiveAngleStepSlider"
                min="0.01"
                max="0.5"
                step="0.01"
                value={state.solverSettings.objectiveAngleStep}
                autocomplete="off"
                style="width: 100%"
                onInput={handleAngleStepInput}
              />
            </div>
            <div
              style="display: flex; flex-direction: column; align-items: center"
            >
              <label
                for="traceCheckbox"
                style="display: block; text-align: center; margin-bottom: 0.5em"
              >
                Trace
              </label>
              <input
                type="checkbox"
                id="traceCheckbox"
                checked={state.traceEnabled}
                onChange={handleTraceToggle}
              />
            </div>
          </div>
        </div>
      </div>
      <label style="display: none" for="replaySpeedSlider">
        Speed:
      </label>
      <input
        style="display: none"
        type="range"
        id="replaySpeedSlider"
        min="1"
        max="100"
        value={state.solverSettings.replaySpeedMs}
        step="1"
        autocomplete="off"
        onInput={handleReplaySpeed}
      />
    </>
  );
}

export default ActionControls;
