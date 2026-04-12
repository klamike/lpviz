export function SolverControlsPanel() {
  return (
    <div className="controlPanel">
      <div className="button-group">
        <button id="ipmButton" disabled>
          IPM
        </button>
        <button id="pdhgButton" disabled>
          PDHG
        </button>
        <button id="simplexButton" disabled>
          Simplex
        </button>
        <button id="iteratePathButton" disabled>
          Central Path
        </button>
      </div>

      <div id="ipmSettings" className="settings-section">
        <label htmlFor="alphaMaxSlider">
          αmax (maximum step size ratio):
          <span id="alphaMaxValue">0.1</span>
        </label>
        <input type="range" id="alphaMaxSlider" min="0.001" max="1" step="0.001" defaultValue="0.1" autoComplete="off" />
        <br />
        <label htmlFor="correctorThresholdSlider">
          Corrector threshold:
          <span id="correctorThresholdValue">0.900</span>
        </label>
        <input type="range" id="correctorThresholdSlider" min="0.001" max="0.999" step="0.001" defaultValue="0.900" autoComplete="off" />
        <br />
        <label htmlFor="maxitInput">Maximum iterations:</label>
        <input type="number" id="maxitInput" defaultValue="1000" min="1" step="1" autoComplete="off" />
        <div id="ipmColorByPhaseBox" className="settings-checkbox-row">
          <label htmlFor="ipmColorByPhase">
            Color by phase <input type="checkbox" id="ipmColorByPhase" autoComplete="off" />
          </label>
        </div>
      </div>

      <div id="pdhgSettings" className="settings-section">
        <label htmlFor="pdhgEtaSlider">
          η (primal step size factor):
          <span id="pdhgEtaValue">0.250</span>
        </label>
        <input type="range" id="pdhgEtaSlider" min="0.001" max="0.750" step="0.001" defaultValue="0.250" autoComplete="off" />
        <br />
        <label htmlFor="pdhgTauSlider">
          τ (dual step size factor):
          <span id="pdhgTauValue">0.250</span>
        </label>
        <input type="range" id="pdhgTauSlider" min="0.001" max="0.750" step="0.001" defaultValue="0.250" autoComplete="off" />
        <br />
        <label htmlFor="maxitInputPDHG">Maximum iterations:</label>
        <input type="number" id="maxitInputPDHG" defaultValue="1000" min="1" step="1" autoComplete="off" />
        <div className="settings-checkbox-row">
          <label htmlFor="pdhgIneqMode">
            Inequality mode <input type="checkbox" id="pdhgIneqMode" defaultChecked />
          </label>
          <label htmlFor="pdhgHalpernMode">
            Halpern <input type="checkbox" id="pdhgHalpernMode" autoComplete="off" />
          </label>
          <label htmlFor="pdhgColorByBasis">
            Color by basis <input type="checkbox" id="pdhgColorByBasis" autoComplete="off" />
          </label>
        </div>
      </div>

      <div id="simplexSettings" className="settings-section">
        <label htmlFor="simplexDualMode">Dual simplex mode</label>
        <input type="checkbox" id="simplexDualMode" autoComplete="off" />
      </div>

      <div id="centralPathSettings" className="settings-section is-block">
        <label htmlFor="centralPathIterSlider">
          {" "}
          N (number of steps): <span id="centralPathIterValue">75</span>{" "}
        </label>
        <input type="range" id="centralPathIterSlider" min="2" max="100" step="1" defaultValue="75" autoComplete="off" />
      </div>
    </div>
  );
}
