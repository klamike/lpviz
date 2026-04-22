import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
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

const ITERATE_POINT_COLOR = "#800080";
const PHASE_COLORS = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#ffff33", "#a65628", "#f781bf", "#999999", "#17becf",
];
const PHASE_COLORS_LINEAR: ReadonlyArray<readonly [number, number, number]> =
  PHASE_COLORS.map((hex) => { const c = new Color(hex); return [c.r, c.g, c.b] as const; });
const ITERATE_Z = 0.03;
const ITERATE_POINT_PIXEL_SIZE = 8;
const ITERATE_POINTS_RENDER_ORDER = RENDER_ORDER.iteratePoints;

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
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export function IteratePointsLayer() {
  const { pts, matPlain, matColored } = useMemo(() => {
    const shared = {
      size: ITERATE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    };
    const matPlain   = new PointsMaterial({ ...shared, color: ITERATE_POINT_COLOR, vertexColors: false });
    const matColored = new PointsMaterial({ ...shared, color: "#ffffff",           vertexColors: true  });
    const pts = new Points(makePointsGeo(), matPlain);
    pts.renderOrder = ITERATE_POINTS_RENDER_ORDER;
    pts.frustumCulled = false;
    pts.visible = false;
    return { pts, matPlain, matColored };
  }, []);

  const prevRef = useRef<PrevState | null>(null);

  useFrame(() => {
    const raw = getState();
    const snap = getViewportRenderSnapshot();

    const p = prevRef.current;
    if (
      p &&
      p.iteratePath           === raw.iteratePath &&
      p.iteratePhases         === raw.iteratePhases &&
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
      iteratePhases: raw.iteratePhases,
      iterateObjectiveVector: raw.iterateObjectiveVector,
      zScale: raw.zScale,
      zAxisOffsetOnly: raw.zAxisOffsetOnly,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    if (raw.iteratePath.length === 0 || !shouldRenderSnapshotMode(snap.mode, raw)) {
      pts.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const hasPhases =
      raw.iteratePhases.length === raw.iteratePath.length && raw.iteratePhases.length > 0;

    const positions = new Float32Array(raw.iteratePath.length * 3);
    const colors = hasPhases ? new Float32Array(raw.iteratePath.length * 3) : null;

    for (let i = 0; i < raw.iteratePath.length; i++) {
      const entry = raw.iteratePath[i]!;
      positions[i * 3]     = entry[0]!;
      positions[i * 3 + 1] = entry[1]!;
      positions[i * 3 + 2] = is3D
        ? (getDisplayedIterateZ(entry, raw.iterateObjectiveVector, raw.zAxisOffsetOnly) * raw.zScale) / 100 + ITERATE_Z
        : ITERATE_Z;

      if (colors) {
        const isLastPoint = i === raw.iteratePath.length - 1;
        const phase = isLastPoint ? raw.iteratePhases[i]! : raw.iteratePhases[i + 1]!;
        const rgb = PHASE_COLORS_LINEAR[phase % PHASE_COLORS_LINEAR.length]!;
        colors[i * 3]     = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      }
    }

    pts.geometry.setAttribute("position", new BufferAttribute(positions, 3));
    if (colors) {
      pts.geometry.setAttribute("color", new BufferAttribute(colors, 3));
      pts.material = matColored;
    } else {
      pts.material = matPlain;
    }
    pts.visible = true;
  });

  useEffect(() => {
    return () => {
      matPlain.dispose();
      matColored.dispose();
      pts.geometry.dispose();
    };
  }, [pts, matPlain, matColored]);

  return <primitive object={pts} />;
}
