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
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";
import type { State } from "@/features/core/store";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "../helpers/renderOrder";
import { shouldRenderSnapshotMode } from "../helpers/sceneVisibility";
import { SHARED_CIRCLE_TEXTURE, SHARED_SQUARE_TEXTURE } from "../helpers/sharedTextures";

const VERTEX_COLOR = "#ff0000";
const OPEN_ANCHOR_COLOR = "#ff0000";
const VERTEX_Z = 0.004;
const VERTEX_PIXEL_SIZE = 10;
const VERTEX_RENDER_ORDER = RENDER_ORDER.polytopeVertices;

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

function getVertexZ(
  point: PointXY,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
  zScale: number,
  is3D: boolean,
): number {
  if (!is3D) return VERTEX_Z;
  const ov = objectiveVector ? objectiveVector.x * point.x + objectiveVector.y * point.y : 0;
  return ((zAxisOffsetOnly ? 0 : ov) * zScale) / 100 + VERTEX_Z;
}

function buildVertexPositions(
  displayVertices: PointXY[],
  shapeFilter: "circle" | "square",
  completionMode: State["completionMode"],
  hasDerivedClosedRegion: boolean,
  objectiveVector: PointXY | null,
  zScale: number,
  zAxisOffsetOnly: boolean,
  is3D: boolean,
): Float32Array {
  const out: number[] = [];
  for (let index = 0; index < displayVertices.length; index++) {
    const v = displayVertices[index]!;
    const isAnchor =
      completionMode === "open" &&
      !hasDerivedClosedRegion &&
      (index === 0 || index === displayVertices.length - 1);
    const isSquare = isAnchor;
    if (shapeFilter === "square" ? !isSquare : isSquare) continue;
    out.push(v.x, v.y, getVertexZ(v, objectiveVector, zAxisOffsetOnly, zScale, is3D));
  }
  return new Float32Array(out);
}

function applyPositions(pts: Points, positions: Float32Array) {
  pts.geometry.setAttribute("position", new BufferAttribute(positions, 3));
  pts.visible = positions.length > 0;
}

type PrevState = {
  vertices: State["vertices"];
  completionMode: State["completionMode"];
  polytope: State["polytope"];
  objectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
};

export class PolytopeVerticesLayer implements Layer {
  readonly object3D: Group;
  private circlePoints: Points;
  private squarePoints: Points;
  private prev: PrevState | null = null;

  constructor() {
    const circleMat = new PointsMaterial({
      color: VERTEX_COLOR,
      size: VERTEX_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_CIRCLE_TEXTURE,
      alphaTest: 0.2,
    });
    const squareMat = new PointsMaterial({
      color: OPEN_ANCHOR_COLOR,
      size: VERTEX_PIXEL_SIZE,
      sizeAttenuation: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaMap: SHARED_SQUARE_TEXTURE,
      alphaTest: 0.2,
    });
    const cPts = new Points(makePointsGeo(), circleMat);
    cPts.renderOrder = VERTEX_RENDER_ORDER;
    cPts.frustumCulled = false;
    const sPts = new Points(makePointsGeo(), squareMat);
    sPts.renderOrder = VERTEX_RENDER_ORDER;
    sPts.frustumCulled = false;
    const g = new Group();
    g.add(cPts, sPts);
    this.object3D = g;
    this.circlePoints = cPts;
    this.squarePoints = sPts;
  }

  update(ctx: SceneContext): void {
    const raw = ctx.getState();
    const snap = ctx.getSnapshot();

    const visible = raw.vertices.length > 0 && shouldRenderSnapshotMode(snap.mode, raw);
    this.object3D.visible = visible;
    if (!visible) return;

    const p = this.prev;
    if (
      p &&
      p.vertices === raw.vertices &&
      p.completionMode === raw.completionMode &&
      p.polytope === raw.polytope &&
      p.objectiveVector === raw.objectiveVector &&
      p.zScale === raw.zScale &&
      p.zAxisOffsetOnly === raw.zAxisOffsetOnly &&
      p.is3DMode === raw.is3DMode &&
      p.isTransitioning3D === raw.isTransitioning3D &&
      p.mode === snap.mode
    ) {
      return;
    }
    this.prev = {
      vertices: raw.vertices,
      completionMode: raw.completionMode,
      polytope: raw.polytope,
      objectiveVector: raw.objectiveVector,
      zScale: raw.zScale,
      zAxisOffsetOnly: raw.zAxisOffsetOnly,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
    };

    const hasDerived =
      raw.completionMode === "open" &&
      raw.polytope?.kind === "bounded" &&
      (raw.polytope.vertices?.length ?? 0) >= 3;
    const displayVertices: PointXY[] =
      hasDerived && raw.polytope?.kind === "bounded"
        ? raw.polytope.vertices.map(([x, y]) => ({ x, y }))
        : raw.vertices;
    const is3D = snap.mode === "3d";

    applyPositions(
      this.circlePoints,
      buildVertexPositions(displayVertices, "circle", raw.completionMode, hasDerived,
        raw.objectiveVector, raw.zScale, raw.zAxisOffsetOnly, is3D),
    );
    applyPositions(
      this.squarePoints,
      buildVertexPositions(displayVertices, "square", raw.completionMode, hasDerived,
        raw.objectiveVector, raw.zScale, raw.zAxisOffsetOnly, is3D),
    );
  }

  dispose(): void {
    (this.circlePoints.material as PointsMaterial).dispose();
    (this.squarePoints.material as PointsMaterial).dispose();
    this.circlePoints.geometry.dispose();
    this.squarePoints.geometry.dispose();
  }
}
