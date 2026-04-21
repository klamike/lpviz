import { useMemo } from "react";

import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
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

function getQuantizedGridBounds(
  snapshot: ReturnType<typeof useViewportRenderSnapshot>,
): GridBounds {
  if (snapshot.mode === "2d") {
    const halfWidth =
      (snapshot.orthographic.right - snapshot.orthographic.left) / 2;
    const halfHeight =
      (snapshot.orthographic.top - snapshot.orthographic.bottom) / 2;
    const marginUnits = GRID_MARGIN_PX * snapshot.unitsPerPixel;
    return {
      minX: Math.floor(
        snapshot.target.x - halfWidth - marginUnits - GRID_OVERDRAW_UNITS,
      ),
      maxX: Math.ceil(
        snapshot.target.x + halfWidth + marginUnits + GRID_OVERDRAW_UNITS,
      ),
      minY: Math.floor(
        snapshot.target.y - halfHeight - marginUnits - GRID_OVERDRAW_UNITS,
      ),
      maxY: Math.ceil(
        snapshot.target.y + halfHeight + marginUnits + GRID_OVERDRAW_UNITS,
      ),
    };
  }

  const extent = Math.ceil(Math.max(200, 200 / snapshot.scaleFactor));
  return { minX: -extent, maxX: extent, minY: -extent, maxY: extent };
}

function buildGridGeometry(bounds: GridBounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const grid: number[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    grid.push(x, minY, 0, x, maxY, 0);
  }
  for (let y = minY; y <= maxY; y += 1) {
    grid.push(minX, y, 0, maxX, y, 0);
  }

  return {
    grid: new Float32Array(grid),
    axes: new Float32Array([0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0]),
  };
}

export function GridLayer() {
  const snapshot = useViewportRenderSnapshot();
  const bounds = getQuantizedGridBounds(snapshot);
  const geometry = useMemo(
    () => buildGridGeometry(bounds),
    [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
  );

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
