import { useLegacyRuntimeElementRefs } from "../../app/legacyRuntimeElements";
import { lpvizRuntimeCommands } from "../../app/lpvizRuntime";
import { useLpvizSelector } from "../../app/lpvizStore";
import { areSolverSettingsEqual, selectSolverSettings } from "../../app/uiSelectors";
import { AppHeader } from "./AppHeader";
import { AnimationControlsPanel } from "../panels/AnimationControlsPanel";
import { SolverControlsPanel } from "../panels/SolverControlsPanel";
import { TopResultPanel } from "../panels/TopResultPanel";
import { UsagePanel } from "../panels/UsagePanel";

export function Sidebar() {
  const refs = useLegacyRuntimeElementRefs();
  const settings = useLpvizSelector(selectSolverSettings, areSolverSettingsEqual);

  return (
    <div id="sidebar" ref={refs.sidebar}>
      <div id="sidebarContent">
        <AppHeader />
        <div id="uiContainer">
          <TopResultPanel />
          <SolverControlsPanel />
          <AnimationControlsPanel />
          <label className="is-hidden" htmlFor="replaySpeedSlider">
            Speed:
          </label>
          <input
            className="is-hidden"
            type="range"
            id="replaySpeedSlider"
            min="1"
            max="100"
            value={settings.replaySpeed}
            onChange={(e) => {
              lpvizRuntimeCommands.updateSolverSetting("replaySpeed", parseInt(e.target.value, 10));
            }}
            step="1"
            autoComplete="off"
          />
          <UsagePanel />
        </div>
      </div>
    </div>
  );
}
