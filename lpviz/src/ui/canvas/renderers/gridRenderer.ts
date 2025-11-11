import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from "three";
import { COLORS, GRID_MARGIN } from "../constants";
import { CanvasLayerRenderer, CanvasRenderContext } from "../types";

export class GridRenderer implements CanvasLayerRenderer {
  render(context: CanvasRenderContext): void {
    const { helpers, groups, is3D, toLogicalCoords, scaleFactor } = context;
    helpers.clearGroup(groups.grid);

    let minX: number;
    let maxX: number;
    let minY: number;
    let maxY: number;

    if (is3D) {
      const extent = Math.max(200, 200 / scaleFactor);
      minX = -extent;
      maxX = extent;
      minY = -extent;
      maxY = extent;
    } else {
      const tl = toLogicalCoords(-GRID_MARGIN, -GRID_MARGIN);
      const br = toLogicalCoords(window.innerWidth + GRID_MARGIN, window.innerHeight + GRID_MARGIN);
      minX = Math.min(tl.x, br.x) - 5;
      maxX = Math.max(tl.x, br.x) + 5;
      minY = Math.min(tl.y, br.y) - 5;
      maxY = Math.max(tl.y, br.y) + 5;
    }

    const gridPositions: number[] = [];
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      gridPositions.push(x, minY, 0, x, maxY, 0);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      gridPositions.push(minX, y, 0, maxX, y, 0);
    }

    if (gridPositions.length) {
      const geom = new BufferGeometry();
      geom.setAttribute("position", new Float32BufferAttribute(gridPositions, 3));
      const material = new LineBasicMaterial({
        color: COLORS.grid,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
      });
      groups.grid.add(new LineSegments(geom, material));
    }

    const axisPositions = new Float32Array([0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0]);
    const axisGeom = new BufferGeometry();
    axisGeom.setAttribute("position", new Float32BufferAttribute(axisPositions, 3));
    const axisMaterial = new LineBasicMaterial({
      color: COLORS.axis,
      depthTest: true,
      depthWrite: false,
    });
    groups.grid.add(new LineSegments(axisGeom, axisMaterial));
  }
}
