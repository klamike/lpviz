import type { RefObject } from "react";

import { useLpvizStore } from "@/features/core/store";
import { areSolverSettingsEqual, selectSolverSettings } from "@/features/core/selectors";

import { AnimationControlsPanel } from "@/components/sidebar/AnimationControlsPanel";
import { SidebarHeader } from "@/components/sidebar/SidebarHeader";
import { SolverControlsPanel } from "@/components/sidebar/SolverControlsPanel";
import { TopResultPanel } from "@/components/sidebar/TopResultPanel";
import { UsagePanel } from "@/components/sidebar/UsagePanel";
import { useAppActions } from "@/features/core/actions";

export function Sidebar({
  sidebarWidth,
  topResultRef,
}: {
  sidebarWidth: number;
  topResultRef: RefObject<HTMLDivElement | null>;
}) {
  const runtimeActions = useAppActions();
  const settings = useLpvizStore(
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
