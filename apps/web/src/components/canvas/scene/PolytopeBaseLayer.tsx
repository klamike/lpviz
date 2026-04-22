import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import { getCurrentMouse } from "@/features/core/currentMouse";
import { getState } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { getViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { Line, PointXY } from "@lpviz/math/blas";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";
import { VRep } from "@lpviz/polytope/polygon";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { applyHugeBounds, getSharedLineMaterial } from "./sharedLineMaterials";

const POLYTOPE_FILL_COLOR = "#e6e6e6";
const POLYTOPE_HIGHLIGHT_COLOR = "#ff0000";
const POLYTOPE_OUTLINE_COLOR = "#000000";
const FILL_Z = 0.001;
const EDGE_Z = 0.002;
const POLY_LINE_THICKNESS = 2;
const CLIP_MARGIN_PX = 50;
const CLIP_MARGIN_UNITS = 50;
const DEFAULT_UNBOUNDED_EXTENT = 5000;
const EPS = 1e-10;

// ─── Shared line materials ────────────────────────────────────────────────────
const normalMat2D = getSharedLineMaterial({ color: POLYTOPE_OUTLINE_COLOR, linewidth: POLY_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 });
const normalMat3D = getSharedLineMaterial({ color: POLYTOPE_OUTLINE_COLOR, linewidth: POLY_LINE_THICKNESS, depthTest: true, depthWrite: true, opacity: 1 });
const highlightMat2D = getSharedLineMaterial({ color: POLYTOPE_HIGHLIGHT_COLOR, linewidth: POLY_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 });
const highlightMat3D = getSharedLineMaterial({ color: POLYTOPE_HIGHLIGHT_COLOR, linewidth: POLY_LINE_THICKNESS, depthTest: true, depthWrite: true, opacity: 1 });

// ─── Geometry helpers ─────────────────────────────────────────────────────────

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

function buildShapeFromVertices(vertices: ReadonlyArray<PointXY>) {
  const shape = new Shape();
  if (vertices.length === 0) return shape;
  shape.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) shape.lineTo(vertices[i].x, vertices[i].y);
  shape.closePath();
  return shape;
}

function clipPolygonToHalfPlane(polygon: PointXY[], line: Line): PointXY[] {
  if (polygon.length === 0) return [];
  const [A, B, C] = line;
  const inside = (p: PointXY) => A * p.x + B * p.y <= C + EPS;
  const intersect = (s: PointXY, e: PointXY): PointXY => {
    const dx = e.x - s.x, dy = e.y - s.y;
    const denom = A * dx + B * dy;
    if (Math.abs(denom) < EPS) return e;
    const t = (C - A * s.x - B * s.y) / denom;
    return { x: s.x + t * dx, y: s.y + t * dy };
  };
  const result: PointXY[] = [];
  let prev = polygon[polygon.length - 1], prevIn = inside(prev);
  for (const cur of polygon) {
    const curIn = inside(cur);
    if (curIn) { if (!prevIn) result.push(intersect(prev, cur)); result.push(cur); }
    else if (prevIn) result.push(intersect(prev, cur));
    prev = cur; prevIn = curIn;
  }
  return result;
}

function clipRegionToBounds(lines: Line[], bounds: Bounds): PointXY[] {
  let polygon: PointXY[] = [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
  ];
  for (const line of lines) {
    polygon = clipPolygonToHalfPlane(polygon, line);
    if (polygon.length === 0) return [];
  }
  return polygon;
}

