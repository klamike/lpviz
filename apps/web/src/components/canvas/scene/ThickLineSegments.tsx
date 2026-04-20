/**
 * Thick line helpers backed by Three.js Line2 / LineMaterial / LineGeometry.
 *
 * Notes:
 * - `ThickLine` renders a single polyline from point-style positions
 *   `[x1,y1,z1, x2,y2,z2, ...]`.
 * - `ThickLineSegments` renders multiple independent 2-point segments from
 *   segment-style positions `[x1,y1,z1, x2,y2,z2, x3,y3,z3, x4,y4,z4, ...]`.
 *
 * The original viewport rendered polytope edges as separate `Line2` objects,
 * which is important here because the earlier `LineSegments2` wrapper only
 * showed the first segment for these outlines.
 */

import { useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import { Color } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type ThickLineSegmentsProps = {
  positions: Float32Array;
  color: string | number;
  width: number;
  renderOrder?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  transparent?: boolean;
  opacity?: number;
};

function resolveColor(color: string | number): number {
  return typeof color === "string" ? new Color(color).getHex() : color;
}

export const ThickLine = memo(function ThickLine({
  positions,
  color,
  width,
  renderOrder = 0,
  depthTest = true,
  depthWrite = true,
  transparent = true,
  opacity = 1,
}: ThickLineSegmentsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);

  const lineRef = useRef<Line2 | null>(null);
  const materialRef = useRef<LineMaterial | null>(null);
  const geometryRef = useRef<LineGeometry | null>(null);
  const lastPositionsRef = useRef<Float32Array | null>(null);

  if (!lineRef.current) {
    const geometry = new LineGeometry();
    const material = new LineMaterial({
      color: resolveColor(color),
      linewidth: width,
      depthTest,
      depthWrite,
      transparent: transparent || opacity < 1,
      opacity,
    });
    material.resolution.set(size.width, size.height);

    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = renderOrder;
    line.computeLineDistances = () => line;

    geometryRef.current = geometry;
    materialRef.current = material;
    lineRef.current = line;
  }

  const line = lineRef.current;
  const geometry = geometryRef.current!;
  const material = materialRef.current!;

  if (positions !== lastPositionsRef.current && positions.length >= 6) {
    geometry.setPositions(positions);
    geometry.attributes.instanceStart.needsUpdate = true;
    geometry.attributes.instanceEnd.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    lastPositionsRef.current = positions;
  }

  material.color.set(resolveColor(color));
  material.linewidth = width;
  material.depthTest = depthTest;
  material.depthWrite = depthWrite;
  material.transparent = transparent || opacity < 1;
  material.opacity = opacity;
  line.renderOrder = renderOrder;

  useEffect(() => {
    material.resolution.set(size.width, size.height);
    invalidate();
  }, [material, size.width, size.height, invalidate]);

  useEffect(() => {
    material.needsUpdate = true;
    invalidate();
  }, [material, depthTest, depthWrite, transparent]);

  useEffect(() => {
    invalidate();
  }, [
    positions,
    color,
    width,
    renderOrder,
    depthTest,
    depthWrite,
    transparent,
    opacity,
    invalidate,
  ]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  if (positions.length < 6) {
    return null;
  }

  return <primitive object={line} />;
});

ThickLine.displayName = "ThickLine";

export function ThickLineSegments(props: ThickLineSegmentsProps) {
  const segments = useMemo(() => {
    const result: Float32Array[] = [];
    for (let index = 0; index + 5 < props.positions.length; index += 6) {
      result.push(props.positions.slice(index, index + 6));
    }
    return result;
  }, [props.positions]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <>
      {segments.map((segment, index) => (
        <ThickLine key={index} {...props} positions={segment} />
      ))}
    </>
  );
}
