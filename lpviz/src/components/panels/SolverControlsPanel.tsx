import { useLegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { useLpvizSelector } from "../../app/lpvizStore";
import { areSolverControlsUiStatesEqual, selectSolverControlsUiState } from "../../app/uiSelectors";

export function SolverControlsPanel() {
  const refs = useLegacyRuntimeElementRefs();
  const solverControlsUiState = useLpvizSelector(selectSolverControlsUiState, areSolverControlsUiStatesEqual);

  return (
    <div className="controlPanel">
      <div className="button-group">
        <button
          id="ipmButton"
          ref={refs.ipmButton}
          className={solverControlsUiState.buttons.ipm.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.ipm.disabled}
        >
          IPM
        </button>
        <button
          id="pdhgButton"
          ref={refs.pdhgButton}
          className={solverControlsUiState.buttons.pdhg.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.pdhg.disabled}
        >
          PDHG
        </button>
        <button
          id="simplexButton"
          ref={refs.simplexButton}
          className={solverControlsUiState.buttons.simplex.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.simplex.disabled}
        >
          Simplex
        </button>
        <button
          id="iteratePathButton"
          ref={refs.iteratePathButton}
          className={solverControlsUiState.buttons.central.active ? "button-active" : undefined}
          disabled={solverControlsUiState.buttons.central.disabled}
        >
          Central Path
        </button>
      </div>

      <div
        id="ipmSettings"
        className={solverControlsUiState.activeMode === "ipm" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="alphaMaxSlider">
          αmax (maximum step size ratio):
          <span id="alphaMaxValue" ref={refs.alphaMaxValue}>0.1</span>
        </label>
        <input type="range" id="alphaMaxSlider" ref={refs.alphaMaxSlider} min="0.001" max="1" step="0.001" defaultValue="0.1" autoComplete="off" />
        <br />
        <label htmlFor="correctorThresholdSlider">
          Corrector threshold:
          <span id="correctorThresholdValue" ref={refs.correctorThresholdValue}>0.900</span>
        </label>
        <input
          type="range"
          id="correctorThresholdSlider"
          ref={refs.correctorThresholdSlider}
          min="0.001"
          max="0.999"
          step="0.001"
          defaultValue="0.900"
          autoComplete="off"
        />
        <br />
        <label htmlFor="maxitInput">Maximum iterations:</label>
        <input type="number" id="maxitInput" ref={refs.maxitInput} defaultValue="1000" min="1" step="1" autoComplete="off" />
        <div id="ipmColorByPhaseBox" className="settings-checkbox-row">
          <label htmlFor="ipmColorByPhase">
            Color by phase <input type="checkbox" id="ipmColorByPhase" ref={refs.ipmColorByPhase} autoComplete="off" />
          </label>
        </div>
      </div>

      <div
        id="pdhgSettings"
        className={solverControlsUiState.activeMode === "pdhg" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="pdhgEtaSlider">
          η (primal step size factor):
          <span id="pdhgEtaValue" ref={refs.pdhgEtaValue}>0.250</span>
        </label>
        <input type="range" id="pdhgEtaSlider" ref={refs.pdhgEtaSlider} min="0.001" max="0.750" step="0.001" defaultValue="0.250" autoComplete="off" />
        <br />
        <label htmlFor="pdhgTauSlider">
          τ (dual step size factor):
          <span id="pdhgTauValue" ref={refs.pdhgTauValue}>0.250</span>
        </label>
        <input type="range" id="pdhgTauSlider" ref={refs.pdhgTauSlider} min="0.001" max="0.750" step="0.001" defaultValue="0.250" autoComplete="off" />
        <br />
        <label htmlFor="maxitInputPDHG">Maximum iterations:</label>
        <input type="number" id="maxitInputPDHG" ref={refs.maxitInputPDHG} defaultValue="1000" min="1" step="1" autoComplete="off" />
        <div className="settings-checkbox-row">
          <label htmlFor="pdhgIneqMode">
            Inequality mode <input type="checkbox" id="pdhgIneqMode" ref={refs.pdhgIneqMode} defaultChecked />
          </label>
          <label htmlFor="pdhgHalpernMode">
            Halpern <input type="checkbox" id="pdhgHalpernMode" ref={refs.pdhgHalpernMode} autoComplete="off" />
          </label>
          <label htmlFor="pdhgColorByBasis">
            Color by basis <input type="checkbox" id="pdhgColorByBasis" ref={refs.pdhgColorByBasis} autoComplete="off" />
          </label>
        </div>
      </div>

      <div
        id="simplexSettings"
        className={solverControlsUiState.activeMode === "simplex" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="simplexDualMode">Dual simplex mode</label>
        <input type="checkbox" id="simplexDualMode" ref={refs.simplexDualMode} autoComplete="off" />
      </div>

      <div
        id="centralPathSettings"
        className={solverControlsUiState.activeMode === "central" ? "settings-section is-block" : "settings-section is-hidden"}
      >
        <label htmlFor="centralPathIterSlider">
          {" "}
          N (number of steps): <span id="centralPathIterValue" ref={refs.centralPathIterValue}>75</span>{" "}
        </label>
        <input
          type="range"
          id="centralPathIterSlider"
          ref={refs.centralPathIterSlider}
          min="2"
          max="100"
          step="1"
          defaultValue="75"
          autoComplete="off"
        />
      </div>
    </div>
  );
}
