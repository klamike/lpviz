import type { State } from "@/features/core/store";
import { computeFlatTraceZ } from "@/features/core/store";
import { Group } from "three";
import { PathRibbon } from "../helpers/pathRibbon";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const TRACE_COLOR = "#ffa500";
const TRACE_OPACITY = 0.4;
const TRACE_LINE_THICKNESS = 2;

type TraceEntry = State["traceBuffer"][number];

let pointScratch = new Float32Array(0);

function buildEntryPoints(entry: TraceEntry): Float32Array {
  const { points, count, stride, objectiveVector } = entry;
  if (pointScratch.length < count * 3) {
    pointScratch = new Float32Array(count * 3);
  }
  for (let i = 0; i < count; i++) {
    const base = i * stride;
    const o = i * 3;
    pointScratch[o] = points[base]!;
    pointScratch[o + 1] = points[base + 1]!;
    pointScratch[o + 2] = computeFlatTraceZ(points, base, stride, objectiveVector);
  }
  return pointScratch;
}

type PrevState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

// Trace paths render as screen-space ribbons (see pathRibbon.ts): the same
// 2px fat-line styling as the rest of the app without Line2's quad-per-
// segment cost, which is unaffordable at millions of sub-pixel segments.
// Each trace entry is immutable once appended, so it gets its own pooled
// ribbon whose path texture is built and uploaded exactly once — a rotation
// step costs one chunk upload, every iterate is drawn (no sampling), and
// previously drawn curves can never shift between frames.
export class TraceLineLayer implements Layer {
  readonly object3D: Group;
  readonly renderPass = "traceLines" as const;
  readonly invalidationKeys = ["trace"] as const;
  private pool: PathRibbon[] = [];
  private assigned = new Map<TraceEntry, PathRibbon>();
  private prev: PrevState | null = null;
  // monotonic append sequence stamped on each ribbon mesh; TraceCache keys
  // its incremental accumulation on it (see TraceCache.ts)
  private nextSeq = 0;

  constructor() {
    this.object3D = new Group();
  }

  private makeRibbon(): PathRibbon {
    const ribbon = new PathRibbon({
      color: TRACE_COLOR,
      opacity: TRACE_OPACITY,
      linewidth: TRACE_LINE_THICKNESS,
    });
    ribbon.mesh.renderOrder = RENDER_ORDER.traceLine;
    this.object3D.add(ribbon.mesh);
    this.pool.push(ribbon);
    return ribbon;
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

    // Recycle ribbons whose entries were evicted from the buffer
    const live = new Set<TraceEntry>(raw.traceBuffer);
    const freed: PathRibbon[] = [];
    for (const [entry, ribbon] of this.assigned) {
      if (!live.has(entry)) {
        this.assigned.delete(entry);
        ribbon.mesh.visible = false;
        freed.push(ribbon);
      }
    }

    // Build the path texture only for entries that don't have one yet
    const is3D = snap.mode === "3d";
    for (const entry of raw.traceBuffer) {
      if (this.assigned.has(entry)) continue;
      if (entry.count < 2) continue;
      const ribbon = freed.pop() ?? this.makeRibbon();
      ribbon.setPath(buildEntryPoints(entry), entry.count);
      ribbon.setDepth(is3D);
      ribbon.mesh.userData.traceSeq = this.nextSeq++;
      ribbon.mesh.visible = true;
      this.assigned.set(entry, ribbon);
    }
    for (const ribbon of freed) ribbon.mesh.visible = false;

    if (modeChanged) {
      for (const ribbon of this.assigned.values()) ribbon.setDepth(is3D);
    }

    this.object3D.visible = this.assigned.size > 0;
  }

  dispose(): void {
    for (const ribbon of this.pool) ribbon.dispose();
    this.pool = [];
    this.assigned.clear();
  }
}
