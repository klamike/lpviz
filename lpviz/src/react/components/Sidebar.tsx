import { useMemo } from "react";
import { mutate, setState, type SolverMode } from "../../state/store";
import { useStoreSelector } from "../hooks/useStoreSelector";
import { MigrationBanner } from "./MigrationBanner";
import type { ResultRenderPayload } from "../../solvers/worker/solverService";
import { ResultPanel } from "./ResultPanel";

const ASCII_ART = String.raw`
  ___
 /\_ \                   __
 \//\ \   ______  __  __/\_\  _____
   \ \ \ /\  __ \/\ \/\ \/\ \/\__  \
    \_\ \\ \ \_\ \ \ \_/ \ \ \/_/  /_
    /\____\ \  __/\ \___/ \ \_\/\____\
    \/____/\ \ \/  \/__/   \/_/\/____/
            \ \_\
             \/_/
`;

function SolverButtons() {
  const solverMode = useStoreSelector((state) => state.solverMode);

  const handleSelect = (mode: SolverMode) => {
    setState({ solverMode: mode });
  };

  const buttonProps = useMemo(
    () => [
      { id: "ipmButton", label: "IPM", mode: "ipm" as const },
      { id: "pdhgButton", label: "PDHG", mode: "pdhg" as const },
      { id: "simplexButton", label: "Simplex", mode: "simplex" as const },
      {
        id: "iteratePathButton",
        label: "Central Path",
        mode: "central" as const,
      },
    ],
    []
  );

  return (
    <div className="button-group">
      {buttonProps.map((button) => (
        <button
          key={button.id}
          id={button.id}
          className={solverMode === button.mode ? "active" : undefined}
          onClick={() => handleSelect(button.mode)}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

function SolverSettings() {
  const alphaMax = useStoreSelector((state) => state.ipmAlphaMax);
  const maxIpmit = useStoreSelector((state) => state.ipmMaxIterations);
  const pdhgEta = useStoreSelector((state) => state.pdhgEta);
  const pdhgTau = useStoreSelector((state) => state.pdhgTau);
  const pdhgMaxit = useStoreSelector((state) => state.pdhgMaxIterations);
  const pdhgIneqMode = useStoreSelector((state) => state.pdhgIneqMode);
  const centralPathSteps = useStoreSelector((state) => state.centralPathSteps);

  return (
    <>
      <div id="ipmSettings" className="settings-section">
        <label htmlFor="alphaMaxSlider">
          αmax (maximum step size ratio):{" "}
          <span id="alphaMaxValue">{alphaMax.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="alphaMaxSlider"
          min="0.001"
          max="1"
          step="0.001"
          value={alphaMax}
          onChange={(event) =>
            mutate((draft) => {
              draft.ipmAlphaMax = Number(event.target.value);
            })
          }
        />
        <br />
        <label htmlFor="maxitInput">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInput"
          value={maxIpmit}
          min="1"
          step="1"
          onChange={(event) =>
            mutate((draft) => {
              draft.ipmMaxIterations = Number(event.target.value);
            })
          }
        />
      </div>

      <div id="pdhgSettings" className="settings-section">
        <label htmlFor="pdhgEtaSlider">
          η (primal step size factor):{" "}
          <span id="pdhgEtaValue">{pdhgEta.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="pdhgEtaSlider"
          min="0.001"
          max="0.75"
          step="0.001"
          value={pdhgEta}
          onChange={(event) =>
            mutate((draft) => {
              draft.pdhgEta = Number(event.target.value);
            })
          }
        />
        <br />
        <label htmlFor="pdhgTauSlider">
          τ (dual step size factor):{" "}
          <span id="pdhgTauValue">{pdhgTau.toFixed(3)}</span>
        </label>
        <input
          type="range"
          id="pdhgTauSlider"
          min="0.001"
          max="0.75"
          step="0.001"
          value={pdhgTau}
          onChange={(event) =>
            mutate((draft) => {
              draft.pdhgTau = Number(event.target.value);
            })
          }
        />
        <br />
        <label htmlFor="maxitInputPDHG">Maximum iterations:</label>
        <input
          type="number"
          id="maxitInputPDHG"
          value={pdhgMaxit}
          min="1"
          step="1"
          onChange={(event) =>
            mutate((draft) => {
              draft.pdhgMaxIterations = Number(event.target.value);
            })
          }
        />
        <label htmlFor="pdhgIneqMode">Inequality mode</label>
        <input
          type="checkbox"
          id="pdhgIneqMode"
          checked={pdhgIneqMode}
          onChange={(event) =>
            mutate((draft) => {
              draft.pdhgIneqMode = event.target.checked;
            })
          }
        />
      </div>

      <div id="centralPathSettings" className="settings-section">
        <label htmlFor="centralPathIterSlider">
          {" "}
          N (number of steps):{" "}
          <span id="centralPathIterValue">{centralPathSteps}</span>{" "}
        </label>
        <input
          type="range"
          id="centralPathIterSlider"
          min="2"
          max="100"
          step="1"
          value={centralPathSteps}
          onChange={(event) =>
            mutate((draft) => {
              draft.centralPathSteps = Number(event.target.value);
            })
          }
        />
      </div>
    </>
  );
}

type SecondaryControlsProps = {
  onSolve: () => void;
  loading: boolean;
  error: string | null;
};

function SecondaryControls({ onSolve, loading, error }: SecondaryControlsProps) {
  const objectiveAngleStep = useStoreSelector(
    (state) => state.objectiveAngleStep
  );
  const objectiveRotationSpeed = useStoreSelector(
    (state) => state.objectiveRotationSpeed
  );
  const traceEnabled = useStoreSelector((state) => state.traceEnabled);

  return (
    <div className="controlPanel" style={{ marginTop: 5, marginBottom: 20 }}>
      <div className="button-group">
        <button id="traceButton" onClick={onSolve} disabled={loading}>
          {loading ? "Solving…" : "Solve"}
        </button>
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
      <div id="objectiveRotationSettings" style={{ marginTop: "1em" }}>
        <div style={{ display: "flex", gap: "1em", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <label
              htmlFor="objectiveAngleStepSlider"
              style={{
                display: "block",
                textAlign: "center",
                marginBottom: "0.5em",
              }}
            >
              Angle Step:{" "}
              <span id="objectiveAngleStepValue">
                {objectiveAngleStep.toFixed(2)}
              </span>{" "}
              rad
            </label>
            <input
              type="range"
              id="objectiveAngleStepSlider"
              min="0.01"
              max="0.5"
              step="0.01"
              value={objectiveAngleStep}
              style={{ width: "100%" }}
              onChange={(event) =>
                mutate((draft) => {
                  draft.objectiveAngleStep = Number(event.target.value);
                })
              }
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              htmlFor="objectiveRotationSpeedSlider"
              style={{
                display: "block",
                textAlign: "center",
                marginBottom: "0.5em",
              }}
            >
              Rotation Speed:{" "}
              <span id="objectiveRotationSpeedValue">
                {objectiveRotationSpeed.toFixed(1)}
              </span>
              x
            </label>
            <input
              type="range"
              id="objectiveRotationSpeedSlider"
              min="0.2"
              max="3"
              step="0.1"
              value={objectiveRotationSpeed}
              style={{ width: "100%" }}
              onChange={(event) =>
                mutate((draft) => {
                  draft.objectiveRotationSpeed = Number(event.target.value);
                })
              }
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
              htmlFor="traceCheckbox"
              style={{
                display: "block",
                textAlign: "center",
                marginBottom: "0.5em",
              }}
            >
              Trace
            </label>
            <input
              type="checkbox"
              id="traceCheckbox"
              checked={traceEnabled}
              onChange={(event) =>
                mutate((draft) => {
                  draft.traceEnabled = event.target.checked;
                  if (!event.target.checked) {
                    draft.traceBuffer = [];
                  }
                })
              }
            />
          </div>
        </div>
        {error && (
          <div
            style={{
              color: "crimson",
              fontSize: "0.85rem",
              marginTop: "0.5rem",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

type SidebarProps = {
  result: ResultRenderPayload | null;
  onSolve: () => void;
  onHoverRow: (index: number | null) => void;
  loading: boolean;
  error: string | null;
};

export function Sidebar({ result, onSolve, onHoverRow, loading, error }: SidebarProps) {
  const objectiveDisplay = useStoreSelector((state) => state.objectiveVector);
  const inequalities = useStoreSelector(
    (state) => state.polytope?.inequalities ?? null
  );

  return (
    <div id="sidebar">
      <div id="sidebarContent" style={{ overflowY: "auto" }}>
        <div
          className="header controlPanel"
          style={{ paddingTop: 13, marginTop: 0, marginBottom: 0 }}
        >
          <h1>lpviz</h1>
          <a
            href="https://github.com/klamike/lpviz"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub Repository for lpviz"
          >
            <svg
              className="github-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 98 96"
              role="img"
              aria-labelledby="githubTitle"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>

        <MigrationBanner />

        <div id="uiContainer">
          <div
            id="terminal-container2"
            style={{
              display: "block",
              color: "#eee",
              marginTop: 15,
              padding: "10px 20px",
              paddingRight: 0,
            }}
          >
            <div id="topResult">
              <div id="nullStateMessage">
                <pre style={{ margin: 0, textAlign: "left" }}>{ASCII_ART}</pre>
              </div>
              <div id="maximize">maximize</div>
              <div id="objectiveDisplay">
                {objectiveDisplay
                  ? `${objectiveDisplay.x.toFixed(3)}, ${objectiveDisplay.y.toFixed(3)}`
                  : ""}
              </div>
              <div id="subjectTo">subject to</div>
              <div id="inequalities">
                {inequalities?.map((ineq, index) => (
                  <div key={index} className="inequality-item">
                    {ineq}
                  </div>
                ))}
              </div>
            </div>
            <div id="terminal-window"></div>
            <div className="scanlines"></div>
            <div
              className="scanlines"
              style={{ ["--delay" as string]: "-8s" }}
            ></div>
          </div>

          <div className="controlPanel">
            <SolverButtons />
            <SolverSettings />
          </div>

          <SecondaryControls onSolve={onSolve} loading={loading} error={error} />

          <label style={{ display: "none" }} htmlFor="replaySpeedSlider">
            Speed:
          </label>
          <input
            style={{ display: "none" }}
            type="range"
            id="replaySpeedSlider"
            min="1"
            max="100"
            defaultValue="10"
            step="1"
          />

          <div id="terminal-container">
            <ResultPanel payload={result} onHoverRow={onHoverRow} />
            <div id="terminal-window"></div>
            <div className="scanlines"></div>
            <div
              className="scanlines"
              style={{ ["--delay" as string]: "-12s" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
