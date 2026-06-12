import type { State } from "@/features/core/store";
import { computeIterateZ } from "@/features/core/store";
import { Group } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import {
  applyHugeBounds,
  getSharedLineMaterial,
  replaceLinePositions,
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

// Total cap on rendered trace segments: it bounds both the per-update build
// and upload (the whole buffer is rebuilt whenever an entry is appended) and
// the per-frame draw cost while the camera moves — fat-line instances are
// what made orbiting crawl with large traces.
const MAX_TRACE_LINE_SEGMENTS = 32768;

let traceScratch = new Float32Array(0);

function buildAllTraceLineSegments(raw: State) {
  let totalPoints = 0;
  for (const entry of raw.traceBuffer) {
    if (entry.path.length >= 2) totalPoints += entry.path.length;
  }
  if (totalPoints === 0) return traceScratch.subarray(0, 0);

  // Sample each path down so the summed segment count stays within budget;
  // connecting consecutive sampled points keeps every curve continuous.
  const scale = Math.min(1, MAX_TRACE_LINE_SEGMENTS / totalPoints);
  const maxSegments =
    Math.min(totalPoints, MAX_TRACE_LINE_SEGMENTS) +
    2 * raw.traceBuffer.length;
  if (traceScratch.length < maxSegments * 6) {
    traceScratch = new Float32Array(maxSegments * 6);
  }

  let offset = 0;
  for (const entry of raw.traceBuffer) {
    const path = entry.path;
    if (path.length < 2) continue;
    const lastIndex = path.length - 1;
    const samples = Math.max(2, Math.round(path.length * scale));
    let prev = path[0]!;
    let prevZ = computeIterateZ(prev, entry.objectiveVector);
    for (let i = 1; i < samples; i++) {
      const point = path[Math.round((i * lastIndex) / (samples - 1))]!;
      const z = computeIterateZ(point, entry.objectiveVector);
      traceScratch[offset] = prev[0]!;
      traceScratch[offset + 1] = prev[1]!;
      traceScratch[offset + 2] = prevZ;
      traceScratch[offset + 3] = point[0]!;
      traceScratch[offset + 4] = point[1]!;
      traceScratch[offset + 5] = z;
      offset += 6;
      prev = point;
      prevZ = z;
    }
  }
  return traceScratch.subarray(0, offset);
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
  private prev: PrevState | null = null;

  constructor() {
    const geometry = new LineSegmentsGeometry();
    applyHugeBounds(geometry);
    const line = new LineSegments2(geometry, getTraceMat(false));
    line.renderOrder = TRACE_RENDER_ORDER;
    line.frustumCulled = false;
    line.computeLineDistances = () => line;
    line.visible = false;
    this.object3D = new Group();
    this.object3D.add(line);
    this.geometry = geometry;
    this.line = line;
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

    const shouldShow =
      raw.traceEnabled &&
      raw.traceBuffer.length > 0 &&
      shouldRenderSnapshotMode(snap.mode, raw);
    if (!shouldShow) {
      this.object3D.visible = false;
      this.line.visible = false;
      return;
    }

    const segments = buildAllTraceLineSegments(raw);
    if (segments.length === 0) {
      this.object3D.visible = false;
      this.line.visible = false;
      return;
    }

    replaceLinePositions(this.geometry, segments);
    this.line.material = getTraceMat(snap.mode === "3d");
    this.line.visible = true;
    this.object3D.visible = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
