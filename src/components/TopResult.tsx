import { createMemo } from "solid-js";
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
  const objectiveText = createMemo(() => {
    const vector = state.objectiveVector;
    if (!vector) return "";
    const a = round(vector.x, OBJECTIVE_PRECISION);
    const b = round(vector.y, OBJECTIVE_PRECISION);
    return formatObjective(a, b);
  });

  const hasObjective = createMemo(() => objectiveText().length > 0);

  return (
    <div id="topResult">
      <div id="nullStateMessage">{NULL_STATE_ASCII}</div>
      <div id="maximize">maximize</div>
      <div
        id="objectiveDisplay"
        classList={{ "objective-item": hasObjective() }}
        style={{ color: hasObjective() ? "#eee" : undefined }}
      >
        {objectiveText()}
      </div>
      <div id="subjectTo">subject to</div>
      <div id="inequalities"></div>
    </div>
  );
}

export default TopResult;
