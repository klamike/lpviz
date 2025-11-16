import {
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
  Points,
  DoubleSide,
} from "three";
import { getState } from "../../state/store";
import type { PointXY } from "../../solvers/utils/blas";
import { VRep, hasPolytopeLines } from "../../solvers/utils/polytope";
import { buildArrowHeadSegments, clipLineToBounds, Bounds } from "./geometry";
import {
  COLORS,
  EDGE_Z_OFFSET,
  GRID_MARGIN,
  ITERATE_LINE_THICKNESS,
  ITERATE_POINT_PIXEL_SIZE,
  ITERATE_Z_OFFSET,
  MAX_TRACE_POINT_SPRITES,
  OBJECTIVE_Z_OFFSET,
  POLY_LINE_THICKNESS,
  RENDER_LAYERS,
  TRACE_LINE_THICKNESS,
  TRACE_POINT_PIXEL_SIZE,
  TRACE_Z_OFFSET,
  VERTEX_POINT_PIXEL_SIZE,
  VERTEX_Z_OFFSET,
} from "./constants";
import { CanvasRenderContext } from "./types";

const buildShapeFromVertices = (vertices: ReadonlyArray<PointXY>) => {
  const shape = new Shape();
  if (vertices.length === 0) return shape;
  shape.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    shape.lineTo(vertices[i].x, vertices[i].y);
  }
  shape.closePath();
  return shape;
};

export class CanvasRenderPipeline {
  render(context: CanvasRenderContext): void {
    this.renderGrid(context);
    this.renderPolytope(context);
    this.renderConstraints(context);
    this.renderObjective(context);
    this.renderTrace(context);
    this.renderIterate(context);
  }

  private renderGrid(context: CanvasRenderContext) {
    const { helpers, groups, is3D, toLogicalCoords, scaleFactor } = context;
    helpers.clearGroup(groups.grid);

    let minX: number, maxX: number, minY: number, maxY: number;
    if (is3D) {
      const extent = Math.max(200, 200 / scaleFactor);
      minX = minY = -extent;
      maxX = maxY = extent;
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
      const material = helpers.getLineBasicMaterial({
        color: COLORS.grid,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
      });
      groups.grid.add(new LineSegments(geom, material));
    }

    const axisPositions = new Float32BufferAttribute([0, minY, 0, 0, maxY, 0, minX, 0, 0, maxX, 0, 0], 3);
    const axisGeom = new BufferGeometry();
    axisGeom.setAttribute("position", axisPositions);
    const axisMaterial = helpers.getLineBasicMaterial({
      color: COLORS.axis,
      depthTest: true,
      depthWrite: false,
    });
    groups.grid.add(new LineSegments(axisGeom, axisMaterial));
  }

