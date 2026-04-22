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
import { memo, useEffect, useLayoutEffect, useMemo } from "react";
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

  // Create imperative three.js objects once inside useMemo so they are
  // never re-created during React's render phase (avoids leaks in StrictMode
  // or concurrent renders).
  const { line, geometry, material } = useMemo(() => {
    const geo = new LineGeometry();
    const mat = new LineMaterial({
      color,
      linewidth: width,
      depthTest,
      depthWrite,
      transparent: transparent || opacity < 1,
      opacity,
    });
    mat.resolution.set(size.width, size.height);

    const ln = new Line2(geo, mat);
    ln.frustumCulled = false;
    ln.renderOrder = renderOrder;
    // Suppress the computeLineDistances call that Line2 normally does on
    // every frame; we don't use dashed lines so it is unnecessary overhead.
    ln.computeLineDistances = () => ln;

    return { line: ln, geometry: geo, material: mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep geometry positions in sync.
  useLayoutEffect(() => {
    if (positions.length >= 6) {
      geometry.setPositions(positions);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
  }, [geometry, positions]);

  // Keep material properties in sync.
  useLayoutEffect(() => {
    material.color.set(color);
    material.linewidth = width;
    material.depthTest = depthTest;
    material.depthWrite = depthWrite;
    material.transparent = transparent || opacity < 1;
    material.opacity = opacity;
    material.needsUpdate = true;
  }, [material, color, width, depthTest, depthWrite, transparent, opacity]);

  // Keep render order in sync.
  useLayoutEffect(() => {
    line.renderOrder = renderOrder;
  }, [line, renderOrder]);

  // Resolution must follow canvas size.
  useLayoutEffect(() => {
    material.resolution.set(size.width, size.height);
    invalidate();
  }, [material, size.width, size.height, invalidate]);

  // Dispose on unmount.
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

export type ThickLineSharedProps = {
  positions: Float32Array;
  material: LineMaterial;
  renderOrder?: number;
};

export const ThickLineShared = memo(function ThickLineShared({
  positions,
  material,
  renderOrder = 0,
}: ThickLineSharedProps) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);

  const { line, geometry } = useMemo(() => {
    const geo = new LineGeometry();
    const ln = new Line2(geo, material);
    ln.frustumCulled = false;
    ln.renderOrder = renderOrder;
    ln.computeLineDistances = () => ln;
    return { line: ln, geometry: geo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material]);

  useLayoutEffect(() => {
    if (positions.length >= 6) {
      geometry.setPositions(positions);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
  }, [geometry, positions]);

  useLayoutEffect(() => {
    line.renderOrder = renderOrder;
  }, [line, renderOrder]);

  useLayoutEffect(() => {
    material.resolution.set(size.width, size.height);
    invalidate();
  }, [material, size.width, size.height, invalidate]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (positions.length < 6) {
    return null;
  }

  return <primitive object={line} />;
});

ThickLineShared.displayName = "ThickLineShared";

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
