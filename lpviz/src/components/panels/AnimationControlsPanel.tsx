export function AnimationControlsPanel() {
  return (
    <div className="controlPanel controlPanel--compact">
      <div className="button-group">
        <button id="animateButton" disabled>
          Animate
        </button>
      </div>
      <div className="button-group">
        <button id="startRotateObjectiveButton" disabled>
          Rotate Objective
        </button>
        <button id="stopRotateObjectiveButton" disabled>
          Stop Rotation
        </button>
      </div>
      <div id="objectiveRotationSettings" className="objective-rotation is-hidden">
        <div className="rotation-layout">
          <div className="rotation-column">
            <label htmlFor="objectiveAngleStepSlider" className="label-centered">
              Angle Step
            </label>
            <input type="range" id="objectiveAngleStepSlider" min="0.01" max="0.5" step="0.01" defaultValue="0.1" autoComplete="off" />
          </div>
          <div className="rotation-column">
            <label htmlFor="objectiveRotationSpeedSlider" className="label-centered">
              Rotation Speed
            </label>
            <input type="range" id="objectiveRotationSpeedSlider" min="0.2" max="3" step="0.1" defaultValue="1" autoComplete="off" />
          </div>
          <div className="rotation-checkbox">
            <label htmlFor="traceCheckbox" className="label-centered">
              Trace
            </label>
            <input type="checkbox" id="traceCheckbox" />
          </div>
        </div>
      </div>
    </div>
  );
}
