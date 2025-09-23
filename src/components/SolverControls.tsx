import { For } from "solid-js";
import { useAppActions } from "../controllers/useAppActions";
import type { SolverMode } from "../state/state";
import { state } from "../state/state";

interface SolverButtonConfig {
  id: string;
  label: string;
  mode: SolverMode;
}

const BUTTONS: SolverButtonConfig[] = [
  { id: "ipmButton", label: "IPM", mode: "ipm" },
  { id: "pdhgButton", label: "PDHG", mode: "pdhg" },
  { id: "simplexButton", label: "Simplex", mode: "simplex" },
  { id: "iteratePathButton", label: "Central Path", mode: "central" },
];

export function SolverControls() {
  const {
    updateSolverMode,
    updateCentralPathSteps,
    updateIPMAlphaMax,
    updateIPMMaxIterations,
    updatePDHGSettings,
  } = useAppActions();

  const handleSolverMode = (mode: SolverMode) => () => updateSolverMode(mode);

  return (
    <div class="controlPanel">
      <div class="button-group">
        <For each={BUTTONS}>
          {(btn) => (
            <button
              id={btn.id}
              disabled={
                !state.uiButtons[btn.id] || state.solverMode === btn.mode
              }
              classList={{ active: state.solverMode === btn.mode }}
              onClick={handleSolverMode(btn.mode)}
            >
              {btn.label}
            </button>
          )}
        </For>
      </div>

      <div
        id="ipmSettings"
        class="settings-section"
        style={{ display: state.solverSettingsVisible.ipm ? "block" : "none" }}
      >
        <label for="alphaMaxSlider">
          αmax (maximum step size ratio):
          <span id="alphaMaxValue">
            {state.solverSettings.ipmAlphaMax.toFixed(3)}
          </span>
        </label>
        <input
          type="range"
          id="alphaMaxSlider"
          min="0.001"
          max="1"
          step="0.001"
          value={state.solverSettings.ipmAlphaMax}
          autocomplete="off"
          onInput={(event) =>
            updateIPMAlphaMax(parseFloat(event.currentTarget.value))
          }
        />
        <br />
        <label for="maxitInput">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInput"
          value={state.solverSettings.ipmMaxIterations}
          min="1"
          step="1"
          autocomplete="off"
          onInput={(event) =>
            updateIPMMaxIterations(parseInt(event.currentTarget.value, 10))
          }
        />
      </div>

      <div
        id="pdhgSettings"
        class="settings-section"
        style={{ display: state.solverSettingsVisible.pdhg ? "block" : "none" }}
      >
        <label for="pdhgEtaSlider">
          η (primal step size factor):
          <span id="pdhgEtaValue">
            {state.solverSettings.pdhgEta.toFixed(3)}
          </span>
        </label>
        <input
          type="range"
          id="pdhgEtaSlider"
          min="0.001"
          max="0.750"
          step="0.001"
          value={state.solverSettings.pdhgEta}
          autocomplete="off"
          onInput={(event) =>
            updatePDHGSettings({
              pdhgEta: parseFloat(event.currentTarget.value),
            })
          }
        />
        <br />
        <label for="pdhgTauSlider">
          τ (dual step size factor):
          <span id="pdhgTauValue">
            {state.solverSettings.pdhgTau.toFixed(3)}
          </span>
        </label>
        <input
          type="range"
          id="pdhgTauSlider"
          min="0.001"
          max="0.750"
          step="0.001"
          value={state.solverSettings.pdhgTau}
          autocomplete="off"
          onInput={(event) =>
            updatePDHGSettings({
              pdhgTau: parseFloat(event.currentTarget.value),
            })
          }
        />
        <br />
        <label for="maxitInputPDHG">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInputPDHG"
          value={state.solverSettings.pdhgMaxIterations}
          min="1"
          step="1"
          autocomplete="off"
          onInput={(event) =>
            updatePDHGSettings({
              pdhgMaxIterations: parseInt(event.currentTarget.value, 10),
            })
          }
        />
        <label for="pdhgIneqMode">Inequality mode</label>
        <input
          type="checkbox"
          id="pdhgIneqMode"
          checked={state.solverSettings.pdhgIneqMode}
          onChange={(event) =>
            updatePDHGSettings({ pdhgIneqMode: event.currentTarget.checked })
          }
        />
      </div>

      <div
        id="centralPathSettings"
        class="settings-section"
        style={{
          display: state.solverSettingsVisible.central ? "block" : "none",
        }}
      >
        <label for="centralPathIterSlider">
          N (number of steps):{" "}
          <span id="centralPathIterValue">
            {state.solverSettings.centralPathSteps}
          </span>
        </label>
        <input
          type="range"
          id="centralPathIterSlider"
          min="2"
          max="100"
          step="1"
          value={state.solverSettings.centralPathSteps}
          autocomplete="off"
          onInput={(event) =>
            updateCentralPathSteps(parseInt(event.currentTarget.value, 10))
          }
        />
      </div>
    </div>
  );
}

export default SolverControls;