  private renderPolytope(context: CanvasRenderContext) {
    const { helpers, groups, is3D, skipPreviewDrawing } = context;
    helpers.clearGroup(groups.polytopeFill);
    helpers.clearGroup(groups.polytopeOutline);
    helpers.clearGroup(groups.polytopeVertices);

    const { vertices, polytopeComplete, inputMode, highlightIndex, currentMouse } = getState();
    if (vertices.length === 0) {
      return;
    }

    const vrep = VRep.fromPoints(vertices);
    const zFn = is3D
      ? (x: number, y: number) => context.scaleZValue(context.computeObjectiveValue(x, y))
      : (x: number, y: number) => context.getVertexZ(x, y);

    if (polytopeComplete && vertices.length >= 3 && inputMode !== "manual") {
      const material = new MeshBasicMaterial({
        color: COLORS.polytopeFill,
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
      if (is3D) {
        const positions: number[] = [];
        vertices.forEach((v) => positions.push(v.x, v.y, zFn(v.x, v.y)));
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
        mesh = new Mesh(new ShapeGeometry(buildShapeFromVertices(vertices)), material);
        mesh.position.z = context.getPlanarOffset(VERTEX_Z_OFFSET / 2);
      }
      mesh.renderOrder = RENDER_LAYERS.polyEdges - 1;
      groups.polytopeFill.add(mesh);
    }

    const edgeCount = polytopeComplete ? vertices.length : Math.max(0, vertices.length - 1);
    for (let i = 0; i < edgeCount; i++) {
      const nextIndex = (i + 1) % vertices.length;
      if (!polytopeComplete && nextIndex >= vertices.length) break;
      const v = vertices[i];
      const next = vertices[nextIndex];
      const z1 = zFn(v.x, v.y) + EDGE_Z_OFFSET;
      const z2 = zFn(next.x, next.y) + EDGE_Z_OFFSET;
      const positions = [v.x, v.y, z1, next.x, next.y, z2];
      const highlight = inputMode !== "manual" && highlightIndex === i;
      const edgeLine = helpers.createThickLine(positions, {
        color: highlight ? COLORS.polytopeHighlight : 0x000000,
        width: POLY_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
      });
      groups.polytopeOutline.add(edgeLine);
    }

    const vertexSizePx = VERTEX_POINT_PIXEL_SIZE;
    vertices.forEach((v) => {
      const position = new Vector3(v.x, v.y, zFn(v.x, v.y) + VERTEX_Z_OFFSET);
      const sprite = helpers.createCircleSpriteWithPixelSize(position, COLORS.vertex, vertexSizePx);
      sprite.renderOrder = RENDER_LAYERS.polytopeVertices;
      groups.polytopeVertices.add(sprite);
    });

    if (!vrep.isConvex()) {
      const geometry = new ShapeGeometry(buildShapeFromVertices(vertices));
      const material = new MeshBasicMaterial({
        color: COLORS.polytopeHighlight,
        transparent: true,
        opacity: 0.35,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      groups.polytopeOutline.add(new Mesh(geometry, material));
    }

    if (!polytopeComplete && vertices.length >= 1 && currentMouse && !skipPreviewDrawing) {
      const last = vertices[vertices.length - 1];
      const lastZ = context.getVertexZ(last.x, last.y, EDGE_Z_OFFSET);
      const previewZ = context.getVertexZ(currentMouse.x, currentMouse.y, EDGE_Z_OFFSET);
      const previewPositions = [last.x, last.y, lastZ, currentMouse.x, currentMouse.y, previewZ];
      const previewLine = helpers.createThickLine(previewPositions, {
        color: 0x000000,
        width: POLY_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
      });
      groups.polytopeOutline.add(previewLine);
    }
  }

  private renderConstraints(context: CanvasRenderContext) {
    const { helpers, groups, is3D, toLogicalCoords } = context;
    helpers.clearGroup(groups.constraint);

    const { inputMode, polytope, highlightIndex } = getState();
    if (inputMode !== "manual" || !polytope || !hasPolytopeLines(polytope)) {
      return;
    }

    const lines = polytope.lines;
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

    lines.forEach((line, index) => {
      const segment = clipLineToBounds(line, bounds);
      if (!segment) return;
      const [start, end] = segment;
      const highlighted = highlightIndex === index;
      const lineObj = helpers.createThickLine([start.x, start.y, 0, end.x, end.y, 0], {
        color: highlighted ? COLORS.polytopeHighlight : 0x646464,
        width: POLY_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
      });
      groups.constraint.add(lineObj);
    });
  }

  private renderObjective(context: CanvasRenderContext) {
    const { helpers, groups, is3D, skipPreviewDrawing } = context;
    helpers.clearGroup(groups.objective);

    const { objectiveHidden, objectiveVector, currentObjective, polytopeComplete } = getState();
    if (objectiveHidden) {
      return;
    }

    const target = objectiveVector || (polytopeComplete && currentObjective && !skipPreviewDrawing ? currentObjective : null);
    if (!target) return;

    const length = Math.hypot(target.x, target.y);
    if (length < 1e-3) return;
    const angle = Math.atan2(target.y, target.x);

    const baseZ = context.getPlanarOffset(OBJECTIVE_Z_OFFSET);
    const arrowColor = COLORS.objective;
    const shaftEnd = { x: target.x, y: target.y };
    const shaftLine = helpers.createThickLine([0, 0, baseZ, shaftEnd.x, shaftEnd.y, baseZ], {
      color: arrowColor,
      width: ITERATE_LINE_THICKNESS,
      depthTest: is3D,
      depthWrite: is3D,
      renderOrder: RENDER_LAYERS.objective,
    });
    groups.objective.add(shaftLine);

    const headLength = helpers.getWorldSizeFromPixels(16);
    const headSegments = buildArrowHeadSegments(shaftEnd, angle, headLength);
    headSegments.forEach(([x1, y1, x2, y2]) => {
      const head = helpers.createThickLine([x1, y1, baseZ, x2, y2, baseZ], {
        color: arrowColor,
        width: ITERATE_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        renderOrder: RENDER_LAYERS.objective,
      });
      groups.objective.add(head);
    });
  }

  private renderTrace(context: CanvasRenderContext) {
    const { helpers, groups, is3D } = context;
    helpers.clearGroup(groups.trace);

    const { traceEnabled, traceBuffer } = getState();
    if (!traceEnabled || !traceBuffer || traceBuffer.length === 0) {
      return;
    }

    const sampledPositions: number[] = [];
    traceBuffer.forEach((traceEntry) => {
      const path = traceEntry.path;
      if (!path || path.length === 0) return;
      const positions = helpers.buildPositionArray(path, TRACE_Z_OFFSET);
      const line = helpers.createThickLine(Array.from(positions), {
        color: COLORS.trace,
        width: TRACE_LINE_THICKNESS,
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
      const pointGeometry = new BufferGeometry();
      pointGeometry.setAttribute("position", new Float32BufferAttribute(sampledPositions, 3));
      const material = helpers.getPointMaterial({
        color: COLORS.trace,
        size: TRACE_POINT_PIXEL_SIZE,
        sizeAttenuation: false,
        depthWrite: false,
        depthTest: false,
        transparent: false,
        opacity: 1,
        alphaTest: 0.2,
      });
      const pointMesh = new Points(pointGeometry, material);
      pointMesh.renderOrder = RENDER_LAYERS.tracePoints;
      groups.trace.add(pointMesh);
    }
  }

  private renderIterate(context: CanvasRenderContext) {
    const { helpers, groups } = context;
    helpers.clearGroup(groups.iterate);
    helpers.clearGroup(groups.overlay);

    const { iteratePath, highlightIteratePathIndex } = getState();
    if (!iteratePath || iteratePath.length === 0) {
      return;
    }

    const positions = helpers.buildPositionArray(iteratePath, ITERATE_Z_OFFSET);
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

    if (highlightIteratePathIndex !== null && highlightIteratePathIndex < iteratePath.length) {
      const highlightPos = helpers.buildPositionVector(iteratePath[highlightIteratePathIndex], ITERATE_Z_OFFSET);
      const highlightSize = helpers.getWorldSizeFromPixels(ITERATE_POINT_PIXEL_SIZE * 1.3, highlightPos);
      const highlightSprite = helpers.createCircleSprite(highlightPos, COLORS.iterateHighlight, highlightSize);
      highlightSprite.renderOrder = RENDER_LAYERS.iterateHighlight;
      groups.iterate.add(highlightSprite);
    }

    const lastPos = helpers.buildPositionVector(iteratePath[iteratePath.length - 1], ITERATE_Z_OFFSET);
    const star = helpers.createStarSprite(lastPos, COLORS.iterateHighlight);
    star.renderOrder = RENDER_LAYERS.iterateStar;
    groups.overlay.add(star);
  }
}

