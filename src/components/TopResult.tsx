import { createEffect, onCleanup, onMount } from "solid-js";
import { useLegacy } from "../context/LegacyContext";
import { state } from "../state/state";

const OBJECTIVE_PRECISION = 3;
const NULL_STATE_ASCII = [
  "___ /\\_ \\ __ \\//\\ \\ ______ __ __/\\_\\ _____ \\ \\ \\ /\\ __ \\/\\ \\/\\",
  "\\/\\/\\__ \\ \\_\\ \\ \\ \\_\\ \\ \\ \\_/ \\ \\ \\/_/ /_ /\\____\\ \\ __/\\",
  "\\___/ \\ \\_\\/\\____\\ \\/____/\\ \\ \\/ \\/__/ \\/_/\\/____/ \\ \\_\\ \\/_/",
].join("\n");

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatObjective(a: number, b: number) {
  const sign = b >= 0 ? "+" : "-";
  const absB = Math.abs(b);
  return `${a}x ${sign} ${absB}y`;
}

export function TopResult() {
  const legacy = useLegacy();
  let inequalitiesRef: HTMLDivElement | undefined;

  const updateInequalities = () => {
    if (!inequalitiesRef) return;
    inequalitiesRef.innerHTML = state.inequalitiesHtml;
  };

  const handleMouseOver = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !target.classList.contains("inequality-item")) return;
    const index = parseInt(target.getAttribute("data-index") || "", 10);
    if (Number.isFinite(index)) {
      state.highlightIndex = index;
      legacy.canvasManager.draw();
    }
  };

  const handleMouseOut = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !target.classList.contains("inequality-item")) return;
    state.highlightIndex = null;
    legacy.canvasManager.draw();
  };

  onMount(() => {
    if (!inequalitiesRef) return;
    inequalitiesRef.addEventListener("mouseover", handleMouseOver);
    inequalitiesRef.addEventListener("mouseout", handleMouseOut);
  });

  onCleanup(() => {
    if (!inequalitiesRef) return;
    inequalitiesRef.removeEventListener("mouseover", handleMouseOver);
    inequalitiesRef.removeEventListener("mouseout", handleMouseOut);
  });

  createEffect(updateInequalities);

  const objectiveText = () => {
    const vector = state.objectiveVector;
    if (!vector) return "";
    const a = round(vector.x, OBJECTIVE_PRECISION);
    const b = round(vector.y, OBJECTIVE_PRECISION);
    return formatObjective(a, b);
  };

  const hasObjective = () => objectiveText().length > 0;
  const showSubjectTo = () => state.computedLines.length > 0;

  return (
    <div id="topResult">
      <div
        id="nullStateMessage"
        style={{ display: state.showNullStateMessage ? "block" : "none" }}
      >
        {NULL_STATE_ASCII}
      </div>
      <div id="maximize" style={{ display: hasObjective() ? "block" : "none" }}>
        maximize
      </div>
      <div
        id="objectiveDisplay"
        classList={{ "objective-item": hasObjective() }}
        style={{ color: hasObjective() ? "#eee" : undefined }}
      >
        {objectiveText()}
      </div>
      <div
        id="subjectTo"
        style={{ display: showSubjectTo() ? "block" : "none" }}
      >
        subject to
      </div>
      <div id="inequalities" ref={(el) => (inequalitiesRef = el)}></div>
    </div>
  );
}

export default TopResult;
