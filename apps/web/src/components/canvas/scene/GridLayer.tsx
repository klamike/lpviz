import { useMemo } from "react";

import { useViewportRenderSnapshot } from "@/features/viewport/r3f/viewportRenderStore";
import { RENDER_ORDER } from "./renderOrder";

const GRID_MARGIN_PX = 100;
const GRID_OVERDRAW_UNITS = 5;
const GRID_COLOR = "#e0e0e0";
const AXIS_COLOR = "#707070";

function buildGridGeometry(
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
) {
  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;

  if (snapshot.mode === "2d") {
    const halfWidth =
      (snapshot.orthographic.right - snapshot.orthographic.left) / 2;
    const halfHeight =
      (snapshot.orthographic.top - snapshot.orthographic.bottom) / 2;
    const marginUnits = GRID_MARGIN_PX * snapshot.unitsPerPixel;
    minX = snapshot.target.x - halfWidth - marginUnits - GRID_OVERDRAW_UNITS;
    maxX = snapshot.target.x + halfWidth + marginUnits + GRID_OVERDRAW_UNITS;
    minY = snapshot.target.y - halfHeight - marginUnits - GRID_OVERDRAW_UNITS;
    maxY = snapshot.target.y + halfHeight + marginUnits + GRID_OVERDRAW_UNITS;
  } else {
    const extent = Math.max(200, 200 / snapshot.scaleFactor);
    minX = minY = -extent;
    maxX = maxY = extent;
  }

  const grid: number[] = [];
  for (let x = Math.floor(minX); x <= Math.ceil(maxX); x += 1) {
    grid.push(x, minY, 0, x, maxY, 0);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += 1) {
    grid.push(minX, y, 0, maxX, y, 0);
  }

  return {
    grid: new Float32Array(grid),
    axes: new Float32Array([0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0]),
  };
}

export function GridLayer() {
  const snapshot = useViewportRenderSnapshot();
  const geometry = useMemo(() => buildGridGeometry(snapshot), [snapshot]);

  return (
    <group>
      <lineSegments frustumCulled={false} renderOrder={RENDER_ORDER.grid}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[geometry.grid, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={GRID_COLOR} depthTest depthWrite={false} />
      </lineSegments>
      <lineSegments frustumCulled={false} renderOrder={RENDER_ORDER.axis}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[geometry.axes, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={AXIS_COLOR} depthTest depthWrite={false} />
      </lineSegments>
    </group>
  );
}
