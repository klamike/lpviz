import type { RefObject } from "react";

import { useLpvizSelector } from "@/hooks/useLpvizSelector";
import { areSolverSettingsEqual, selectSolverSettings } from "@/state";

import { AnimationControlsPanel } from "@/components/sidebar/AnimationControlsPanel";
import { SidebarHeader } from "@/components/sidebar/SidebarHeader";
import { SolverControlsPanel } from "@/components/sidebar/SolverControlsPanel";
import { TopResultPanel } from "@/components/sidebar/TopResultPanel";
import { UsagePanel } from "@/components/sidebar/UsagePanel";
import { useLpvizActions } from "@/context/LpvizActionsContext";

export function Sidebar({
  sidebarWidth,
  topResultRef,
}: {
  sidebarWidth: number;
  topResultRef: RefObject<HTMLDivElement | null>;
}) {
  const runtimeActions = useLpvizActions();
  const settings = useLpvizSelector(
    selectSolverSettings,
    areSolverSettingsEqual,
  );

  return (
    <header>
      <div id="sidebar" style={{ width: sidebarWidth }}>
        <div id="sidebarContent">
          <SidebarHeader />
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
