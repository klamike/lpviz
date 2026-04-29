import { useLpvizStore } from "@/features/core/store";
import {
  areSolverControlsUiStatesEqual,
  areSolverSettingsEqual,
  selectSolverControlsUiState,
  selectSolverSettings,
} from "@/features/core/selectors";

import { useAppActions } from "@/features/core/actions";
import type { SolverMode, SolverSettings } from "@/features/core/store";

const MAXIT_LOG_MIN = 0;
const MAXIT_LOG_MAX = 5;
const MAXIT_LOG_STEP = 0.01;
const MAXIT_LOG_MARKS = [
  { value: 1, label: "1" },
  { value: 10, label: "10" },
  { value: 100, label: "100" },
  { value: 1000, label: "1k" },
  { value: 10000, label: "10k" },
  { value: 100000, label: "100k" },
];

const maxitToSliderValue = (value: number) =>
  Math.min(
    MAXIT_LOG_MAX,
    Math.max(MAXIT_LOG_MIN, Math.log10(Math.max(1, value))),
  );

const sliderValueToMaxit = (value: string) =>
  Math.max(1, Math.round(10 ** parseFloat(value)));

const formatIterationCount = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

type MaxitSettingKey = Extract<keyof SolverSettings, "maxitIPM" | "maxitPDHG">;

export function SolverControlsPanel() {
  const runtimeActions = useAppActions();
  const solverControlsUiState = useLpvizStore(
    selectSolverControlsUiState,
    areSolverControlsUiStatesEqual,
  );
  const settings = useLpvizStore(
    selectSolverSettings,
    areSolverSettingsEqual,
  );

  const renderMaxitSlider = (
    id: string,
    value: number,
    settingKey: MaxitSettingKey,
    mode: SolverMode,
  ) => (
    <div className="log-slider-control">
      <label htmlFor={id}>
        Maximum iterations:
        <span>{formatIterationCount(value)}</span>
      </label>
      <input
        type="range"
        id={id}
        className="log-slider"
        min={MAXIT_LOG_MIN}
        max={MAXIT_LOG_MAX}
        step={MAXIT_LOG_STEP}
        value={maxitToSliderValue(value)}
        onChange={(e) => {
          runtimeActions.updateSolverSetting(
            settingKey,
            sliderValueToMaxit(e.target.value),
          );
          runtimeActions.recomputeIfModeActive(mode);
        }}
        autoComplete="off"
      />
      <div className="log-slider-scale" aria-hidden="true">
        {MAXIT_LOG_MARKS.map((mark) => (
          <span key={mark.value}>{mark.label}</span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="controlPanel">
      <div className="button-group">
        <button
          id="ipmButton"
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
          {renderMaxitSlider("maxitSliderIPM", settings.maxitIPM, "maxitIPM", "ipm")}
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
          {renderMaxitSlider("maxitSliderPDHG", settings.maxitPDHG, "maxitPDHG", "pdhg")}
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
