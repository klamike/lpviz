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
// shader; the trade is the fixed 1px line width.
const traceMaterials = {
  flat: new LineBasicMaterial({
    color: TRACE_COLOR,
    transparent: true,
    opacity: TRACE_OPACITY,
    depthTest: false,
    depthWrite: false,
  }),
  depth: new LineBasicMaterial({
    color: TRACE_COLOR,
    transparent: true,
    opacity: TRACE_OPACITY,
    depthTest: true,
    depthWrite: true,
  }),
};

type TraceEntry = State["traceBuffer"][number];

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
// line strip whose geometry is built and uploaded exactly once — a rotation
// step costs one chunk upload instead of re-concatenating and re-uploading
// the entire history, and previously drawn curves can never shift between
// frames.
export class TraceLineLayer implements Layer {
  readonly object3D: Group;
  readonly renderPass = "traceLines" as const;
  readonly invalidationKeys = ["trace"] as const;
  private pool: Line[] = [];
  private assigned = new Map<TraceEntry, Line>();
  private prev: PrevState | null = null;

  constructor() {
    this.object3D = new Group();
  }

  private makeLine(): Line {
    const geometry = new BufferGeometry();
    applyHugeBounds(geometry);
    const line = new Line(geometry, traceMaterials.flat);
    line.renderOrder = TRACE_RENDER_ORDER;
    line.frustumCulled = false;
    line.visible = false;
    this.object3D.add(line);
    this.pool.push(line);
    return line;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();
    this.object3D.scale.z = (raw.zScale / 100) * snap.transitionZMultiplier;

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

    // Recycle lines whose entries were evicted from the buffer
    const live = new Set<TraceEntry>(raw.traceBuffer);
    const freed: Line[] = [];
    for (const [entry, line] of this.assigned) {
      if (!live.has(entry)) {
        this.assigned.delete(entry);
        line.visible = false;
        freed.push(line);
      }
    }

    // Build geometry only for entries that don't have one yet
    const material =
      snap.mode === "3d" ? traceMaterials.depth : traceMaterials.flat;
    for (const entry of raw.traceBuffer) {
      if (this.assigned.has(entry)) continue;
      if (entry.path.length < 2) continue;
      const line = freed.pop() ?? this.makeLine();
      // free the old GL buffer before the attribute is replaced
      line.geometry.dispose();
      line.geometry.setAttribute(
        "position",
        new BufferAttribute(buildEntryPositions(entry), 3),
      );
      line.material = material;
      line.visible = true;
      this.assigned.set(entry, line);
    }
    for (const line of freed) line.visible = false;

    if (modeChanged) {
      for (const line of this.assigned.values()) line.material = material;
    }

    this.object3D.visible = this.assigned.size > 0;
  }

  dispose(): void {
    for (const line of this.pool) line.geometry.dispose();
    this.pool = [];
    this.assigned.clear();
  }
}
