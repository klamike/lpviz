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
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";
import type { State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { SHARED_CIRCLE_TEXTURE } from "../helpers/sharedTextures";

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

export class IteratePointsLayer implements Layer {
  readonly object3D: Points;
  private matPlain: PointsMaterial;
  private matColored: PointsMaterial;
  private prev: PrevState | null = null;

  constructor() {
    const shared = {
      size: ITERATE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    };
    this.matPlain = new PointsMaterial({ ...shared, color: ITERATE_POINT_COLOR, vertexColors: false });
    this.matColored = new PointsMaterial({ ...shared, color: "#ffffff", vertexColors: true });
    const pts = new Points(makePointsGeo(), this.matPlain);
    pts.renderOrder = ITERATE_POINTS_RENDER_ORDER;
    pts.frustumCulled = false;
    pts.visible = false;
    this.object3D = pts;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();

    const p = this.prev;
    if (
      p &&
      p.iteratePath === raw.iteratePath &&
      p.iteratePhases === raw.iteratePhases &&
      p.iterateObjectiveVector === raw.iterateObjectiveVector &&
      p.zScale === raw.zScale &&
      p.zAxisOffsetOnly === raw.zAxisOffsetOnly &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode
    ) {
      return;
    }
    this.prev = {
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
      this.object3D.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const hasPhases =
      raw.iteratePhases.length === raw.iteratePath.length && raw.iteratePhases.length > 0;

    const positions = new Float32Array(raw.iteratePath.length * 3);
    const colors = hasPhases ? new Float32Array(raw.iteratePath.length * 3) : null;

    for (let i = 0; i < raw.iteratePath.length; i++) {
      const entry = raw.iteratePath[i]!;
      positions[i * 3] = entry[0]!;
      positions[i * 3 + 1] = entry[1]!;
      positions[i * 3 + 2] = is3D
        ? (getDisplayedIterateZ(entry, raw.iterateObjectiveVector, raw.zAxisOffsetOnly) * raw.zScale) / 100 + ITERATE_Z
        : ITERATE_Z;

      if (colors) {
        const isLastPoint = i === raw.iteratePath.length - 1;
        const phase = isLastPoint ? raw.iteratePhases[i]! : raw.iteratePhases[i + 1]!;
        const rgb = PHASE_COLORS_LINEAR[phase % PHASE_COLORS_LINEAR.length]!;
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      }
    }

    this.object3D.geometry.setAttribute("position", new BufferAttribute(positions, 3));
    if (colors) {
      this.object3D.geometry.setAttribute("color", new BufferAttribute(colors, 3));
      this.object3D.material = this.matColored;
    } else {
      this.object3D.material = this.matPlain;
    }
    this.object3D.visible = true;
  }

  dispose(): void {
    this.matPlain.dispose();
    this.matColored.dispose();
    this.object3D.geometry.dispose();
  }
}
