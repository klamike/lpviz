import { lpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import {
  areSolverControlsUiStatesEqual,
  areSolverSettingsEqual,
  selectSolverControlsUiState,
  selectSolverSettings,
} from "../../app/uiSelectors";

export function SolverControlsPanel() {
  const solverControlsUiState = useLpvizSelector(selectSolverControlsUiState, areSolverControlsUiStatesEqual);
  const settings = useLpvizSelector(selectSolverSettings, areSolverSettingsEqual);

  return (
    <div className="controlPanel">
      <div className="button-group">
        <button
          id="ipmButton"
          className={solverControlsUiState.buttons.ipm.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.ipm.disabled}
          onClick={() => lpvizRuntimeCommands.setActiveSolverMode("ipm")}
        >
          IPM
        </button>
        <button
          id="pdhgButton"
          className={solverControlsUiState.buttons.pdhg.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.pdhg.disabled}
          onClick={() => lpvizRuntimeCommands.setActiveSolverMode("pdhg")}
        >
          PDHG
        </button>
        <button
          id="simplexButton"
          className={solverControlsUiState.buttons.simplex.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.simplex.disabled}
          onClick={() => lpvizRuntimeCommands.setActiveSolverMode("simplex")}
        >
          Simplex
        </button>
        <button
          id="iteratePathButton"
          className={solverControlsUiState.buttons.central.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.central.disabled}
          onClick={() => lpvizRuntimeCommands.setActiveSolverMode("central")}
        >
          Central Path
        </button>
      </div>

      <div
        id="ipmSettings"
        className={solverControlsUiState.activeMode === "ipm" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="alphaMaxSlider">
          {"\u03B1"}max (maximum step size ratio):
          <span id="alphaMaxValue">{settings.alphaMax.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="alphaMaxSlider"
          min="0.001"
          max="1"
          step="0.001"
          value={settings.alphaMax}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("alphaMax", parseFloat(e.target.value));
            lpvizRuntimeCommands.recomputeIfModeActive("ipm");
          }}
          autoComplete="off"
        />
        <br />
        <label htmlFor="correctorThresholdSlider">
          Corrector threshold:
          <span id="correctorThresholdValue">{settings.correctorThreshold.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="correctorThresholdSlider"
          min="0.001"
          max="0.999"
          step="0.001"
          value={settings.correctorThreshold}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("correctorThreshold", parseFloat(e.target.value));
            lpvizRuntimeCommands.recomputeIfModeActive("ipm");
          }}
          autoComplete="off"
        />
        <br />
        <label htmlFor="maxitInput">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInput"
          value={settings.maxitIPM}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("maxitIPM", Math.max(1, parseInt(e.target.value, 10) || 1));
            lpvizRuntimeCommands.recomputeIfModeActive("ipm");
          }}
          min="1"
          step="1"
          autoComplete="off"
        />
        <div id="ipmColorByPhaseBox" className="settings-checkbox-row">
          <label htmlFor="ipmColorByPhase">
            Color by phase{" "}
            <input
              type="checkbox"
              id="ipmColorByPhase"
              checked={settings.ipmColorByPhase}
              onChange={(e) => {
                lpvizRuntimeCommands.updateSolverSetting("ipmColorByPhase", e.target.checked);
                lpvizRuntimeCommands.recomputeIfModeActive("ipm");
              }}
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      <div
        id="pdhgSettings"
        className={solverControlsUiState.activeMode === "pdhg" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="pdhgEtaSlider">
          {"\u03B7"} (primal step size factor):
          <span id="pdhgEtaValue">{settings.pdhgEta.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="pdhgEtaSlider"
          min="0.001"
          max="0.750"
          step="0.001"
          value={settings.pdhgEta}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("pdhgEta", parseFloat(e.target.value));
            lpvizRuntimeCommands.recomputeIfModeActive("pdhg");
          }}
          autoComplete="off"
        />
        <br />
        <label htmlFor="pdhgTauSlider">
          {"\u03C4"} (dual step size factor):
          <span id="pdhgTauValue">{settings.pdhgTau.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="pdhgTauSlider"
          min="0.001"
          max="0.750"
          step="0.001"
          value={settings.pdhgTau}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("pdhgTau", parseFloat(e.target.value));
            lpvizRuntimeCommands.recomputeIfModeActive("pdhg");
          }}
          autoComplete="off"
        />
        <br />
        <label htmlFor="maxitInputPDHG">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInputPDHG"
          value={settings.maxitPDHG}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("maxitPDHG", Math.max(1, parseInt(e.target.value, 10) || 1));
            lpvizRuntimeCommands.recomputeIfModeActive("pdhg");
          }}
          min="1"
          step="1"
          autoComplete="off"
        />
        <div className="settings-checkbox-row">
          <label htmlFor="pdhgIneqMode">
            Inequality mode{" "}
            <input
              type="checkbox"
              id="pdhgIneqMode"
              checked={settings.pdhgIneqMode}
              onChange={(e) => {
                lpvizRuntimeCommands.updateSolverSetting("pdhgIneqMode", e.target.checked);
                lpvizRuntimeCommands.recomputeIfModeActive("pdhg");
              }}
            />
          </label>
          <label htmlFor="pdhgHalpernMode">
            Halpern{" "}
            <input
              type="checkbox"
              id="pdhgHalpernMode"
              checked={settings.pdhgHalpernMode}
              onChange={(e) => {
                lpvizRuntimeCommands.updateSolverSetting("pdhgHalpernMode", e.target.checked);
                lpvizRuntimeCommands.recomputeIfModeActive("pdhg");
              }}
              autoComplete="off"
            />
          </label>
          <label htmlFor="pdhgColorByBasis">
            Color by basis{" "}
            <input
              type="checkbox"
              id="pdhgColorByBasis"
              checked={settings.pdhgColorByBasis}
              onChange={(e) => {
                lpvizRuntimeCommands.updateSolverSetting("pdhgColorByBasis", e.target.checked);
                lpvizRuntimeCommands.recomputeIfModeActive("pdhg");
              }}
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      <div
        id="simplexSettings"
        className={solverControlsUiState.activeMode === "simplex" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="simplexDualMode">Dual simplex mode</label>
        <input
          type="checkbox"
          id="simplexDualMode"
          checked={settings.simplexDualMode}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("simplexDualMode", e.target.checked);
            lpvizRuntimeCommands.recomputeIfModeActive("simplex");
          }}
          autoComplete="off"
        />
      </div>

      <div
        id="centralPathSettings"
        className={solverControlsUiState.activeMode === "central" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="centralPathIterSlider">
          {" "}
          N (number of steps): <span id="centralPathIterValue">{settings.centralPathIter}</span>{" "}
        </label>
        <input
          type="range"
          id="centralPathIterSlider"
          min="2"
          max="100"
          step="1"
          value={settings.centralPathIter}
          onChange={(e) => {
            lpvizRuntimeCommands.updateSolverSetting("centralPathIter", parseInt(e.target.value, 10));
            lpvizRuntimeCommands.recomputeIfModeActive("central");
          }}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
