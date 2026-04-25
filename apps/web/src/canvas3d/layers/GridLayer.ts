import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
} from "three";
import type { Layer } from "../Layer";
import type { SceneContext } from "../SceneContext";
import { RENDER_ORDER } from "../helpers/renderOrder";

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
  snap: ReturnType<SceneContext["getSnapshot"]>,
): GridBounds {
  if (snap.mode === "2d") {
    const canvasHalfWidth = (snap.orthographic.right - snap.orthographic.left) / 2;
    const halfHeight = (snap.orthographic.top - snap.orthographic.bottom) / 2;
    const sidebarUnits = snap.sidebarWidth * snap.unitsPerPixel;
    const viewportCenterX = snap.target.x + sidebarUnits / 2;
    const halfWidth = canvasHalfWidth + sidebarUnits / 2;
    const marginUnits = GRID_MARGIN_PX * snap.unitsPerPixel;
    return {
      minX: Math.floor(viewportCenterX - halfWidth - marginUnits - GRID_OVERDRAW_UNITS),
      maxX: Math.ceil(viewportCenterX + halfWidth + marginUnits + GRID_OVERDRAW_UNITS),
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

export class GridLayer implements Layer {
  readonly object3D: Group;
  private gridGeo: BufferGeometry;
  private axisGeo: BufferGeometry;
  private prevBounds: GridBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  constructor() {
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
    this.object3D = g;
    this.gridGeo = gGeo;
    this.axisGeo = aGeo;
  }

  update(ctx: SceneContext): void {
    const snap = ctx.getSnapshot();
    const b = getQuantizedGridBounds(snap);
    const p = this.prevBounds;

    if (b.minX === p.minX && b.maxX === p.maxX && b.minY === p.minY && b.maxY === p.maxY) {
      return;
    }
    this.prevBounds = b;

    const { minX, maxX, minY, maxY } = b;
    const gridPositions: number[] = [];
    for (let x = minX; x <= maxX; x++) {
      gridPositions.push(x, minY, 0, x, maxY, 0);
    }
    for (let y = minY; y <= maxY; y++) {
      gridPositions.push(minX, y, 0, maxX, y, 0);
    }

    setLineSegmentsPositions(this.gridGeo, new Float32Array(gridPositions));
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
