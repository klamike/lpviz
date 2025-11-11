import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from "three";
import { state } from "../../../state/state";
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

    if (!state.iteratePath || state.iteratePath.length === 0) {
      return;
    }

    const positions = helpers.buildPositionArray(state.iteratePath, ITERATE_Z_OFFSET);
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
    const material = new PointsMaterial({
      color: COLORS.iteratePath,
      size: ITERATE_POINT_PIXEL_SIZE,
      sizeAttenuation: false,
      depthWrite: false,
      depthTest: false,
      transparent: false,
      opacity: 1,
      map: helpers.getCircleTexture(),
      alphaTest: 0.2,
    });
    const iteratePoints = new Points(pointsGeometry, material);
    iteratePoints.renderOrder = RENDER_LAYERS.iteratePoints;
    groups.iterate.add(iteratePoints);

    if (
      state.highlightIteratePathIndex !== null &&
      state.highlightIteratePathIndex < state.iteratePath.length
    ) {
      const highlightPos = helpers.buildPositionVector(
        state.iteratePath[state.highlightIteratePathIndex],
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
      state.iteratePath[state.iteratePath.length - 1],
      ITERATE_Z_OFFSET
    );
    const star = helpers.createStarSprite(lastPos, COLORS.iterateHighlight);
    groups.overlay.add(star);
  }
}
