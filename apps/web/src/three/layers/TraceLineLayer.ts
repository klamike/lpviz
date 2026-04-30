import { getRenderBenchConfig } from "@/bench/renderBenchConfig";
import type { State } from "@/features/core/store";
import { computeIterateZ } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { Group } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import {
  applyHugeBounds,
  getSharedLineMaterial,
} from "../helpers/sharedLineMaterials";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const TRACE_COLOR = "#ffa500";
const TRACE_OPACITY = 0.4;
const TRACE_RENDER_ORDER = RENDER_ORDER.traceLine;
const TRACE_LINE_THICKNESS = 2;

const getTraceMat = (is3D: boolean) =>
  getSharedLineMaterial({
    color: TRACE_COLOR,
    linewidth: TRACE_LINE_THICKNESS,
    depthTest: is3D,
    depthWrite: is3D,
    opacity: TRACE_OPACITY,
  });

function buildTraceLinePositions(
  path: Float64Array[],
  objectiveVector: PointXY | null,
) {
  if (path.length < 2) return new Float32Array();
  const positions = new Float32Array((path.length - 1) * 6);
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i]!;
    const end = path[i + 1]!;
    const base = i * 6;
    positions[base] = start[0]!;
    positions[base + 1] = start[1]!;
    positions[base + 2] = computeIterateZ(start, objectiveVector);
    positions[base + 3] = end[0]!;
    positions[base + 4] = end[1]!;
    positions[base + 5] = computeIterateZ(end, objectiveVector);
  }
  return positions;
}

function buildLegacyTraceLinePositions(
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
const legacyTraceLinePositionCache = new WeakMap<object, Float32Array>();

function getCachedTraceLinePositions(entry: State["traceBuffer"][number]) {
  let cached = traceLinePositionCache.get(entry);
  if (cached) return cached;
  const positions = buildTraceLinePositions(entry.path, entry.objectiveVector);
  traceLinePositionCache.set(entry, positions);
  return positions;
}

function getCachedLegacyTraceLinePositions(
  entry: State["traceBuffer"][number],
) {
  let cached = legacyTraceLinePositionCache.get(entry);
  if (cached) return cached;
  const positions = buildLegacyTraceLinePositions(
    entry.path,
    entry.objectiveVector,
  );
  legacyTraceLinePositionCache.set(entry, positions);
  return positions;
}

function buildAllTraceLineSegments(raw: State) {
  const chunks = raw.traceBuffer
    .map((entry) => getCachedTraceLinePositions(entry))
    .filter((c) => c.length > 0);
  if (chunks.length === 0) return new Float32Array();
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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
  readonly renderPass = "traceLines" as const;
  readonly invalidationKeys = ["trace"] as const;
  private geometry: LineSegmentsGeometry;
  private line: LineSegments2;
  private legacyLinePool: Line2[] = [];
  private prev: PrevState | null = null;
  private readonly benchConfig = getRenderBenchConfig();

  constructor() {
    this.object3D = new Group();
    const { geometry, line } = this.makeLine(false);
    this.geometry = geometry;
    this.line = line;
  }

  private makeLine(is3D: boolean) {
    const geometry = new LineSegmentsGeometry();
    if (!this.benchConfig.legacyBounds) {
      applyHugeBounds(geometry);
    }
    const line = new LineSegments2(geometry, getTraceMat(is3D));
    line.renderOrder = TRACE_RENDER_ORDER;
    line.frustumCulled = this.benchConfig.legacyBounds === true;
    line.computeLineDistances = () => line;
    line.visible = false;
    this.object3D.add(line);
    return { geometry, line };
  }

  private makeLegacyLine(is3D: boolean): Line2 {
    const geometry = new LineGeometry();
    if (!this.benchConfig.legacyBounds) {
      applyHugeBounds(geometry);
    }
    const line = new Line2(geometry, getTraceMat(is3D));
    line.renderOrder = TRACE_RENDER_ORDER;
    line.frustumCulled = this.benchConfig.legacyBounds === true;
    line.computeLineDistances = () => line;
    line.visible = false;
    this.object3D.add(line);
    return line;
  }

  private hideLegacyLinePool(): void {
    for (const line of this.legacyLinePool) line.visible = false;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();
    this.object3D.scale.z = (raw.zScale / 100) * snap.transitionZMultiplier;

    const p = this.prev;
    if (
      !this.benchConfig.forceAllDirty &&
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

    const shouldShow =
      raw.traceEnabled &&
      raw.traceBuffer.length > 0 &&
      shouldRenderSnapshotMode(snap.mode, raw);
    if (!shouldShow) {
      this.object3D.visible = false;
      this.line.visible = false;
      this.hideLegacyLinePool();
      return;
    }

    const is3D = snap.mode === "3d";
    if (this.benchConfig.legacyTraceLinePool) {
      // Real old path: before 822e411 and the aggregate LineSegments2 rewrite,
      // trace rendering kept one Line2 per trace and called setPositions for
      // every visible trace whenever traceBuffer changed.
      this.line.visible = false;
      const mat = getTraceMat(is3D);
      const linePositions = raw.traceBuffer
        .map((entry) => getCachedLegacyTraceLinePositions(entry))
        .filter((positions) => positions.length >= 6);
      while (this.legacyLinePool.length < linePositions.length) {
        this.legacyLinePool.push(this.makeLegacyLine(is3D));
      }
      for (let i = 0; i < linePositions.length; i++) {
        const line = this.legacyLinePool[i]!;
        const geometry = line.geometry as LineGeometry;
        geometry.setPositions(linePositions[i]!);
        if (!this.benchConfig.legacyBounds) {
          applyHugeBounds(geometry);
        }
        delete (geometry as any)._maxInstanceCount;
        line.material = mat;
        line.visible = true;
      }
      for (let i = linePositions.length; i < this.legacyLinePool.length; i++) {
        this.legacyLinePool[i]!.visible = false;
      }
      this.object3D.visible = linePositions.length > 0;
      return;
    }

    this.hideLegacyLinePool();
    const segments = buildAllTraceLineSegments(raw);
    if (segments.length === 0) {
      this.object3D.visible = false;
      this.line.visible = false;
      return;
    }

    this.geometry.setPositions(segments);
    if (!this.benchConfig.legacyBounds) {
      applyHugeBounds(this.geometry);
    }
    delete (this.geometry as any)._maxInstanceCount;
    this.line.material = getTraceMat(is3D);
    this.line.visible = true;
    this.object3D.visible = true;
  }

  dispose(): void {
    for (const line of this.legacyLinePool) line.geometry.dispose();
    this.legacyLinePool = [];
    this.geometry.dispose();
  }
}
