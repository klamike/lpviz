import { Group } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";
import type { State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { applyHugeBounds, getSharedLineMaterial } from "../helpers/sharedLineMaterials";

const ITERATE_LINE_COLOR = "#800080";
const PHASE_COLORS = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#ffff33", "#a65628", "#f781bf", "#999999", "#17becf",
];
const ITERATE_Z = 0.03;
const ITERATE_LINE_RENDER_ORDER = RENDER_ORDER.iterateLine;
const ITERATE_LINE_THICKNESS = 3;

function getDisplayedIterateZ(
  entry: Float64Array,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2]! : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

function getIterateRenderZ(
  entry: Float64Array,
  objectiveVector: PointXY | null,
  zScale: number,
  zAxisOffsetOnly: boolean,
  is3D: boolean,
) {
  if (!is3D) return ITERATE_Z;
  return (getDisplayedIterateZ(entry, objectiveVector, zAxisOffsetOnly) * zScale) / 100 + ITERATE_Z;
}

function buildLinePositions(
  path: Float64Array[],
  objectiveVector: PointXY | null,
  zScale: number,
  zAxisOffsetOnly: boolean,
  is3D: boolean,
) {
  if (path.length < 2) return new Float32Array();
  const positions = new Float32Array(path.length * 3);
  for (let i = 0; i < path.length; i++) {
    const entry = path[i]!;
    positions[i * 3] = entry[0]!;
    positions[i * 3 + 1] = entry[1]!;
    positions[i * 3 + 2] = getIterateRenderZ(entry, objectiveVector, zScale, zAxisOffsetOnly, is3D);
  }
  return positions;
}

type SegmentEntry = { color: string; positions: Float32Array };

function buildIterateSegments(raw: State, is3D: boolean): SegmentEntry[] {
  if (raw.iteratePath.length < 2) return [];

  const hasPhases =
    raw.iteratePhases.length === raw.iteratePath.length && raw.iteratePhases.length > 0;

  if (!hasPhases) {
    const positions = buildLinePositions(
      raw.iteratePath, raw.iterateObjectiveVector, raw.zScale, raw.zAxisOffsetOnly, is3D,
    );
    return positions.length > 0 ? [{ color: ITERATE_LINE_COLOR, positions }] : [];
  }

  const segments: SegmentEntry[] = [];
  let segStart = 0;
  let segPhase = raw.iteratePhases[0]!;

  for (let i = 1; i < raw.iteratePath.length; i++) {
    const currentPhase = raw.iteratePhases[i]!;
    if (currentPhase !== raw.iteratePhases[i - 1]!) {
      const slice = raw.iteratePath.slice(segStart, i + 1);
      const positions = buildLinePositions(slice, raw.iterateObjectiveVector, raw.zScale, raw.zAxisOffsetOnly, is3D);
      if (positions.length > 0) {
        segments.push({ color: PHASE_COLORS[segPhase % PHASE_COLORS.length]!, positions });
      }
      segStart = i - 1;
      segPhase = currentPhase;
    }
  }
  const lastSlice = raw.iteratePath.slice(segStart);
  const lastPositions = buildLinePositions(lastSlice, raw.iterateObjectiveVector, raw.zScale, raw.zAxisOffsetOnly, is3D);
  if (lastPositions.length > 0) {
    segments.push({ color: PHASE_COLORS[segPhase % PHASE_COLORS.length]!, positions: lastPositions });
  }

  return segments;
}

function makeLine2(group: Group): Line2 {
  const geo = new LineGeometry();
  applyHugeBounds(geo);
  const ln = new Line2(geo, getSharedLineMaterial({ color: ITERATE_LINE_COLOR, linewidth: ITERATE_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 }));
  ln.renderOrder = ITERATE_LINE_RENDER_ORDER;
  ln.frustumCulled = false;
  ln.computeLineDistances = () => ln;
  group.add(ln);
  return ln;
}

type PrevState = {
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export class IterateLineLayer implements Layer {
  readonly object3D: Group;
  private pool: Line2[] = [];
  private prev: PrevState | null = null;

  constructor() {
    this.object3D = new Group();
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();

    const p = this.prev;
    if (
      p &&
      p.iteratePath === raw.iteratePath &&
      p.iteratePhases === raw.iteratePhases &&
      p.iterateObjectiveVector === raw.iterateObjectiveVector &&
      p.zScale === raw.zScale &&
      p.zAxisOffsetOnly === raw.zAxisOffsetOnly &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode
    ) {
      return;
    }
    this.prev = {
      iteratePath: raw.iteratePath,
      iteratePhases: raw.iteratePhases,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      zScale: raw.zScale,
      zAxisOffsetOnly: raw.zAxisOffsetOnly,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    if (raw.iteratePath.length < 2 || !shouldRenderSnapshotMode(snap.mode, raw)) {
      this.object3D.visible = false;
      for (const ln of this.pool) ln.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const segments = buildIterateSegments(raw, is3D);

    if (segments.length === 0) {
      this.object3D.visible = false;
      for (const ln of this.pool) ln.visible = false;
      return;
    }

    while (this.pool.length < segments.length) {
      this.pool.push(makeLine2(this.object3D));
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const ln = this.pool[i]!;
      const geo = ln.geometry as LineGeometry;
      geo.setPositions(seg.positions);
      delete (geo as any)._maxInstanceCount;
      ln.material = getSharedLineMaterial({
        color: seg.color,
        linewidth: ITERATE_LINE_THICKNESS,
        depthTest: false,
        depthWrite: false,
        opacity: 1,
      });
      ln.visible = true;
    }
    for (let i = segments.length; i < this.pool.length; i++) {
      this.pool[i]!.visible = false;
    }

    this.object3D.visible = true;
  }

  dispose(): void {
    for (const ln of this.pool) ln.geometry.dispose();
    this.pool = [];
  }
}
