import { Group } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";
import { computeIterateZ } from "@/features/core/store";
import type { State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { applyHugeBounds, getSharedLineMaterial } from "../helpers/sharedLineMaterials";

const TRACE_COLOR = "#ffa500";
const TRACE_OPACITY = 0.4;
const TRACE_RENDER_ORDER = RENDER_ORDER.traceLine;
const TRACE_LINE_THICKNESS = 2;

const traceMat = getSharedLineMaterial({ color: TRACE_COLOR, linewidth: TRACE_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: TRACE_OPACITY });

function buildTraceLinePositions(
  path: Float64Array[],
  objectiveVector: PointXY | null,
) {
  if (path.length < 2) return new Float32Array();
  const positions = new Float32Array(path.length * 3);
  for (let i = 0; i < path.length; i++) {
    const entry = path[i]!;
    positions[i * 3] = entry[0]!;
    positions[i * 3 + 1] = entry[1]!;
    positions[i * 3 + 2] = computeIterateZ(entry, objectiveVector);
  }
  return positions;
}

const traceLinePositionCache = new WeakMap<object, Float32Array>();

function getCachedTraceLinePositions(entry: State["traceBuffer"][number]) {
  let cached = traceLinePositionCache.get(entry);
  if (cached) return cached;
  const positions = buildTraceLinePositions(entry.path, entry.objectiveVector);
  traceLinePositionCache.set(entry, positions);
  return positions;
}

function makeLine2(mat: ReturnType<typeof getSharedLineMaterial>, group: Group): Line2 {
  const geo = new LineGeometry();
  applyHugeBounds(geo);
  const ln = new Line2(geo, mat);
  ln.renderOrder = TRACE_RENDER_ORDER;
  ln.frustumCulled = false;
  ln.computeLineDistances = () => ln;
  group.add(ln);
  return ln;
}

type PrevState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export class TraceLineLayer implements Layer {
  readonly object3D: Group;
  private pool: Line2[] = [];
  private lastPositions: (Float32Array | null)[] = [];
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
      p.traceEnabled === raw.traceEnabled &&
      p.traceBuffer === raw.traceBuffer &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode
    ) {
      return;
    }
    this.prev = {
      traceEnabled: raw.traceEnabled,
      traceBuffer: raw.traceBuffer,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    const shouldShow = raw.traceEnabled && raw.traceBuffer.length > 0 && shouldRenderSnapshotMode(snap.mode, raw);
    if (!shouldShow) {
      this.object3D.visible = false;
      for (const ln of this.pool) ln.visible = false;
      return;
    }

    const linePositions: Float32Array[] = [];
    for (const entry of raw.traceBuffer) {
      const pos = getCachedTraceLinePositions(entry);
      if (pos.length >= 6) linePositions.push(pos);
    }

    if (linePositions.length === 0) {
      this.object3D.visible = false;
      for (const ln of this.pool) ln.visible = false;
      return;
    }

    const mat = traceMat;

    while (this.pool.length < linePositions.length) {
      this.pool.push(makeLine2(mat, this.object3D));
      this.lastPositions.push(null);
    }

    for (let i = 0; i < linePositions.length; i++) {
      const ln = this.pool[i]!;
      const newPos = linePositions[i]!;
      if (this.lastPositions[i] !== newPos) {
        const geo = ln.geometry as LineGeometry;
        geo.setPositions(newPos);
        delete (geo as any)._maxInstanceCount;
        this.lastPositions[i] = newPos;
      }
      ln.material = mat;
      ln.visible = true;
    }
    for (let i = linePositions.length; i < this.pool.length; i++) {
      this.pool[i]!.visible = false;
    }

    this.object3D.visible = true;
  }

  dispose(): void {
    for (const ln of this.pool) ln.geometry.dispose();
    this.pool = [];
    this.lastPositions = [];
  }
}
