import { state } from "../../../state/state";
import { COLORS, POLY_LINE_THICKNESS } from "../constants";
import { CanvasLayerRenderer, CanvasRenderContext } from "../types";
import { clipLineToBounds, Bounds } from "../geometry";

export class ConstraintRenderer implements CanvasLayerRenderer {
  render(context: CanvasRenderContext): void {
    const { helpers, groups, is3D, toLogicalCoords } = context;
    helpers.clearGroup(groups.constraint);

    if (state.inputMode !== "manual" || !state.computedLines || state.computedLines.length === 0) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const margin = 50;
    const topLeft = toLogicalCoords(-margin, -margin);
    const bottomRight = toLogicalCoords(width + margin, height + margin);
    const bounds: Bounds = {
      minX: Math.min(topLeft.x, bottomRight.x) - margin,
      maxX: Math.max(topLeft.x, bottomRight.x) + margin,
      minY: Math.min(topLeft.y, bottomRight.y) - margin,
      maxY: Math.max(topLeft.y, bottomRight.y) + margin,
    };

    state.computedLines.forEach((line, index) => {
      const segment = clipLineToBounds(line, bounds);
      if (!segment) return;
      const [start, end] = segment;

      const highlighted = state.highlightIndex === index;
      const lineObj = helpers.createThickLine(
        [start.x, start.y, 0, end.x, end.y, 0],
        {
          color: highlighted ? COLORS.polygonHighlight : 0x646464,
          width: POLY_LINE_THICKNESS,
          depthTest: is3D,
          depthWrite: is3D,
        }
      );
      groups.constraint.add(lineObj);
    });
  }
}
