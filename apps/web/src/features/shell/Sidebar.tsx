import type { RefObject } from "react";

import { areSolverSettingsEqual, selectSolverSettings } from "@lpviz/state";
import { useLpvizSelector } from "@lpviz/state/react";
import { useLpvizRuntime } from "../../context/LpvizRuntimeProvider";
import { AnimationControlsPanel } from "../solver/AnimationControlsPanel";
import { SolverControlsPanel } from "../solver/SolverControlsPanel";
import { TopResultPanel } from "../solver/TopResultPanel";
import { UsagePanel } from "../solver/UsagePanel";
import { AppHeader } from "./AppHeader";

export function Sidebar({
  sidebarWidth,
  topResultRef,
}: {
  sidebarWidth: number;
  topResultRef: RefObject<HTMLDivElement | null>;
}) {
  const runtimeActions = useLpvizRuntime();
  const settings = useLpvizSelector(
    selectSolverSettings,
    areSolverSettingsEqual,
  );

  return (
    <header>
      <div id="sidebar" style={{ width: sidebarWidth }}>
        <div id="sidebarContent">
          <AppHeader />
          <div id="uiContainer">
            <TopResultPanel topResultRef={topResultRef} />
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
                runtimeActions.updateSolverSetting(
                  "replaySpeed",
                  parseInt(e.target.value, 10),
                );
              }}
              step="1"
              autoComplete="off"
            />
            <UsagePanel />
          </div>
        </div>
      </div>
    </header>
  );
}
