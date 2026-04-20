import { useLpvizSelector } from "@/hooks/useLpvizSelector";
import {
  areSolverControlsUiStatesEqual,
  areSolverSettingsEqual,
  selectSolverControlsUiState,
  selectSolverSettings,
} from "@/state";

import { useLpvizActions } from "@/controller/LpvizActionsContext";
import { useTourActionTarget } from "@/providers/TourProvider";

export function SolverControlsPanel() {
  const runtimeActions = useLpvizActions();
  const activateIpmTargetRef = useTourActionTarget("activate-ipm");
  const activateCentralTargetRef = useTourActionTarget("activate-central");
  const solverControlsUiState = useLpvizSelector(
    selectSolverControlsUiState,
    areSolverControlsUiStatesEqual,
  );
  const settings = useLpvizSelector(
    selectSolverSettings,
    areSolverSettingsEqual,
  );

  return (
    <div className="controlPanel">
      <div className="button-group">
        <button
          id="ipmButton"
          ref={activateIpmTargetRef}
          className={
            solverControlsUiState.buttons.ipm.active
              ? "button-active"
              : undefined
          }
          disabled={solverControlsUiState.buttons.ipm.disabled}
          onClick={() => runtimeActions.setActiveSolverMode("ipm")}
        >
          IPM
        </button>
        <button
          className={
            solverControlsUiState.buttons.pdhg.active
              ? "button-active"
              : undefined
          }
          disabled={solverControlsUiState.buttons.pdhg.disabled}
          onClick={() => runtimeActions.setActiveSolverMode("pdhg")}
        >
          PDHG
        </button>
        <button
          className={
            solverControlsUiState.buttons.simplex.active
              ? "button-active"
              : undefined
          }
          disabled={solverControlsUiState.buttons.simplex.disabled}
          onClick={() => runtimeActions.setActiveSolverMode("simplex")}
        >
          Simplex
        </button>
        <button
          id="iteratePathButton"
          ref={activateCentralTargetRef}
          className={
            solverControlsUiState.buttons.central.active
              ? "button-active"
              : undefined
          }
          disabled={solverControlsUiState.buttons.central.disabled}
          onClick={() => runtimeActions.setActiveSolverMode("central")}
        >
          Central Path
        </button>
      </div>

      {solverControlsUiState.activeMode === "ipm" && (
        <div className="settings-section is-block">
          <label htmlFor="alphaMaxSlider">
            {"\u03B1"}max (maximum step size ratio):
            <span>{settings.alphaMax.toFixed(3)}</span>
          </label>
          <input
            type="range"
            id="alphaMaxSlider"
            min="0.001"
            max="1"
            step="0.001"
            value={settings.alphaMax}
            onChange={(e) => {
              runtimeActions.updateSolverSetting(
                "alphaMax",
                parseFloat(e.target.value),
              );
              runtimeActions.recomputeIfModeActive("ipm");
            }}
            autoComplete="off"
          />
          <br />
          <label htmlFor="correctorThresholdSlider">
            Corrector threshold:
            <span>{settings.correctorThreshold.toFixed(3)}</span>
          </label>
          <input
            type="range"
            id="correctorThresholdSlider"
            min="0.001"
            max="0.999"
            step="0.001"
            value={settings.correctorThreshold}
            onChange={(e) => {
              runtimeActions.updateSolverSetting(
                "correctorThreshold",
                parseFloat(e.target.value),
              );
              runtimeActions.recomputeIfModeActive("ipm");
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
              runtimeActions.updateSolverSetting(
                "maxitIPM",
                Math.max(1, parseInt(e.target.value, 10) || 1),
              );
              runtimeActions.recomputeIfModeActive("ipm");
            }}
            min="1"
            step="1"
            autoComplete="off"
          />
        </div>
      )}

      {solverControlsUiState.activeMode === "pdhg" && (
        <div className="settings-section is-block">
          <label htmlFor="pdhgEtaSlider">
            {"\u03B7"} (primal step size factor):
            <span>{settings.pdhgEta.toFixed(3)}</span>
          </label>
          <input
            type="range"
            id="pdhgEtaSlider"
            min="0.001"
            max="0.750"
            step="0.001"
            value={settings.pdhgEta}
            onChange={(e) => {
              runtimeActions.updateSolverSetting(
                "pdhgEta",
                parseFloat(e.target.value),
              );
              runtimeActions.recomputeIfModeActive("pdhg");
            }}
            autoComplete="off"
          />
          <br />
          <label htmlFor="pdhgTauSlider">
            {"\u03C4"} (dual step size factor):
            <span>{settings.pdhgTau.toFixed(3)}</span>
          </label>
          <input
            type="range"
            id="pdhgTauSlider"
            min="0.001"
            max="0.750"
            step="0.001"
            value={settings.pdhgTau}
            onChange={(e) => {
              runtimeActions.updateSolverSetting(
                "pdhgTau",
                parseFloat(e.target.value),
              );
              runtimeActions.recomputeIfModeActive("pdhg");
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
              runtimeActions.updateSolverSetting(
                "maxitPDHG",
                Math.max(1, parseInt(e.target.value, 10) || 1),
              );
              runtimeActions.recomputeIfModeActive("pdhg");
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
                  runtimeActions.updateSolverSetting(
                    "pdhgIneqMode",
                    e.target.checked,
                  );
                  runtimeActions.recomputeIfModeActive("pdhg");
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
                  runtimeActions.updateSolverSetting(
                    "pdhgHalpernMode",
                    e.target.checked,
                  );
                  runtimeActions.recomputeIfModeActive("pdhg");
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
                  runtimeActions.updateSolverSetting(
                    "pdhgColorByBasis",
                    e.target.checked,
                  );
                  runtimeActions.recomputeIfModeActive("pdhg");
                }}
                autoComplete="off"
              />
            </label>
          </div>
        </div>
      )}

      {solverControlsUiState.activeMode === "central" && (
        <div className="settings-section is-block">
          <label htmlFor="centralPathIterSlider">
            {" "}
            N (number of steps): <span>{settings.centralPathIter}</span>{" "}
          </label>
          <input
            type="range"
            id="centralPathIterSlider"
            min="2"
            max="100"
            step="1"
            value={settings.centralPathIter}
            onChange={(e) => {
              runtimeActions.updateSolverSetting(
                "centralPathIter",
                parseInt(e.target.value, 10),
              );
              runtimeActions.recomputeIfModeActive("central");
            }}
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );
}