function clipRayToBounds(
  start: PointXY, direction: PointXY, bounds: Bounds,
): [PointXY, PointXY] | null {
  const candidates: Array<{ t: number; point: PointXY }> = [];
  if (Math.abs(direction.x) > EPS) {
    for (const x of [bounds.minX, bounds.maxX]) {
      const t = (x - start.x) / direction.x;
      if (t <= EPS) continue;
      const y = start.y + t * direction.y;
      if (y >= bounds.minY - EPS && y <= bounds.maxY + EPS) candidates.push({ t, point: { x, y } });
    }
  }
  if (Math.abs(direction.y) > EPS) {
    for (const y of [bounds.minY, bounds.maxY]) {
      const t = (y - start.y) / direction.y;
      if (t <= EPS) continue;
      const x = start.x + t * direction.x;
      if (x >= bounds.minX - EPS && x <= bounds.maxX + EPS) candidates.push({ t, point: { x, y } });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.t - a.t);
  return [start, candidates[0].point];
}

function getVisibleBounds(snap: ReturnType<typeof getViewportRenderSnapshot>): Bounds {
  if (snap.mode !== "2d") {
    return { minX: -DEFAULT_UNBOUNDED_EXTENT, maxX: DEFAULT_UNBOUNDED_EXTENT, minY: -DEFAULT_UNBOUNDED_EXTENT, maxY: DEFAULT_UNBOUNDED_EXTENT };
  }
  const hw = (snap.orthographic.right - snap.orthographic.left) / 2;
  const hh = (snap.orthographic.top - snap.orthographic.bottom) / 2;
  const margin = CLIP_MARGIN_PX * snap.unitsPerPixel + CLIP_MARGIN_UNITS;
  return {
    minX: snap.target.x - hw - margin, maxX: snap.target.x + hw + margin,
    minY: snap.target.y - hh - margin, maxY: snap.target.y + hh + margin,
  };
}

function getDisplayedObjectiveZ(x: number, y: number, ov: PointXY | null, zAxisOffsetOnly: boolean) {
  const val = ov ? ov.x * x + ov.y * y : 0;
  return zAxisOffsetOnly ? 0 : val;
}

function getRenderZ(
  x: number, y: number,
  ov: PointXY | null, zScale: number, zAxisOffsetOnly: boolean,
  is3D: boolean, offset: number,
) {
  if (!is3D) return offset;
  return (getDisplayedObjectiveZ(x, y, ov, zAxisOffsetOnly) * zScale) / 100 + offset;
}

type PolytopeRenderResult = {
  fillVertices: PointXY[];
  isNonconvex: boolean;
  normalSegments: number[];
  highlightSegments: number[];
  mode: ReturnType<typeof getViewportRenderSnapshot>["mode"];
};

function buildPolytopeGeometry(
  state: State,
  snap: ReturnType<typeof getViewportRenderSnapshot>,
): PolytopeRenderResult | null {
  if (state.vertices.length === 0 || !shouldRenderSnapshotMode(snap.mode, state)) return null;

  const { vertices, completionMode, highlightIndex, polytope } = state;
  const regionFinished = completionMode !== "draft";
  const hasDerived = completionMode === "open" && polytope?.kind === "bounded" && polytope.vertices.length >= 3;
  const displayVertices: PointXY[] = hasDerived && polytope?.kind === "bounded"
    ? polytope.vertices.map(([x, y]) => ({ x, y }))
    : vertices;
  const isClosedRegion = completionMode === "closed" || hasDerived;
  const isNonconvex = !VRep.fromPoints(displayVertices).isConvex();
  const is3D = snap.mode === "3d";
  const { objectiveVector: ov, zScale, zAxisOffsetOnly } = state;

  const bounds: Bounds =
    completionMode === "open" && !hasDerived && polytope?.kind === "unbounded"
      ? { minX: -DEFAULT_UNBOUNDED_EXTENT, maxX: DEFAULT_UNBOUNDED_EXTENT, minY: -DEFAULT_UNBOUNDED_EXTENT, maxY: DEFAULT_UNBOUNDED_EXTENT }
      : getVisibleBounds(snap);

  const fillVertices: PointXY[] =
    isClosedRegion && displayVertices.length >= 3
      ? displayVertices
      : completionMode === "open" && polytope?.kind === "unbounded" && hasPolytopeLines(polytope)
        ? clipRegionToBounds(polytope.lines, bounds)
        : [];

  const normalSegments: number[] = [];
  const highlightSegments: number[] = [];

  const edgeCount = regionFinished
    ? Math.max(0, displayVertices.length - (isClosedRegion ? 0 : 1))
    : Math.max(0, displayVertices.length - 1);
  for (let i = 0; i < edgeCount; i++) {
    const ni = (i + 1) % displayVertices.length;
    if (!isClosedRegion && ni >= displayVertices.length) break;
    const s = displayVertices[i]!;
    const e = displayVertices[ni]!;
    const highlighted = !hasDerived && highlightIndex === i;
    const arr = highlighted ? highlightSegments : normalSegments;
    arr.push(
      s.x, s.y, getRenderZ(s.x, s.y, ov, zScale, zAxisOffsetOnly, is3D, EDGE_Z),
      e.x, e.y, getRenderZ(e.x, e.y, ov, zScale, zAxisOffsetOnly, is3D, EDGE_Z),
    );
  }

  if (completionMode === "open" && !hasDerived && polytope?.boundaryRays) {
    for (const ray of polytope.boundaryRays) {
      const clipped = clipRayToBounds(
        { x: ray.start[0], y: ray.start[1] },
        { x: ray.direction[0], y: ray.direction[1] },
        bounds,
      );
      if (!clipped) continue;
      const [s, e] = clipped;
      normalSegments.push(
        s.x, s.y, getRenderZ(s.x, s.y, ov, zScale, zAxisOffsetOnly, is3D, EDGE_Z),
        e.x, e.y, getRenderZ(e.x, e.y, ov, zScale, zAxisOffsetOnly, is3D, EDGE_Z),
      );
    }
  }

  return { fillVertices, isNonconvex, normalSegments, highlightSegments, mode: snap.mode };
}

function applySegmentsGeometry(geo: LineSegmentsGeometry, segments: number[]) {
  if (segments.length < 6) return false;
  geo.setPositions(segments);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (geo as any)._maxInstanceCount;
  return true;
}

// ─── PolytopeBaseLayer ────────────────────────────────────────────────────────

type PrevState = {
  vertices: State["vertices"];
  completionMode: State["completionMode"];
  highlightIndex: State["highlightIndex"];
  polytope: State["polytope"];
  objectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  orthoL: number; orthoR: number; orthoT: number; orthoB: number;
  unitsPerPixel: number;
  targetX: number; targetY: number;
  mode: string;
};

export function PolytopeBaseLayer() {
  const { group, fillMesh, fillMatNormal, fillMatHighlight, normalEdgesGeo, normalEdges, highlightEdgesGeo, highlightEdges } = useMemo(() => {
    const fMatN = new MeshBasicMaterial({ color: POLYTOPE_FILL_COLOR, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const fMatH = new MeshBasicMaterial({ color: POLYTOPE_HIGHLIGHT_COLOR, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new Mesh(undefined, fMatN);
    mesh.renderOrder = RENDER_ORDER.polytopeFill;
    mesh.frustumCulled = false;
    mesh.visible = false;

    const nGeo = new LineSegmentsGeometry();
    applyHugeBounds(nGeo);
    const nEdges = new LineSegments2(nGeo, normalMat2D);
    nEdges.frustumCulled = false;
    nEdges.renderOrder = RENDER_ORDER.polyEdges;
    nEdges.computeLineDistances = () => nEdges;
    nEdges.visible = false;

    const hGeo = new LineSegmentsGeometry();
    applyHugeBounds(hGeo);
    const hEdges = new LineSegments2(hGeo, highlightMat2D);
    hEdges.frustumCulled = false;
    hEdges.renderOrder = RENDER_ORDER.polyEdges;
    hEdges.computeLineDistances = () => hEdges;
    hEdges.visible = false;

    const g = new Group();
    g.add(mesh, nEdges, hEdges);
    return { group: g, fillMesh: mesh, fillMatNormal: fMatN, fillMatHighlight: fMatH, normalEdgesGeo: nGeo, normalEdges: nEdges, highlightEdgesGeo: hGeo, highlightEdges: hEdges };
  }, []);

  const prevRef = useRef<PrevState | null>(null);
  const prevFillGeoRef = useRef<ShapeGeometry | null>(null);

  useFrame(() => {
    const raw = getState();
    const snap = getViewportRenderSnapshot();

    const visible = raw.vertices.length > 0 && shouldRenderSnapshotMode(snap.mode, raw);
    group.visible = visible;
    if (!visible) return;

    const p = prevRef.current;
    const is3D = snap.mode === "3d";
    const changed = !p ||
      p.vertices !== raw.vertices ||
      p.completionMode !== raw.completionMode ||
      p.highlightIndex !== raw.highlightIndex ||
      p.polytope !== raw.polytope ||
      p.objectiveVector !== raw.objectiveVector ||
      p.zScale !== raw.zScale ||
      p.zAxisOffsetOnly !== raw.zAxisOffsetOnly ||
      p.is3DMode !== raw.is3DMode ||
      p.isTransitioning3D !== raw.isTransitioning3D ||
      p.mode !== snap.mode ||
      p.orthoL !== snap.orthographic.left ||
      p.orthoR !== snap.orthographic.right ||
      p.orthoT !== snap.orthographic.top ||
      p.orthoB !== snap.orthographic.bottom ||
      p.unitsPerPixel !== snap.unitsPerPixel ||
      p.targetX !== snap.target.x ||
      p.targetY !== snap.target.y;

    // Always keep material in sync with current mode even on no-change frames
    normalEdges.material = is3D ? normalMat3D : normalMat2D;
    highlightEdges.material = is3D ? highlightMat3D : highlightMat2D;
    fillMesh.position.set(0, 0, is3D ? 0 : FILL_Z);

    if (!changed) return;

    prevRef.current = {
      vertices: raw.vertices, completionMode: raw.completionMode,
      highlightIndex: raw.highlightIndex, polytope: raw.polytope,
      objectiveVector: raw.objectiveVector, zScale: raw.zScale,
      zAxisOffsetOnly: raw.zAxisOffsetOnly, is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D, mode: snap.mode,
      orthoL: snap.orthographic.left, orthoR: snap.orthographic.right,
      orthoT: snap.orthographic.top, orthoB: snap.orthographic.bottom,
      unitsPerPixel: snap.unitsPerPixel, targetX: snap.target.x, targetY: snap.target.y,
    };

    const result = buildPolytopeGeometry(raw, snap);

    if (!result) {
      group.visible = false;
      return;
    }

    // Fill mesh
    if (result.fillVertices.length >= 3) {
      const newFillGeo = new ShapeGeometry(buildShapeFromVertices(result.fillVertices));
      if (is3D) {
        const pos = newFillGeo.getAttribute("position") as Float32BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          pos.setZ(i, getRenderZ(pos.getX(i), pos.getY(i), raw.objectiveVector, raw.zScale, raw.zAxisOffsetOnly, true, 0));
        }
        pos.needsUpdate = true;
        newFillGeo.computeBoundingBox();
        newFillGeo.computeBoundingSphere();
      }
      if (prevFillGeoRef.current) prevFillGeoRef.current.dispose();
      prevFillGeoRef.current = newFillGeo;
      fillMesh.geometry = newFillGeo;
      fillMesh.material = result.isNonconvex ? fillMatHighlight : fillMatNormal;
      fillMesh.visible = true;
    } else {
      fillMesh.visible = false;
    }

    // Normal edges
    if (result.normalSegments.length >= 6) {
      applySegmentsGeometry(normalEdgesGeo, result.normalSegments);
      normalEdges.visible = true;
    } else {
      normalEdges.visible = false;
    }

    // Highlight edges
    if (result.highlightSegments.length >= 6) {
      applySegmentsGeometry(highlightEdgesGeo, result.highlightSegments);
      highlightEdges.visible = true;
    } else {
      highlightEdges.visible = false;
    }
  });

  useEffect(() => {
    return () => {
      normalEdgesGeo.dispose();
      highlightEdgesGeo.dispose();
      fillMatNormal.dispose();
      fillMatHighlight.dispose();
      prevFillGeoRef.current?.dispose();
    };
  }, [normalEdgesGeo, highlightEdgesGeo, fillMatNormal, fillMatHighlight]);

  return <primitive object={group} />;
}

// ─── Rubber-band preview line ─────────────────────────────────────────────────
// Updates imperatively via useFrame — zero React reconciliation per mouse move.

type RubberBandState = {
  lastVertex: PointXY | null;
  objectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

function selectRubberBandState(state: State): RubberBandState {
  const isDraft = state.completionMode === "draft";
  const verts = state.vertices;
  const active = isDraft && !state.tourActive && verts.length >= 1;
  return {
    lastVertex: active ? verts[verts.length - 1]! : null,
    objectiveVector: state.objectiveVector,
    zScale: state.zScale,
    zAxisOffsetOnly: state.zAxisOffsetOnly,
    is3DMode: state.is3DMode,
    isTransitioning3D: state.isTransitioning3D,
  };
}

const RUBBER_BAND_BUF = new Float32Array(6);
const rbMat = getSharedLineMaterial({ color: POLYTOPE_OUTLINE_COLOR, linewidth: POLY_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 });

export function PolytopeRubberBandLayer() {
  const { line, geometry } = useMemo(() => {
    const geo = new LineGeometry();
    geo.setPositions([0, 0, 0, 0, 0, 0]);
    applyHugeBounds(geo);
    const ln = new Line2(geo, rbMat);
    ln.frustumCulled = false;
    ln.renderOrder = RENDER_ORDER.polyEdges;
    ln.computeLineDistances = () => ln;
    ln.visible = false;
    return { line: ln, geometry: geo };
  }, []);

  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    rbMat.resolution.set(size.width, size.height);
    invalidate();
  }, [size.width, size.height, invalidate]);

  useFrame(() => {
    const state = getState();
    const snap = getViewportRenderSnapshot();
    const rbState = selectRubberBandState(state);

    if (!rbState.lastVertex || !shouldRenderSnapshotMode(snap.mode, rbState)) {
      line.visible = false;
      return;
    }
    const mouse = getCurrentMouse();
    if (!mouse) {
      line.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const last = rbState.lastVertex;
    RUBBER_BAND_BUF[0] = last.x;
    RUBBER_BAND_BUF[1] = last.y;
    RUBBER_BAND_BUF[2] = getRenderZ(last.x, last.y, rbState.objectiveVector, rbState.zScale, rbState.zAxisOffsetOnly, is3D, EDGE_Z);
    RUBBER_BAND_BUF[3] = mouse.x;
    RUBBER_BAND_BUF[4] = mouse.y;
    RUBBER_BAND_BUF[5] = getRenderZ(mouse.x, mouse.y, rbState.objectiveVector, rbState.zScale, rbState.zAxisOffsetOnly, is3D, EDGE_Z);
    geometry.setPositions(RUBBER_BAND_BUF);
    line.visible = true;
  });

  useEffect(() => {
    return () => { geometry.dispose(); };
  }, [geometry]);

  return <primitive object={line} />;
}
