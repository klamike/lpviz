import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
} from "three";
import { RENDER_ORDER } from "../helpers/renderOrder";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";

const GRID_MARGIN_PX = 100;
const GRID_OVERDRAW_UNITS = 5;
const GRID_3D_EXTENT = 200;
const GRID_COLOR = "#e0e0e0";
const AXIS_COLOR = "#707070";

type GridBounds = { minX: number; maxX: number; minY: number; maxY: number };

function setLineSegmentsPositions(
  geo: BufferGeometry,
  positions: Float32Array,
) {
  geo.setAttribute("position", new BufferAttribute(positions, 3));
}

function buildGridPositions({ minX, maxX, minY, maxY }: GridBounds) {
  const xLineCount = maxX - minX + 1;
  const yLineCount = maxY - minY + 1;
  const positions = new Float32Array((xLineCount + yLineCount) * 6);
  let offset = 0;

  for (let x = minX; x <= maxX; x++) {
    positions[offset++] = x;
    positions[offset++] = minY;
    positions[offset++] = 0;
    positions[offset++] = x;
    positions[offset++] = maxY;
    positions[offset++] = 0;
  }

  for (let y = minY; y <= maxY; y++) {
    positions[offset++] = minX;
    positions[offset++] = y;
    positions[offset++] = 0;
    positions[offset++] = maxX;
    positions[offset++] = y;
    positions[offset++] = 0;
  }

  return positions;
}

function getGridBounds(snap: ReturnType<SceneContext["getSnapshot"]>) {
  if (snap.mode !== "2d") {
    const extent = Math.ceil(
      Math.max(GRID_3D_EXTENT, GRID_3D_EXTENT / snap.scaleFactor),
    );
    return { minX: -extent, maxX: extent, minY: -extent, maxY: extent };
  }

  const halfWidth = (snap.orthographic.right - snap.orthographic.left) / 2;
  const halfHeight = (snap.orthographic.top - snap.orthographic.bottom) / 2;
  const marginUnits = GRID_MARGIN_PX * snap.unitsPerPixel;
  return {
    minX: Math.floor(
      snap.target.x - halfWidth - marginUnits - GRID_OVERDRAW_UNITS,
    ),
    maxX: Math.ceil(
      snap.target.x + halfWidth + marginUnits + GRID_OVERDRAW_UNITS,
    ),
    minY: Math.floor(
      snap.target.y - halfHeight - marginUnits - GRID_OVERDRAW_UNITS,
    ),
    maxY: Math.ceil(
      snap.target.y + halfHeight + marginUnits + GRID_OVERDRAW_UNITS,
    ),
  };
}

export class GridLayer implements Layer {
  readonly object3D: Group;
  readonly renderPass = "background" as const;
  readonly invalidationKeys = ["grid"] as const;
  private gridGeo: BufferGeometry;
  private axisGeo: BufferGeometry;
  private prevBounds: GridBounds | null = null;

  constructor() {
    const gGeo = new BufferGeometry();
    const aGeo = new BufferGeometry();
    const gridLines = new LineSegments(
      gGeo,
      new LineBasicMaterial({ color: GRID_COLOR, depthWrite: false }),
    );
    const axisLines = new LineSegments(
      aGeo,
      new LineBasicMaterial({ color: AXIS_COLOR, depthWrite: false }),
    );
    gridLines.renderOrder = RENDER_ORDER.grid;
    axisLines.renderOrder = RENDER_ORDER.axis;
    gridLines.frustumCulled = false;
    axisLines.frustumCulled = false;
    const g = new Group();
    g.add(gridLines, axisLines);
    this.object3D = g;
    this.gridGeo = gGeo;
    this.axisGeo = aGeo;
  }

  update(ctx: SceneContext): void {
    const bounds = getGridBounds(ctx.getSnapshot());
    const prev = this.prevBounds;
    if (
      prev &&
      prev.minX === bounds.minX &&
      prev.maxX === bounds.maxX &&
      prev.minY === bounds.minY &&
      prev.maxY === bounds.maxY
    ) {
      return;
    }
    this.prevBounds = bounds;

    const { minX, maxX, minY, maxY } = bounds;
    setLineSegmentsPositions(this.gridGeo, buildGridPositions(bounds));
    setLineSegmentsPositions(
      this.axisGeo,
      new Float32Array([0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0]),
    );
  }

  dispose(): void {
    this.gridGeo.dispose();
    this.axisGeo.dispose();
  }
}
