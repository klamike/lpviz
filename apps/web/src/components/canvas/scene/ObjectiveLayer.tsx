import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import { getState } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { getViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { hasPolytopeLines } from "@lpviz/polytope/polytopeTypes";
import { isObjectiveDirectionUnbounded } from "@lpviz/polytope/objectiveDirection";
import { RENDER_ORDER } from "./renderOrder";
import { shouldRenderSnapshotMode } from "./sceneVisibility";
import { applyHugeBounds, getSharedLineMaterial } from "./sharedLineMaterials";

const OBJECTIVE_COLOR = "#008000";
const OBJECTIVE_UNBOUNDED_COLOR = "#ff0000";
const OBJECTIVE_Z = 0.015;
const OBJECTIVE_RENDER_ORDER = RENDER_ORDER.objective;
const OBJECTIVE_LINE_THICKNESS = 3;
const OBJECTIVE_HEAD_LENGTH_PX = 16;
const ARROW_HALF_ANGLE = Math.PI / 6;
const OBJECTIVE_EPSILON = 1e-3;

const objMat2DGreen = getSharedLineMaterial({ color: OBJECTIVE_COLOR, linewidth: OBJECTIVE_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 });
const objMat2DRed   = getSharedLineMaterial({ color: OBJECTIVE_UNBOUNDED_COLOR, linewidth: OBJECTIVE_LINE_THICKNESS, depthTest: false, depthWrite: false, opacity: 1 });
const objMat3DGreen = getSharedLineMaterial({ color: OBJECTIVE_COLOR, linewidth: OBJECTIVE_LINE_THICKNESS, depthTest: true,  depthWrite: true,  opacity: 1 });
const objMat3DRed   = getSharedLineMaterial({ color: OBJECTIVE_UNBOUNDED_COLOR, linewidth: OBJECTIVE_LINE_THICKNESS, depthTest: true,  depthWrite: true,  opacity: 1 });

function buildArrowHeadSegments(tip: PointXY, angle: number, length: number): [number, number, number, number][] {
  return [ARROW_HALF_ANGLE, -ARROW_HALF_ANGLE].map((offset) => {
    const a = angle + offset;
    return [tip.x, tip.y, tip.x - length * Math.cos(a), tip.y - length * Math.sin(a)] as [number, number, number, number];
  });
}

type PrevState = {
  objectiveHidden: boolean;
  objectiveVector: PointXY | null;
  currentObjective: PointXY | null;
  completionMode: State["completionMode"];
  polytope: State["polytope"];
  tourActive: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
  mode: string;
  unitsPerPixel: number;
};

export function ObjectiveLayer() {
  const { group, objGeo, objSegs } = useMemo(() => {
    const objGeo = new LineSegmentsGeometry();
    applyHugeBounds(objGeo);
    const objSegs = new LineSegments2(objGeo, objMat2DGreen);
    objSegs.renderOrder = OBJECTIVE_RENDER_ORDER;
    objSegs.frustumCulled = false;
    objSegs.visible = false;
    const group = new Group();
    group.add(objSegs);
    return { group, objGeo, objSegs };
  }, []);

  const prevRef = useRef<PrevState | null>(null);

  useFrame(() => {
    const raw = getState();
    const snap = getViewportRenderSnapshot();

    const p = prevRef.current;
    if (
      p &&
      p.objectiveHidden    === raw.objectiveHidden &&
      p.objectiveVector    === raw.objectiveVector &&
      p.currentObjective   === raw.currentObjective &&
      p.completionMode     === raw.completionMode &&
      p.polytope           === raw.polytope &&
      p.tourActive         === raw.tourActive &&
      p.is3DMode           === raw.is3DMode &&
      p.isTransitioning3D  === raw.isTransitioning3D &&
      p.mode               === snap.mode &&
      p.unitsPerPixel      === snap.unitsPerPixel
    ) {
      return;
    }
    prevRef.current = {
      objectiveHidden: raw.objectiveHidden,
      objectiveVector: raw.objectiveVector,
      currentObjective: raw.currentObjective,
      completionMode: raw.completionMode,
      polytope: raw.polytope,
      tourActive: raw.tourActive,
      is3DMode: raw.is3DMode,
      isTransitioning3D: raw.isTransitioning3D,
      mode: snap.mode,
      unitsPerPixel: snap.unitsPerPixel,
    };

    if (raw.objectiveHidden || !shouldRenderSnapshotMode(snap.mode, raw)) {
      objSegs.visible = false;
      return;
    }

    const target =
      raw.objectiveVector ||
      (raw.completionMode !== "draft" && raw.currentObjective && !raw.tourActive
        ? raw.currentObjective
        : null);

    if (!target || Math.hypot(target.x, target.y) < OBJECTIVE_EPSILON) {
      objSegs.visible = false;
      return;
    }

    const is3D = snap.mode === "3d";
    const objectiveZ = is3D ? 0 : OBJECTIVE_Z;
    const headLength = OBJECTIVE_HEAD_LENGTH_PX * snap.unitsPerPixel;
    const angle = Math.atan2(target.y, target.x);

    const positions: number[] = [0, 0, objectiveZ, target.x, target.y, objectiveZ];
    for (const [x1, y1, x2, y2] of buildArrowHeadSegments(target, angle, headLength)) {
      positions.push(x1, y1, objectiveZ, x2, y2, objectiveZ);
    }

    objGeo.setPositions(positions);
    delete (objGeo as any)._maxInstanceCount;

    const isUnbounded =
      raw.polytope?.kind === "unbounded" &&
      hasPolytopeLines(raw.polytope) &&
      isObjectiveDirectionUnbounded(raw.polytope.lines, [target.x, target.y]);

    objSegs.material = is3D
      ? (isUnbounded ? objMat3DRed : objMat3DGreen)
      : (isUnbounded ? objMat2DRed : objMat2DGreen);
    objSegs.visible = true;
  });

  useEffect(() => {
    return () => { objGeo.dispose(); };
  }, [objGeo]);

  return <primitive object={group} />;
}
