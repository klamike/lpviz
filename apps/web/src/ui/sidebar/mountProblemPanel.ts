import type { AppContext } from "@/app/appContext";
import {
  formatObjectiveDisplay,
  selectInequalitiesUiState,
  selectTopResultUiState,
} from "@/features/core/selectors";
import { getState, subscribe, type State } from "@/features/core/store";
import { clear, el } from "@/ui/dom";
import { renderNullStateLogo } from "@/ui/logo";

export function mountProblemPanel(parent: HTMLElement, ctx: AppContext) {
  const frame = el("div", { id: "terminal-container2" });
  const topResult = el("div", { id: "topResult" });
  const nullState = el("div", {
    id: "nullStateMessage",
    attrs: { "aria-label": "lpviz logo" },
  });
  renderNullStateLogo(nullState);
  const maximize = el("div", { id: "maximize", text: "maximize" });
  const objective = el("div", { id: "objectiveDisplay" });
  const subjectTo = el("div", { id: "subjectTo", text: "subject to" });
  const inequalities = el("div", { id: "inequalities" });
  topResult.append(nullState, maximize, objective, subjectTo, inequalities);
  frame.append(
    topResult,
    el("div", { id: "terminal-window" }),
    el("div", { className: "scanlines" }),
    el("div", { className: "scanlines scanlines--delay-8" }),
  );
  parent.append(frame);
  function render(state: State) {
    const top = selectTopResultUiState(state);
    nullState.style.display = top.nullStateVisible ? "" : "none";
    maximize.className = top.maximizeVisible ? "is-block" : "is-hidden";
    objective.className = top.objectiveActive
      ? "objective-item objective-active"
      : "";
    objective.textContent = formatObjectiveDisplay(state.objectiveVector);
    subjectTo.className = top.subjectToVisible ? "is-block" : "is-hidden";
    const list = selectInequalitiesUiState(state);
    clear(inequalities);
    if (list.message !== null) inequalities.textContent = list.message;
    else
      list.items.forEach((text, index) => {
        const row = el("div", { className: "inequality-item", text });
        row.addEventListener("mouseenter", () =>
          ctx.actions.setConstraintHighlight(index),
        );
        row.addEventListener("mouseleave", () =>
          ctx.actions.setConstraintHighlight(null),
        );
        inequalities.append(row);
      });
  }
  render(getState());
  const unsub = subscribe(render);
  return {
    topResult,
    destroy: () => {
      unsub();
      frame.remove();
    },
  };
}
