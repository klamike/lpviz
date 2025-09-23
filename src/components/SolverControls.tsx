import { For } from "solid-js";
import { state } from "../state/state";

interface SolverButtonConfig {
  id: string;
  label: string;
  mode: string;
}

const BUTTONS: SolverButtonConfig[] = [
  { id: "ipmButton", label: "IPM", mode: "ipm" },
  { id: "pdhgButton", label: "PDHG", mode: "pdhg" },
  { id: "simplexButton", label: "Simplex", mode: "simplex" },
  { id: "iteratePathButton", label: "Central Path", mode: "central" },
];

export function SolverControls() {
  return (
    <div class="controlPanel">
      <div class="button-group">
        <For each={BUTTONS}>
          {(btn) => (
            <button
              id={btn.id}
              disabled={!state.uiButtons[btn.id] || state.solverMode === btn.mode}
              classList={{ active: state.solverMode === btn.mode }}
            >
              {btn.label}
            </button>
          )}
        </For>
      </div>

      <div id="ipmSettings" class="settings-section" style="display: none">
        <label for="alphaMaxSlider">
          αmax (maximum step size ratio):
          <span id="alphaMaxValue">0.1</span>
        </label>
        <input
          type="range"
          id="alphaMaxSlider"
          min="0.001"
          max="1"
          step="0.001"
          value="0.1"
          autocomplete="off"
        />
        <br />
        <label for="maxitInput">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInput"
          value="1000"
          min="1"
          step="1"
          autocomplete="off"
        />
      </div>

      <div id="pdhgSettings" class="settings-section" style="display: none">
        <label for="pdhgEtaSlider">
          η (primal step size factor):
          <span id="pdhgEtaValue">0.250</span>
        </label>
        <input
          type="range"
          id="pdhgEtaSlider"
          min="0.001"
          max="0.750"
          step="0.001"
          value="0.250"
          autocomplete="off"
        />
        <br />
        <label for="pdhgTauSlider">
          τ (dual step size factor):
          <span id="pdhgTauValue">0.250</span>
        </label>
        <input
          type="range"
          id="pdhgTauSlider"
          min="0.001"
          max="0.750"
          step="0.001"
          value="0.250"
          autocomplete="off"
        />
        <br />
        <label for="maxitInputPDHG">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInputPDHG"
          value="1000"
          min="1"
          step="1"
          autocomplete="off"
        />
        <label for="pdhgIneqMode">Inequality mode</label>
        <input type="checkbox" id="pdhgIneqMode" checked />
      </div>

      <div id="centralPathSettings" class="settings-section" style="display: block">
        <label for="centralPathIterSlider">
          N (number of steps): <span id="centralPathIterValue">75</span>
        </label>
        <input
          type="range"
          id="centralPathIterSlider"
          min="2"
          max="100"
          step="1"
          value="75"
          autocomplete="off"
        />
      </div>
    </div>
  );
}

export default SolverControls;
