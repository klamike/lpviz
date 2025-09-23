import { state } from "../state/state";

export function ZoomControls() {
  return (
    <>
      <button
        id="unzoomButton"
        title="Reset Zoom (Home)"
        disabled={!state.uiButtons["unzoomButton"]}
      >
        <svg width="25" height="25" viewBox="0 0 24 24">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      </button>
      <button id="zoomButton" title="Zoom" disabled={!state.uiButtons["zoomButton"]}>
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
      <button id="toggle3DButton" title="Toggle 3D Mode">3D</button>
      <button id="shareButton" title="Share this configuration">
        <svg
          fill="currentColor"
          width="25"
          height="25"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          id="share-alt"
          class="icon glyph"
        >
          <path d="M20,21H4a2,2,0,0,1-2-2V6A2,2,0,0,1,4,4H8A1,1,0,0,1,8,6H4V19H20V13a1,1,0,0,1,2,0v6A2,2,0,0,1,20,21Z"></path>
          <path d="M21.62,6.22l-5-4a1,1,0,0,0-1.05-.12A1,1,0,0,0,15,3V4.19a9.79,9.79,0,0,0-7,7.65,1,1,0,0,0,.62,1.09A1,1,0,0,0,9,13a1,1,0,0,0,.83-.45C11,10.78,13.58,10.24,15,10.07V11a1,1,0,0,0,.57.9,1,1,0,0,0,1.05-.12l5-4a1,1,0,0,0,0-1.56Z"></path>
        </svg>
      </button>
      <div id="zScaleSliderContainer" style="display: none; margin-top: 10px; text-align: center">
        <label
          for="zScaleSlider"
          style={{ display: "block", fontSize: "10px", color: "#333", marginBottom: "5px" }}
        >
          Scale
        </label>
        <input
          type="range"
          id="zScaleSlider"
          min="0.01"
          max="10"
          step="0.01"
          value="0.1"
          orient="vertical"
          title="Adjust Z-axis scale"
        />
        <div id="zScaleValue" style={{ fontSize: "9px", color: "#666", marginTop: "5px" }}>
          0.10
        </div>
      </div>
    </>
  );
}

export default ZoomControls;
