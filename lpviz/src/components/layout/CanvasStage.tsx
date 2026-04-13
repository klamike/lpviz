import { useRef } from "react";

import { useLpvizRuntime } from "../../app/lpvizRuntime";
import { useOnboardingActionTarget } from "../../app/onboardingUi";
import { useLpvizSelector } from "../../app/lpvizStore";
import { areCanvasControlsUiStatesEqual, selectCanvasControlsUiState } from "../../app/uiSelectors";
import { useCanvasRuntime } from "./useCanvasRuntime";

export function CanvasStage({
  sidebarWidth,
  onResizeStart,
}: {
  sidebarWidth: number;
  onResizeStart: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeActions = useLpvizRuntime();
  const toggle3DTargetRef = useOnboardingActionTarget("toggle-3d");
  const canvasControlsUiState = useLpvizSelector(selectCanvasControlsUiState, areCanvasControlsUiStatesEqual);
  useCanvasRuntime(canvasRef, sidebarWidth);

  return (
    <main>
      <canvas id="gridCanvas" ref={canvasRef} tabIndex={0}></canvas>
      <div id="zoomControls">
        <button title="Reset Zoom (Home)" onClick={() => runtimeActions.resetView()}>
          <svg width="25" height="25" viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </button>
        <button title="Zoom" onClick={() => runtimeActions.zoomToFit()}>
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
        <button
          id="toggle3DButton"
          ref={toggle3DTargetRef}
          className={canvasControlsUiState.is3DMode ? "button-active" : undefined}
          title="Toggle 3D Mode"
          onClick={() => runtimeActions.toggle3D()}
        >
          {canvasControlsUiState.toggle3DLabel}
        </button>
        <button
          id="toggleZOffsetButton"
          className={[
            canvasControlsUiState.zAxisOffsetOnly ? "button-active" : "",
            canvasControlsUiState.is3DMode ? "" : "is-hidden",
          ].filter(Boolean).join(" ") || undefined}
          title="Toggle objective contribution in Z"
          onClick={() => runtimeActions.toggleZOffset()}
        >
          Exclude Obj
        </button>
        <button id="shareButton" title="Share this configuration" onClick={() => runtimeActions.share()}>
          <svg fill="currentColor" width="25" height="25" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="icon glyph">
            <path d="M20,21H4a2,2,0,0,1-2-2V6A2,2,0,0,1,4,4H8A1,1,0,0,1,8,6H4V19H20V13a1,1,0,0,1,2,0v6A2,2,0,0,1,20,21Z"></path>
            <path d="M21.62,6.22l-5-4a1,1,0,0,0-1.05-.12A1,1,0,0,0,15,3V4.19a9.79,9.79,0,0,0-7,7.65,1,1,0,0,0,.62,1.09A1,1,0,0,0,9,13a1,1,0,0,0,.83-.45C11,10.78,13.58,10.24,15,10.07V11a1,1,0,0,0,.57.9,1,1,0,0,0,1.05-.12l5-4a1,1,0,0,0,0-1.56Z"></path>
          </svg>
        </button>
        <div id="zScaleSliderContainer" className={canvasControlsUiState.is3DMode ? undefined : "is-hidden"}>
          <label htmlFor="zScaleSlider">Scale</label>
          <input
            {...{ orient: "vertical" }}
            type="range"
            id="zScaleSlider"
            min="0.01"
            max="10"
            step="0.01"
            value={canvasControlsUiState.zScale}
            onChange={(e) => runtimeActions.setZScale(parseFloat(e.target.value))}
            title="Adjust Z-axis scale"
          />
          <div id="zScaleValue">{canvasControlsUiState.zScale.toFixed(2)}</div>
        </div>
      </div>
      <div
        id="sidebarHandle"
        style={{ left: sidebarWidth }}
        onMouseDown={(e) => {
          e.preventDefault();
          onResizeStart();
        }}
      ></div>
    </main>
  );
}
