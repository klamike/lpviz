import { AppHeader } from "./AppHeader";
import { AnimationControlsPanel } from "../panels/AnimationControlsPanel";
import { SolverControlsPanel } from "../panels/SolverControlsPanel";
import { TopResultPanel } from "../panels/TopResultPanel";
import { UsagePanel } from "../panels/UsagePanel";

export function Sidebar() {
  return (
    <div id="sidebar">
      <div id="sidebarContent">
        <AppHeader />
        <div id="uiContainer">
          <TopResultPanel />
          <SolverControlsPanel />
          <AnimationControlsPanel />
          <label className="is-hidden" htmlFor="replaySpeedSlider">
            Speed:
          </label>
          <input className="is-hidden" type="range" id="replaySpeedSlider" min="1" max="100" defaultValue="10" step="1" autoComplete="off" />
          <UsagePanel />
        </div>
      </div>
    </div>
  );
}
