import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  Sphere,
  Vector3,
} from "three";

import { getState } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { getViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { SHARED_CIRCLE_TEXTURE } from "./sharedTextures";

const ITERATE_HIGHLIGHT_COLOR = "#008000";
const ITERATE_HIGHLIGHT_Z = 0.03;
const ITERATE_HIGHLIGHT_PIXEL_SIZE = 8 * 1.3;
const ITERATE_HIGHLIGHT_RENDER_ORDER = RENDER_ORDER.iterateHighlight;

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

function getDisplayedIterateZ(
  entry: ReadonlyArray<number>,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2]! : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

type PrevState = {
  iteratePath: State["iteratePath"];
  highlightIteratePathIndex: State["highlightIteratePathIndex"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export function IterateHighlightLayer() {
  const pts = useMemo(() => {
    const mat = new PointsMaterial({
      color: ITERATE_HIGHLIGHT_COLOR,
      size: ITERATE_HIGHLIGHT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    });
    const p = new Points(makePointsGeo(), mat);
    p.renderOrder = ITERATE_HIGHLIGHT_RENDER_ORDER;
    p.frustumCulled = false;
    p.visible = false;
    return p;
  }, []);

  const prevRef = useRef<PrevState | null>(null);

  useFrame(() => {
    const raw = getState();
    const snap = getViewportRenderSnapshot();

    const p = prevRef.current;
    if (
      p &&
      p.iteratePath                === raw.iteratePath &&
      p.highlightIteratePathIndex  === raw.highlightIteratePathIndex &&
      p.iterateObjectiveVector     === raw.iterateObjectiveVector &&
      p.zScale                     === raw.zScale &&
      p.zAxisOffsetOnly            === raw.zAxisOffsetOnly &&
      p.is3DMode                   === raw.is3DMode &&
      p.isTransitioning3D          === raw.isTransitioning3D &&
      p.mode                       === snap.mode
    ) {
      return;
    }
    prevRef.current = {
      iteratePath: raw.iteratePath,
      highlightIteratePathIndex: raw.highlightIteratePathIndex,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      zScale: raw.zScale,
      zAxisOffsetOnly: raw.zAxisOffsetOnly,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    const index = raw.highlightIteratePathIndex;
    if (
      index === null ||
      index < 0 ||
      index >= raw.iteratePath.length ||
      !shouldRenderSnapshotMode(snap.mode, raw)
    ) {
      pts.visible = false;
      return;
    }

    const entry = raw.iteratePath[index];
    if (!entry) { pts.visible = false; return; }

    const is3D = snap.mode === "3d";
    const z = is3D
      ? (getDisplayedIterateZ(entry, raw.iterateObjectiveVector, raw.zAxisOffsetOnly) * raw.zScale) / 100 + ITERATE_HIGHLIGHT_Z
      : ITERATE_HIGHLIGHT_Z;

    pts.geometry.setAttribute("position", new BufferAttribute(new Float32Array([entry[0]!, entry[1]!, z]), 3));
    pts.visible = true;
  });

  useEffect(() => {
    return () => {
      (pts.material as PointsMaterial).dispose();
      pts.geometry.dispose();
    };
  }, [pts]);

  return <primitive object={pts} />;
}
