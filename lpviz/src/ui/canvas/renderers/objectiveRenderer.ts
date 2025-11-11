import { getObjectiveState, getGeometryState } from "../../../state/state";
import {
  COLORS,
  ITERATE_LINE_THICKNESS,
  OBJECTIVE_Z_OFFSET,
  RENDER_LAYERS,
} from "../constants";
import { CanvasLayerRenderer, CanvasRenderContext } from "../types";
import { buildArrowHeadSegments } from "../geometry";

export class ObjectiveRenderer implements CanvasLayerRenderer {
  render(context: CanvasRenderContext): void {
    const { helpers, groups, is3D, skipPreviewDrawing } = context;
    helpers.clearGroup(groups.objective);

    const objectiveState = getObjectiveState();
    const geometry = getGeometryState();
    const target =
      objectiveState.objectiveVector ||
      (geometry.polygonComplete && objectiveState.currentObjective && !skipPreviewDrawing
        ? objectiveState.currentObjective
        : null);

    if (!target) return;

    const length = Math.hypot(target.x, target.y);
    if (length < 1e-3) return;
    const angle = Math.atan2(target.y, target.x);

    const baseZ = context.getPlanarOffset(OBJECTIVE_Z_OFFSET);
    const arrowColor = COLORS.objective;
    const shaftEnd = {
      x: target.x,
      y: target.y,
    };
    const shaftLine = helpers.createThickLine(
      [0, 0, baseZ, shaftEnd.x, shaftEnd.y, baseZ],
      {
        color: arrowColor,
        width: ITERATE_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.objective,
      }
    );
    groups.objective.add(shaftLine);

    const headLength = Math.max(helpers.getWorldSizeFromPixels(16), length * 0.25);
    const headSegments = buildArrowHeadSegments(shaftEnd, angle, headLength);
    headSegments.forEach(([x1, y1, x2, y2]) => {
      const head = helpers.createThickLine(
        [x1, y1, baseZ, x2, y2, baseZ],
        {
          color: arrowColor,
          width: ITERATE_LINE_THICKNESS,
          depthTest: is3D,
          depthWrite: is3D,
          renderOrder: RENDER_LAYERS.objective,
        }
      );
      groups.objective.add(head);
    });
  }
}
