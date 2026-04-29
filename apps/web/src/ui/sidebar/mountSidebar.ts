import type { AppContext } from "@/app/appContext";
import { getState, subscribe } from "@/features/core/store";
import { el } from "@/ui/dom";
import { mountAnimationControlsPanel } from "@/ui/sidebar/mountAnimationControlsPanel";
import { mountProblemPanel } from "@/ui/sidebar/mountProblemPanel";
import { mountSolverControlsPanel } from "@/ui/sidebar/mountSolverControlsPanel";
import { mountSolverLogPanel } from "@/ui/sidebar/mountSolverLogPanel";

export function mountSidebar(parent: HTMLElement, ctx: AppContext) {
  const header = el("header");
  const sidebar = el("div", { id: "sidebar" });
  sidebar.style.width = `${ctx.getSidebarWidth()}px`;
  const content = el("div", { id: "sidebarContent" });
  const title = el("div", { className: "header controlPanel" }, [
    el("h1", { text: "lpviz" }),
    el("a", {
      className: "github-link",
      text: "GitHub",
      attrs: {
        href: "https://github.com/klamike/lpviz",
        target: "_blank",
        rel: "noreferrer",
        "aria-label": "GitHub Repository for lpviz",
      },
    }),
  ]);
  const ui = el("div", { id: "uiContainer" });
  content.append(title, ui);
  sidebar.append(content);
  header.append(sidebar);
  parent.append(header);
  const children = [
    mountProblemPanel(ui, ctx),
    mountSolverControlsPanel(ui, ctx),
    mountAnimationControlsPanel(ui, ctx),
  ];
  const label = el("label", {
    className: "is-hidden",
    attrs: { for: "replaySpeedSlider" },
    text: "Speed:",
  });
  const replay = el("input", {
    className: "is-hidden",
    attrs: {
      type: "range",
      id: "replaySpeedSlider",
      min: "1",
      max: "100",
      step: "1",
      autocomplete: "off",
    },
  }) as HTMLInputElement;
  replay.addEventListener("input", () =>
    ctx.actions.updateSolverSetting("replaySpeed", parseInt(replay.value, 10)),
  );
  ui.append(label, replay);
  children.push(mountSolverLogPanel(ui, ctx));
  const unsub = subscribe((s) => {
    replay.value = String(s.solverSettings.replaySpeed);
  });
  replay.value = String(getState().solverSettings.replaySpeed);
  return {
    updateWidth: (w: number) => {
      sidebar.style.width = `${w}px`;
    },
    destroy: () => {
      unsub();
      for (const c of children) c.destroy();
      header.remove();
    },
  };
}
