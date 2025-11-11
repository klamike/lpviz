import { BufferGeometry, Float32BufferAttribute, Points } from "three";
import { getSolverState } from "../../../state/state";
import {
  COLORS,
  ITERATE_LINE_THICKNESS,
  ITERATE_POINT_PIXEL_SIZE,
  ITERATE_Z_OFFSET,
  RENDER_LAYERS,
} from "../constants";
import { CanvasLayerRenderer, CanvasRenderContext } from "../types";

export class IterateRenderer implements CanvasLayerRenderer {
  render(context: CanvasRenderContext): void {
    const { helpers, groups } = context;
    helpers.clearGroup(groups.iterate);
    helpers.clearGroup(groups.overlay);

    const solver = getSolverState();
    if (!solver.iteratePath || solver.iteratePath.length === 0) {
      return;
    }

    const positions = helpers.buildPositionArray(solver.iteratePath, ITERATE_Z_OFFSET);
    const iterateLine = helpers.createThickLine(Array.from(positions), {
      color: COLORS.iteratePath,
      width: ITERATE_LINE_THICKNESS,
      depthTest: false,
      depthWrite: false,
    });
    iterateLine.renderOrder = RENDER_LAYERS.iterateLine;
    groups.iterate.add(iterateLine);

    const pointsGeometry = new BufferGeometry();
    pointsGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const material = helpers.getPointMaterial({
      color: COLORS.iteratePath,
      size: ITERATE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      depthWrite: false,
      depthTest: false,
      transparent: false,
      opacity: 1,
      alphaTest: 0.2,
    });
    const iteratePoints = new Points(pointsGeometry, material);
    iteratePoints.renderOrder = RENDER_LAYERS.iteratePoints;
    groups.iterate.add(iteratePoints);

    if (
      solver.highlightIteratePathIndex !== null &&
      solver.highlightIteratePathIndex < solver.iteratePath.length
    ) {
      const highlightPos = helpers.buildPositionVector(
        solver.iteratePath[solver.highlightIteratePathIndex],
        ITERATE_Z_OFFSET
      );
      const highlightSize = helpers.getWorldSizeFromPixels(
        ITERATE_POINT_PIXEL_SIZE * 1.3,
        highlightPos
      );
      const highlightSprite = helpers.createCircleSprite(
        highlightPos,
        COLORS.iterateHighlight,
        highlightSize
      );
      highlightSprite.renderOrder = RENDER_LAYERS.iterateHighlight;
      groups.iterate.add(highlightSprite);
    }

    const lastPos = helpers.buildPositionVector(
      solver.iteratePath[solver.iteratePath.length - 1],
      ITERATE_Z_OFFSET
    );
    const star = helpers.createStarSprite(lastPos, COLORS.iterateHighlight);
    groups.overlay.add(star);
  }
}
