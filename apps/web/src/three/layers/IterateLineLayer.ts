import { computeIterateZ, type State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { Group } from "three";
import { PathRibbon } from "../helpers/pathRibbon";
import { PHASE_COLORS_BYTES } from "../helpers/phaseColors";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const ITERATE_LINE_COLOR = "#800080";
const ITERATE_LINE_THICKNESS = 3;

let pointScratch = new Float32Array(0);
let colorScratch = new Uint8Array(0);

function buildPositions(
  path: Float64Array[],
  objectiveVector: PointXY | null,
): Float32Array {
  if (pointScratch.length < path.length * 3) {
    pointScratch = new Float32Array(path.length * 3);
  }
  for (let i = 0; i < path.length; i++) {
    const entry = path[i]!;
    const base = i * 3;
    pointScratch[base] = entry[0]!;
    pointScratch[base + 1] = entry[1]!;
    // raw z: zScale and the 2D/3D transition flattening are applied via
    // object3D.scale.z, so neither rebuilds the path
    pointScratch[base + 2] = computeIterateZ(entry, objectiveVector);
  }
  return pointScratch;
}

function buildPhaseColors(phases: number[]): Uint8Array {
  if (colorScratch.length < phases.length * 4) {
    colorScratch = new Uint8Array(phases.length * 4);
  }
  for (let i = 0; i < phases.length; i++) {
    const rgb = PHASE_COLORS_BYTES[phases[i]! % PHASE_COLORS_BYTES.length]!;
    const base = i * 4;
    colorScratch[base] = rgb[0];
    colorScratch[base + 1] = rgb[1];
    colorScratch[base + 2] = rgb[2];
    colorScratch[base + 3] = 255;
  }
  return colorScratch;
}

type PrevState = {
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  mode: string;
};

// The iterate path renders as a screen-space ribbon (see pathRibbon.ts):
// true fat-line styling without Line2's quad-per-segment cost, which made
// every camera frame pay for up to maxit capped quads. Phase coloring rides
// along as a per-point color texture, replacing the old one-Line2-per-phase-
// segment pool (and its draw call per segment).
export class IterateLineLayer implements Layer {
  readonly object3D: Group;
  readonly renderPass = "trace" as const;
  readonly invalidationKeys = ["iterate"] as const;
  private ribbon: PathRibbon | null = null;
  private prev: PrevState | null = null;

  constructor() {
    this.object3D = new Group();
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();
    this.object3D.scale.z = (raw.zScale / 100) * snap.transitionZMultiplier;

    const p = this.prev;
    if (
      p &&
      p.iteratePath === raw.iteratePath &&
      p.iteratePhases === raw.iteratePhases &&
      p.iterateObjectiveVector === raw.iterateObjectiveVector &&
      p.mode === snap.mode
    ) {
      return;
    }
    this.prev = {
      iteratePath: raw.iteratePath,
      iteratePhases: raw.iteratePhases,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      mode: snap.mode,
    };

    if (
      raw.iteratePath.length < 2 ||
      !shouldRenderSnapshotMode(snap.mode, raw)
    ) {
      this.object3D.visible = false;
      return;
    }

    if (!this.ribbon) {
      this.ribbon = new PathRibbon({
        color: ITERATE_LINE_COLOR,
        opacity: 1,
        linewidth: ITERATE_LINE_THICKNESS,
      });
      this.ribbon.mesh.renderOrder = RENDER_ORDER.iterateLine;
      this.object3D.add(this.ribbon.mesh);
    }

    const hasPhases =
      raw.iteratePhases.length === raw.iteratePath.length &&
      raw.iteratePhases.length > 0;
    this.ribbon.setPath(
      buildPositions(raw.iteratePath, raw.iterateObjectiveVector),
      raw.iteratePath.length,
      hasPhases ? buildPhaseColors(raw.iteratePhases) : null,
    );
    this.ribbon.mesh.visible = true;
    this.object3D.visible = true;
  }

  dispose(): void {
    this.ribbon?.dispose();
    this.ribbon = null;
  }
}
