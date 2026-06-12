import type { State } from "@/features/core/store";
import { computeIterateZ } from "@/features/core/store";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
} from "three";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { applyHugeBounds } from "../helpers/sharedLineMaterials";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const TRACE_COLOR = "#ffa500";
const TRACE_OPACITY = 0.4;
const TRACE_RENDER_ORDER = RENDER_ORDER.traceLine;

// Native GL line strips instead of fat-line instancing: a trace at high maxit
// holds millions of segments across its chunks, and instanced fat-line quads
// made both rotation and camera movement GPU-bound at that scale. Strips draw
// every iterate (full fidelity) at 2 vertices per point with a trivial
// shader. GL strips are a fixed 1 device pixel wide, so each chunk is drawn
// BRUSH_OFFSETS_PX.length times at sub-pixel screen offsets (applied as
// world-space translations on per-pass groups, rescaled with the zoom level)
// to read as a ~2 CSS px stroke; the per-pass opacity is solved so the fully
// overlapped core matches TRACE_OPACITY.
// Three passes spaced 120 degrees apart on a 0.75px circle: for any line
// orientation the offsets project onto the line normal with at least ~1.1px
// of spread, so strokes read ~2px wide in every direction at 3x (not 5x)
// the single-strip cost.
const BRUSH_OFFSETS_PX: ReadonlyArray<readonly [number, number]> = [
  [0.75, 0],
  [-0.375, 0.6495],
  [-0.375, -0.6495],
];
const TRACE_PASS_OPACITY =
  1 - (1 - TRACE_OPACITY) ** (1 / BRUSH_OFFSETS_PX.length);

const traceMaterials = {
  flat: new LineBasicMaterial({
    color: TRACE_COLOR,
    transparent: true,
    opacity: TRACE_PASS_OPACITY,
    depthTest: false,
    depthWrite: false,
  }),
  depth: new LineBasicMaterial({
    color: TRACE_COLOR,
    transparent: true,
    opacity: TRACE_PASS_OPACITY,
    depthTest: true,
    depthWrite: true,
  }),
};

type TraceEntry = State["traceBuffer"][number];

// One geometry rendered once per brush pass
type Stroke = {
  geometry: BufferGeometry;
  lines: Line[];
};

function buildEntryPositions(entry: TraceEntry): Float32Array {
  const path = entry.path;
  const positions = new Float32Array(path.length * 3);
  for (let i = 0; i < path.length; i++) {
    const point = path[i]!;
    const base = i * 3;
    positions[base] = point[0]!;
    positions[base + 1] = point[1]!;
    positions[base + 2] = computeIterateZ(point, entry.objectiveVector);
  }
  return positions;
}

type PrevState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

// Each trace entry is immutable once appended, so it gets its own pooled
// stroke whose geometry is built and uploaded exactly once — a rotation step
// costs one chunk upload instead of re-concatenating and re-uploading the
// entire history, and previously drawn curves can never shift between frames.
export class TraceLineLayer implements Layer {
  readonly object3D: Group;
  readonly renderPass = "traceLines" as const;
  // "grid" fires on zoom/resize, which changes units-per-pixel and therefore
  // the world-space size of the sub-pixel brush offsets
  readonly invalidationKeys = ["trace", "grid"] as const;
  private passGroups: Group[] = [];
  private pool: Stroke[] = [];
  private assigned = new Map<TraceEntry, Stroke>();
  private prev: PrevState | null = null;
  private prevUnitsPerPixel = 0;

  constructor() {
    this.object3D = new Group();
    for (let i = 0; i < BRUSH_OFFSETS_PX.length; i++) {
      const group = new Group();
      this.object3D.add(group);
      this.passGroups.push(group);
    }
  }

  private makeStroke(): Stroke {
    const geometry = new BufferGeometry();
    applyHugeBounds(geometry);
    const lines: Line[] = [];
    for (const group of this.passGroups) {
      const line = new Line(geometry, traceMaterials.flat);
      line.renderOrder = TRACE_RENDER_ORDER;
      line.frustumCulled = false;
      line.visible = false;
      group.add(line);
      lines.push(line);
    }
    const stroke = { geometry, lines };
    this.pool.push(stroke);
    return stroke;
  }

  private setStroke(
    stroke: Stroke,
    material: LineBasicMaterial,
    visible: boolean,
  ) {
    for (const line of stroke.lines) {
      line.material = material;
      line.visible = visible;
    }
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();
    this.object3D.scale.z = (raw.zScale / 100) * snap.transitionZMultiplier;

    const unitsPerPixel = snap.unitsPerPixel;
    if (unitsPerPixel !== this.prevUnitsPerPixel) {
      this.prevUnitsPerPixel = unitsPerPixel;
      for (let i = 0; i < this.passGroups.length; i++) {
        const [dx, dy] = BRUSH_OFFSETS_PX[i]!;
        this.passGroups[i]!.position.set(
          dx * unitsPerPixel,
          dy * unitsPerPixel,
          0,
        );
      }
    }

    const p = this.prev;
    if (
      p &&
      p.traceEnabled === raw.traceEnabled &&
      p.traceBuffer === raw.traceBuffer &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode
    ) {
      return;
    }
    const modeChanged = !p || p.mode !== snap.mode;
    this.prev = {
      traceEnabled: raw.traceEnabled,
      traceBuffer: raw.traceBuffer,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    const shouldShow =
      raw.traceEnabled &&
      raw.traceBuffer.length > 0 &&
      shouldRenderSnapshotMode(snap.mode, raw);
    if (!shouldShow) {
      this.object3D.visible = false;
      return;
    }

    // Recycle strokes whose entries were evicted from the buffer
    const live = new Set<TraceEntry>(raw.traceBuffer);
    const freed: Stroke[] = [];
    for (const [entry, stroke] of this.assigned) {
      if (!live.has(entry)) {
        this.assigned.delete(entry);
        this.setStroke(stroke, traceMaterials.flat, false);
        freed.push(stroke);
      }
    }

    // Build geometry only for entries that don't have one yet
    const material =
      snap.mode === "3d" ? traceMaterials.depth : traceMaterials.flat;
    for (const entry of raw.traceBuffer) {
      if (this.assigned.has(entry)) continue;
      if (entry.path.length < 2) continue;
      const stroke = freed.pop() ?? this.makeStroke();
      // free the old GL buffer before the attribute is replaced
      stroke.geometry.dispose();
      stroke.geometry.setAttribute(
        "position",
        new BufferAttribute(buildEntryPositions(entry), 3),
      );
      this.setStroke(stroke, material, true);
      this.assigned.set(entry, stroke);
    }
    for (const stroke of freed) this.setStroke(stroke, material, false);

    if (modeChanged) {
      for (const stroke of this.assigned.values()) {
        this.setStroke(stroke, material, true);
      }
    }

    this.object3D.visible = this.assigned.size > 0;
  }

  dispose(): void {
    for (const stroke of this.pool) stroke.geometry.dispose();
    this.pool = [];
    this.assigned.clear();
  }
}
