import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
  Sphere,
  Vector3,
} from "three";

import { getState, MAX_TRACE_POINT_SPRITES } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { getViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { SHARED_CIRCLE_TEXTURE } from "./sharedTextures";

const TRACE_COLOR = "#ffa500";
const TRACE_Z_OFFSET = 0.02;
const TRACE_POINT_PIXEL_SIZE = 6;
const TRACE_POINTS_RENDER_ORDER = RENDER_ORDER.tracePoints;

const HUGE = 1e10;
const HUGE_BOX = new Box3(new Vector3(-HUGE, -HUGE, -HUGE), new Vector3(HUGE, HUGE, HUGE));
const HUGE_SPHERE = new Sphere(new Vector3(0, 0, 0), HUGE);

function makePointsGeo(): BufferGeometry {
  const geo = new BufferGeometry();
  geo.boundingBox = HUGE_BOX.clone();
  geo.boundingSphere = HUGE_SPHERE.clone();
  geo.computeBoundingBox = () => {};
  geo.computeBoundingSphere = () => {};
  return geo;
}

function getDisplayedTraceZ(
  entry: number[],
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2] : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

function buildTracePathPositions(
  path: number[][],
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  if (path.length === 0) return new Float32Array();
  const positions = new Float32Array(path.length * 3);
  for (let i = 0; i < path.length; i++) {
    const entry = path[i]!;
    positions[i * 3]     = entry[0]!;
    positions[i * 3 + 1] = entry[1]!;
    positions[i * 3 + 2] = getDisplayedTraceZ(entry, objectiveVector, zAxisOffsetOnly);
  }
  return positions;
}

function buildTraceSamplePositions(pathPositions: Float32Array) {
  const pointCount = Math.floor(pathPositions.length / 3);
  if (pointCount === 0) return [] as number[];
  const step = Math.max(1, Math.ceil(pointCount / MAX_TRACE_POINT_SPRITES));
  const samples: number[] = [];
  for (let i = 0; i < pointCount; i += step) {
    samples.push(pathPositions[i * 3]!, pathPositions[i * 3 + 1]!, pathPositions[i * 3 + 2]!);
  }
  const lastBase = (pointCount - 1) * 3;
  if (
    samples.length === 0 ||
    samples[samples.length - 3] !== pathPositions[lastBase] ||
    samples[samples.length - 2] !== pathPositions[lastBase + 1] ||
    samples[samples.length - 1] !== pathPositions[lastBase + 2]
  ) {
    samples.push(pathPositions[lastBase]!, pathPositions[lastBase + 1]!, pathPositions[lastBase + 2]!);
  }
  return samples;
}

const tracePointPositionCache = new WeakMap<object, Map<string, Float32Array>>();

function getCachedTracePointPositions(
  entry: State["traceBuffer"][number],
  zAxisOffsetOnly: boolean,
) {
  const key = zAxisOffsetOnly ? "1" : "0";
  let cache = tracePointPositionCache.get(entry);
  if (!cache) { cache = new Map(); tracePointPositionCache.set(entry, cache); }
  const cached = cache.get(key);
  if (cached) return cached;
  const pathPos = buildTracePathPositions(entry.path, entry.objectiveVector, zAxisOffsetOnly);
  const sampled = pathPos.length === 0 ? new Float32Array() : new Float32Array(buildTraceSamplePositions(pathPos));
  cache.set(key, sampled);
  return sampled;
}

function buildAllTracePointPositions(raw: ReturnType<typeof getState>, mode: "2d" | "3d") {
  if (!raw.traceEnabled || raw.traceBuffer.length === 0 || !shouldRenderSnapshotMode(mode, raw)) {
    return new Float32Array();
  }
  const chunks = raw.traceBuffer
    .map((entry) => getCachedTracePointPositions(entry, raw.zAxisOffsetOnly))
    .filter((c) => c.length > 0);
  if (chunks.length === 0) return new Float32Array();
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

type PrevState = {
  traceEnabled: boolean;
  traceBuffer: State["traceBuffer"];
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export function TracePointsLayer() {
  const { group, pts } = useMemo(() => {
    const mat = new PointsMaterial({
      color: TRACE_COLOR,
      size: TRACE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
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
    return { group, pts };
  }, []);

  const prevRef = useRef<PrevState | null>(null);

  useFrame(() => {
    const raw = getState();
    const snap = getViewportRenderSnapshot();
    const is3D = snap.mode === "3d";

    group.scale.z = raw.zScale / 100;
    group.position.z = is3D ? 0 : TRACE_Z_OFFSET;

    const p = prevRef.current;
    if (
      p &&
      p.traceEnabled      === raw.traceEnabled &&
      p.traceBuffer       === raw.traceBuffer &&
      p.zAxisOffsetOnly   === raw.zAxisOffsetOnly &&
      p.is3DMode          === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode              === snap.mode
    ) {
      return;
    }
    prevRef.current = {
      traceEnabled: raw.traceEnabled,
      traceBuffer: raw.traceBuffer,
      zAxisOffsetOnly: raw.zAxisOffsetOnly,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    const positions = buildAllTracePointPositions(raw, snap.mode);
    group.visible = positions.length > 0;
    if (positions.length > 0) {
      pts.geometry.setAttribute("position", new BufferAttribute(positions, 3));
    }
  });

  useEffect(() => {
    return () => {
      (pts.material as PointsMaterial).dispose();
      pts.geometry.dispose();
    };
  }, [pts]);

  return <primitive object={group} />;
}
