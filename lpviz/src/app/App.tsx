export function App() {
  return (
    <>
      <header>
        <div id="sidebar">
          <div id="sidebarContent">
            <div className="header controlPanel">
              <h1>lpviz</h1>
              <a href="https://github.com/klamike/lpviz" target="_blank" rel="noreferrer" aria-label="GitHub Repository for lpviz">
                <svg className="github-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98 96" role="img" aria-labelledby="githubTitle">
                  <title id="githubTitle">GitHub Repository for lpviz</title>
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                    fill="currentColor"
                  />
                </svg>
              </a>
            </div>
            <div id="uiContainer">
              <div id="terminal-container2">
                <div id="topResult">
                  <div id="nullStateMessage" aria-label="lpviz logo"></div>
                  <div id="maximize">maximize</div>
                  <div id="objectiveDisplay"></div>
                  <div id="subjectTo">subject to</div>
                  <div id="inequalities"></div>
                </div>
                <div id="terminal-window"></div>
                <div className="scanlines"></div>
                <div className="scanlines scanlines--delay-8"></div>
              </div>
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
              <label className="is-hidden" htmlFor="replaySpeedSlider">
                Speed:
              </label>
              <input className="is-hidden" type="range" id="replaySpeedSlider" min="1" max="100" defaultValue="10" step="1" autoComplete="off" />
              <div id="terminal-container">
                <div id="result">
                  <div id="usageTips">
                    <br />
                    <br />
                    <strong className="usage-title">Usage Tips:</strong>
                    <br />
                    <br />
                    <strong>Draw a polygon</strong>: click to add vertices
                    <br />
                    <strong>Select a solver</strong>: select a solver to solve immediately
                    <br />
                    <strong>Change objective</strong>: drag it or click <strong>Rotate Objective</strong>
                    <br />
                    <strong>Add new vertices</strong>: double-click an edge
                    <br />
                    <strong>Move vertices</strong>: drag vertices to reshape
                    <br />
                    <strong>Press S</strong>: toggle snapping to the grid
                    <br />
                    <strong>3D Mode</strong>: click 3D button, left-drag to pan, right-drag to orbit, scroll to zoom
                    <br />
                    <strong>3D Z Scale</strong>: Shift + scroll or use the Z Scale slider
                    <br />
                    <strong>Reset</strong>: refresh the page
                    <br />
                    <strong>Undo/Redo</strong>: ⌘+z to undo, ⇧⌘+z to redo
                    <br />
                    <br />
                    <mark style={{ backgroundColor: "whitesmoke", color: "black" }}>
                      <strong>
                        <em>&nbsp;&nbsp;ATTN: Unbounded regions are now supported!&nbsp;&nbsp;</em>
                      </strong>
                      <br />
                      <br />
                    </mark>
                    <strong>Delete a vertex</strong>: right-click it
                    <br />
                    <strong>Stop drawing</strong>: press enter
                  </div>
                </div>
                <div id="terminal-window"></div>
                <div className="scanlines"></div>
                <div className="scanlines scanlines--delay-12"></div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main>
        <canvas id="gridCanvas" tabIndex={0}></canvas>
        <div id="zoomControls">
          <button id="unzoomButton" title="Reset Zoom (Home)">
            <svg width="25" height="25" viewBox="0 0 24 24">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </button>
          <button id="zoomButton" title="Zoom">
            <svg width="25" height="25" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <mask id="hole-mask">
                  <rect width="100" height="100" fill="white" />
                  <circle cx="40" cy="40" r="20" fill="black" />
                </mask>
              </defs>
              <circle cx="40" cy="40" r="32.5" mask="url(#hole-mask)" />
              <g transform="translate(55,55) rotate(45)">
                <rect x="0" y="-4" width="52.5" height="15" />
              </g>
            </svg>
          </button>
          <button id="toggle3DButton" title="Toggle 3D Mode">
            3D
          </button>
          <button id="toggleZOffsetButton" className="is-hidden" title="Toggle objective contribution in Z">
            Exclude Obj
          </button>
          <button id="shareButton" title="Share this configuration">
            <svg fill="currentColor" width="25" height="25" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" id="share-alt" className="icon glyph">
              <path d="M20,21H4a2,2,0,0,1-2-2V6A2,2,0,0,1,4,4H8A1,1,0,0,1,8,6H4V19H20V13a1,1,0,0,1,2,0v6A2,2,0,0,1,20,21Z"></path>
              <path d="M21.62,6.22l-5-4a1,1,0,0,0-1.05-.12A1,1,0,0,0,15,3V4.19a9.79,9.79,0,0,0-7,7.65,1,1,0,0,0,.62,1.09A1,1,0,0,0,9,13a1,1,0,0,0,.83-.45C11,10.78,13.58,10.24,15,10.07V11a1,1,0,0,0,.57.9,1,1,0,0,0,1.05-.12l5-4a1,1,0,0,0,0-1.56Z"></path>
            </svg>
          </button>
          <div id="zScaleSliderContainer" className="is-hidden">
            <label htmlFor="zScaleSlider">Scale</label>
            <input {...{ orient: "vertical" }} type="range" id="zScaleSlider" min="0.01" max="10" step="0.01" defaultValue="0.1" title="Adjust Z-axis scale" />
            <div id="zScaleValue">0.10</div>
          </div>
        </div>
        <div id="sidebarHandle"></div>
      </main>
    </>
  );
}
