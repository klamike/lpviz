export function ActionControls() {
  return (
    <>
      <div class="controlPanel" style="margin-top: 5px; margin-bottom: 20px">
        <div class="button-group">
          <button id="traceButton" disabled>
            Solve
          </button>
          <button id="animateButton" disabled>
            Animate
          </button>
        </div>
        <div class="button-group">
          <button id="startRotateObjectiveButton" disabled>
            Rotate Objective
          </button>
          <button id="stopRotateObjectiveButton" disabled>
            Stop Rotation
          </button>
        </div>
        <div id="objectiveRotationSettings" style="display: none; margin-top: 1em">
          <div style="display: flex; gap: 1em">
            <div style="flex: 1">
              <label
                for="objectiveAngleStepSlider"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginBottom: "0.5em",
                }}
              >
                Angle Step: <span id="objectiveAngleStepValue">0.10</span> rad
              </label>
              <input
                type="range"
                id="objectiveAngleStepSlider"
                min="0.01"
                max="0.5"
                step="0.01"
                value="0.1"
                autocomplete="off"
                style="width: 100%"
              />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <label
                for="traceCheckbox"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginBottom: "0.5em",
                }}
              >
                Trace
              </label>
              <input type="checkbox" id="traceCheckbox" />
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
        value="10"
        step="1"
        autocomplete="off"
      />
    </>
  );
}

export default ActionControls;
