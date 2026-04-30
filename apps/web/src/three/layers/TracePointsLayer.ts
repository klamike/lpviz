import type { State } from "@/features/core/store";
import {
  computeIterateZ,
  MAX_TRACE_POINT_SPRITES,
} from "@/features/core/store";
import type { PointXY } from "@lpviz/math/types";
import { BufferAttribute, Group, Points, PointsMaterial } from "three";
import { makePointsGeo } from "../helpers/makePointsGeo";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { SHARED_CIRCLE_TEXTURE } from "../helpers/sharedTextures";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const TRACE_COLOR = "#ffa500";
const TRACE_POINT_PIXEL_SIZE = 6;
const TRACE_POINTS_RENDER_ORDER = RENDER_ORDER.tracePoints;

function buildTracePathPositions(
  path: Float64Array[],
  objectiveVector: PointXY | null,
) {
  if (path.length === 0) return new Float32Array();
  const positions = new Float32Array(path.length * 3);
  for (let i = 0; i < path.length; i++) {
    const entry = path[i]!;
    positions[i * 3] = entry[0]!;
    positions[i * 3 + 1] = entry[1]!;
    positions[i * 3 + 2] = computeIterateZ(entry, objectiveVector);
  }
  return positions;
}

function buildTraceSamplePositions(pathPositions: Float32Array) {
  const pointCount = Math.floor(pathPositions.length / 3);
  if (pointCount === 0) return [] as number[];
  const step = Math.max(1, Math.ceil(pointCount / MAX_TRACE_POINT_SPRITES));
  const samples: number[] = [];
  for (let i = 0; i < pointCount; i += step) {
    samples.push(
      pathPositions[i * 3]!,
      pathPositions[i * 3 + 1]!,
      pathPositions[i * 3 + 2]!,
    );
  }
  const lastBase = (pointCount - 1) * 3;
  if (
    samples.length === 0 ||
    samples[samples.length - 3] !== pathPositions[lastBase] ||
    samples[samples.length - 2] !== pathPositions[lastBase + 1] ||
    samples[samples.length - 1] !== pathPositions[lastBase + 2]
  ) {
    samples.push(
      pathPositions[lastBase]!,
      pathPositions[lastBase + 1]!,
      pathPositions[lastBase + 2]!,
    );
  }
  return samples;
}

const tracePointPositionCache = new WeakMap<object, Float32Array>();

function getCachedTracePointPositions(entry: State["traceBuffer"][number]) {
  let cached = tracePointPositionCache.get(entry);
  if (cached) return cached;
  const pathPos = buildTracePathPositions(entry.path, entry.objectiveVector);
  const sampled =
    pathPos.length === 0
      ? new Float32Array()
      : new Float32Array(buildTraceSamplePositions(pathPos));
  tracePointPositionCache.set(entry, sampled);
  return sampled;
}

function buildAllTracePointPositions(raw: State, mode: "2d" | "3d") {
  if (
    !raw.traceEnabled ||
    raw.traceBuffer.length === 0 ||
    !shouldRenderSnapshotMode(mode, raw)
  ) {
    return new Float32Array();
  }
  const chunks = raw.traceBuffer
    .map((entry) => getCachedTracePointPositions(entry))
    .filter((c) => c.length > 0);
  if (chunks.length === 0) return new Float32Array();
  const total = chunks.reduce((s, c) => s + c.length, 0);
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

export class TracePointsLayer implements Layer {
  readonly object3D: Group;
  readonly renderPass = "trace" as const;
  readonly invalidationKeys = ["trace"] as const;
  private pts: Points;
  private prev: PrevState | null = null;

  constructor() {
    const mat = new PointsMaterial({
      color: TRACE_COLOR,
      size: TRACE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    });
    const pts = new Points(makePointsGeo(), mat);
    pts.renderOrder = TRACE_POINTS_RENDER_ORDER;
    pts.frustumCulled = false;
    const group = new Group();
    group.add(pts);
    this.object3D = group;
    this.pts = pts;
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

    const positions = buildAllTracePointPositions(raw, snap.mode);
    this.object3D.visible = positions.length > 0;
    if (positions.length > 0) {
      this.pts.geometry.setAttribute(
        "position",
        new BufferAttribute(positions, 3),
      );
    }
  }

  dispose(): void {
    (this.pts.material as PointsMaterial).dispose();
    this.pts.geometry.dispose();
  }
}
