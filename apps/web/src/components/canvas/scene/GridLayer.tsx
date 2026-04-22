import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
} from "three";

import { getViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import { RENDER_ORDER } from "./renderOrder";

const GRID_MARGIN_PX = 100;
const GRID_OVERDRAW_UNITS = 5;
const GRID_COLOR = "#e0e0e0";
const AXIS_COLOR = "#707070";

type GridBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function getQuantizedGridBounds(snap: ReturnType<typeof getViewportRenderSnapshot>): GridBounds {
  if (snap.mode === "2d") {
    const halfWidth = (snap.orthographic.right - snap.orthographic.left) / 2;
    const halfHeight = (snap.orthographic.top - snap.orthographic.bottom) / 2;
    const marginUnits = GRID_MARGIN_PX * snap.unitsPerPixel;
    return {
      minX: Math.floor(snap.target.x - halfWidth - marginUnits - GRID_OVERDRAW_UNITS),
      maxX: Math.ceil(snap.target.x + halfWidth + marginUnits + GRID_OVERDRAW_UNITS),
      minY: Math.floor(snap.target.y - halfHeight - marginUnits - GRID_OVERDRAW_UNITS),
      maxY: Math.ceil(snap.target.y + halfHeight + marginUnits + GRID_OVERDRAW_UNITS),
    };
  }

  const extent = Math.ceil(Math.max(200, 200 / snap.scaleFactor));
  return { minX: -extent, maxX: extent, minY: -extent, maxY: extent };
}

function setLineSegmentsPositions(geo: BufferGeometry, positions: Float32Array) {
  geo.setAttribute("position", new BufferAttribute(positions, 3));
}

export function GridLayer() {
  const { group, gridGeo, axisGeo } = useMemo(() => {
    const gGeo = new BufferGeometry();
    const aGeo = new BufferGeometry();
    const gridLines = new LineSegments(gGeo, new LineBasicMaterial({ color: GRID_COLOR }));
    const axisLines = new LineSegments(aGeo, new LineBasicMaterial({ color: AXIS_COLOR }));
    gridLines.renderOrder = RENDER_ORDER.grid;
    axisLines.renderOrder = RENDER_ORDER.axis;
    gridLines.frustumCulled = false;
    axisLines.frustumCulled = false;
    const g = new Group();
    g.add(gridLines, axisLines);
    return { group: g, gridGeo: gGeo, axisGeo: aGeo };
  }, []);

  const prevBounds = useRef<GridBounds>({ minX: 0, maxX: 0, minY: 0, maxY: 0 });

  useFrame(() => {
    const snap = getViewportRenderSnapshot();
    const b = getQuantizedGridBounds(snap);
    const p = prevBounds.current;

    if (b.minX === p.minX && b.maxX === p.maxX && b.minY === p.minY && b.maxY === p.maxY) {
      return;
    }
    prevBounds.current = b;

    const { minX, maxX, minY, maxY } = b;
    const gridPositions: number[] = [];
    for (let x = minX; x <= maxX; x++) {
      gridPositions.push(x, minY, 0, x, maxY, 0);
    }
    for (let y = minY; y <= maxY; y++) {
      gridPositions.push(minX, y, 0, maxX, y, 0);
    }

    setLineSegmentsPositions(gridGeo, new Float32Array(gridPositions));
    setLineSegmentsPositions(
      axisGeo,
      new Float32Array([0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0]),
    );
  });

  useEffect(() => {
    return () => {
      gridGeo.dispose();
      axisGeo.dispose();
    };
  }, [gridGeo, axisGeo]);

  return <primitive object={group} />;
}
