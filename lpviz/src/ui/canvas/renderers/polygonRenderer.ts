import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import { state } from "../../../state/state";
import { isPolygonConvex } from "../../../utils/math2d";
import {
  COLORS,
  EDGE_Z_OFFSET,
  POLY_LINE_THICKNESS,
  VERTEX_POINT_PIXEL_SIZE,
  VERTEX_Z_OFFSET,
  RENDER_LAYERS,
} from "../constants";
import { CanvasLayerRenderer, CanvasRenderContext } from "../types";

export class PolygonRenderer implements CanvasLayerRenderer {
  render(context: CanvasRenderContext): void {
    const { helpers, groups, is3D, skipPreviewDrawing } = context;
    const vertices = state.vertices;
    helpers.clearGroup(groups.polygonFill);
    helpers.clearGroup(groups.polygonOutline);
    helpers.clearGroup(groups.polygonVertices);

    if (vertices.length === 0) {
      return;
    }

    const useDepth = is3D;
    const zFn = useDepth
      ? (x: number, y: number) => context.scaleZValue(context.computeObjectiveValue(x, y))
      : (x: number, y: number) => context.getVertexZ(x, y);

    if (state.polygonComplete && vertices.length >= 3 && state.inputMode !== "manual") {
      const material = new MeshBasicMaterial({
        color: COLORS.polygonFill,
        transparent: true,
        opacity: 0.6,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

      let mesh: Mesh;
      if (useDepth) {
        const positions: number[] = [];
        vertices.forEach((v) => {
          const z = zFn(v.x, v.y);
          positions.push(v.x, v.y, z);
        });
        const indices: number[] = [];
        for (let i = 1; i < vertices.length - 1; i++) {
          indices.push(0, i, i + 1);
        }
        const geom = new BufferGeometry();
        geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        mesh = new Mesh(geom, material);
      } else {
        const shape = new Shape();
        shape.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          shape.lineTo(vertices[i].x, vertices[i].y);
        }
        shape.closePath();
        const geom = new ShapeGeometry(shape);
        mesh = new Mesh(geom, material);
        mesh.position.z = context.getPlanarOffset(VERTEX_Z_OFFSET / 2);
      }
      mesh.renderOrder = RENDER_LAYERS.polyEdges - 1;
      groups.polygonFill.add(mesh);
    }

    const edgeCount = state.polygonComplete ? vertices.length : Math.max(0, vertices.length - 1);
    for (let i = 0; i < edgeCount; i++) {
      const nextIndex = (i + 1) % vertices.length;
      if (!state.polygonComplete && nextIndex >= vertices.length) break;
      const v = vertices[i];
      const next = vertices[nextIndex];
      const z1 = zFn(v.x, v.y) + EDGE_Z_OFFSET;
      const z2 = zFn(next.x, next.y) + EDGE_Z_OFFSET;
      const positions = [v.x, v.y, z1, next.x, next.y, z2];
      const highlight = state.inputMode !== "manual" && state.highlightIndex === i;
      const edgeLine = helpers.createThickLine(positions, {
        color: highlight ? COLORS.polygonHighlight : 0x000000,
        width: POLY_LINE_THICKNESS,
        depthTest: useDepth,
        depthWrite: useDepth,
      });
      groups.polygonOutline.add(edgeLine);
    }

    const vertexSizePx = VERTEX_POINT_PIXEL_SIZE;
    vertices.forEach((v) => {
      const position = new Vector3(v.x, v.y, zFn(v.x, v.y) + VERTEX_Z_OFFSET);
      const sprite = helpers.createCircleSpriteWithPixelSize(position, COLORS.vertex, vertexSizePx);
      sprite.renderOrder = RENDER_LAYERS.polygonVertices;
      groups.polygonVertices.add(sprite);
    });

    if (!isPolygonConvex(vertices)) {
      const shape = new Shape();
      shape.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i].x, vertices[i].y);
      }
      shape.closePath();
      const geometry = new ShapeGeometry(shape);
      const material = new MeshBasicMaterial({
        color: COLORS.polygonHighlight,
        transparent: true,
        opacity: 0.35,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      groups.polygonOutline.add(new Mesh(geometry, material));
    }

    if (
      !state.polygonComplete &&
      vertices.length >= 1 &&
      state.currentMouse &&
      !skipPreviewDrawing
    ) {
      const last = vertices[vertices.length - 1];
      const lastZ = context.getVertexZ(last.x, last.y, EDGE_Z_OFFSET);
      const previewZ = context.getVertexZ(state.currentMouse.x, state.currentMouse.y, EDGE_Z_OFFSET);
      const previewPositions = [last.x, last.y, lastZ, state.currentMouse.x, state.currentMouse.y, previewZ];
      const previewLine = helpers.createThickLine(previewPositions, {
        color: 0x000000,
        width: POLY_LINE_THICKNESS,
        depthTest: useDepth,
        depthWrite: useDepth,
      });
      groups.polygonOutline.add(previewLine);
    }
  }
}
