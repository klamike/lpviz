import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from "three";
import { state } from "../../../state/state";
import {
  COLORS,
  MAX_TRACE_POINT_SPRITES,
  TRACE_LINE_THICKNESS,
  TRACE_OPACITY,
  TRACE_POINT_PIXEL_SIZE,
  TRACE_Z_OFFSET,
  RENDER_LAYERS,
} from "../constants";
import { CanvasLayerRenderer, CanvasRenderContext } from "../types";

export class TraceRenderer implements CanvasLayerRenderer {
  render(context: CanvasRenderContext): void {
    const { helpers, groups, is3D } = context;
    helpers.clearGroup(groups.trace);

    if (!state.traceEnabled || !state.traceBuffer || state.traceBuffer.length === 0) {
      return;
    }

    const pointSize = TRACE_POINT_PIXEL_SIZE;
    const pointGeometry = new BufferGeometry();
    const sampledPositions: number[] = [];
    state.traceBuffer.forEach((traceEntry) => {
      const path = traceEntry.path;
      if (!path || path.length === 0) return;
      const positions = helpers.buildPositionArray(path, TRACE_Z_OFFSET);
      const line = helpers.createThickLine(Array.from(positions), {
        color: COLORS.trace,
        width: TRACE_LINE_THICKNESS,
        opacity: TRACE_OPACITY,
        depthTest: is3D,
        depthWrite: is3D,
      });
      line.renderOrder = RENDER_LAYERS.traceLine;
      groups.trace.add(line);

      const step = Math.max(1, Math.ceil(path.length / MAX_TRACE_POINT_SPRITES));
      for (let i = 0; i < path.length; i += step) {
        const vec = helpers.buildPositionVector(path[i], TRACE_Z_OFFSET);
        sampledPositions.push(vec.x, vec.y, vec.z);
      }
      const lastIdx = path.length - 1;
      if (lastIdx % step !== 0) {
        const vec = helpers.buildPositionVector(path[lastIdx], TRACE_Z_OFFSET);
        sampledPositions.push(vec.x, vec.y, vec.z);
      }
    });

    if (sampledPositions.length) {
      pointGeometry.setAttribute("position", new Float32BufferAttribute(sampledPositions, 3));
      const material = new PointsMaterial({
        color: COLORS.trace,
        size: pointSize,
        sizeAttenuation: false,
        depthWrite: false,
        depthTest: false,
        transparent: false,
        opacity: 1,
        map: helpers.getCircleTexture(),
        alphaTest: 0.2,
      });
      const pointMesh = new Points(pointGeometry, material);
      pointMesh.renderOrder = RENDER_LAYERS.tracePoints;
      groups.trace.add(pointMesh);
    }
  }
}
