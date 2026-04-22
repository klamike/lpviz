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
import { SHARED_STAR_TEXTURE } from "./sharedTextures";

const ITERATE_STAR_COLOR = "#008000";
const ITERATE_STAR_Z = 0.03;
const ITERATE_STAR_PIXEL_SIZE = 18;
const ITERATE_STAR_RENDER_ORDER = RENDER_ORDER.iterateStar;

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
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export function IterateStarLayer() {
  const pts = useMemo(() => {
    const mat = new PointsMaterial({
      color: ITERATE_STAR_COLOR,
      size: ITERATE_STAR_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_STAR_TEXTURE,
      alphaTest: 0.2,
    });
    const p = new Points(makePointsGeo(), mat);
    p.renderOrder = ITERATE_STAR_RENDER_ORDER;
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
      p.iteratePath           === raw.iteratePath &&
      p.iterateObjectiveVector === raw.iterateObjectiveVector &&
      p.zScale                === raw.zScale &&
      p.zAxisOffsetOnly       === raw.zAxisOffsetOnly &&
      p.is3DMode              === raw.is3DMode &&
      p.isTransitioning3D     === raw.isTransitioning3D &&
      p.mode                  === snap.mode
    ) {
      return;
    }
    prevRef.current = {
      iteratePath: raw.iteratePath,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      zScale: raw.zScale,
      zAxisOffsetOnly: raw.zAxisOffsetOnly,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    const entry = raw.iteratePath[raw.iteratePath.length - 1];
    if (!entry || !shouldRenderSnapshotMode(snap.mode, raw)) {
      pts.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const z = is3D
      ? (getDisplayedIterateZ(entry, raw.iterateObjectiveVector, raw.zAxisOffsetOnly) * raw.zScale) / 100 + ITERATE_STAR_Z
      : ITERATE_STAR_Z;

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
