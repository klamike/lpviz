import { BufferGeometry, Float32BufferAttribute, LineSegments, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3, Points, DoubleSide } from "three";
import { getState } from "../../state/store";
import type { PointXY } from "../../solvers/utils/blas";
import { VRep, hasPolytopeLines } from "../../solvers/utils/polytope";
import { buildArrowHeadSegments, clipLineToBounds, Bounds } from "./geometry";
import { COLORS, EDGE_Z_OFFSET, GRID_MARGIN, ITERATE_LINE_THICKNESS, ITERATE_POINT_PIXEL_SIZE, ITERATE_Z_OFFSET, OBJECTIVE_Z_OFFSET, POLY_LINE_THICKNESS, RENDER_LAYERS, TRACE_LINE_OPACITY, TRACE_LINE_THICKNESS, TRACE_POINT_PIXEL_SIZE, TRACE_Z_OFFSET, VERTEX_POINT_PIXEL_SIZE, VERTEX_Z_OFFSET } from "./constants";
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

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

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
    const { helpers, groups, is3D, skipPreviewDrawing, flattenTo2DProgress, getFinalPlanarOffset } = context;
    helpers.clearGroup(groups.polytopeFill);
    helpers.clearGroup(groups.polytopeOutline);
    helpers.clearGroup(groups.polytopeVertices);

    const { vertices, polytopeComplete, inputMode, highlightIndex, currentMouse } = getState();
    if (vertices.length === 0) {
      return;
    }

    const vrep = VRep.fromPoints(vertices);
    const getObjectiveZValue = (x: number, y: number) => context.scaleZValue(context.computeObjectiveValue(x, y));
    const mixHeight = (z3D: number, planarZ: number) => {
      if (!is3D) return planarZ;
      if (!flattenTo2DProgress) return z3D;
      return lerp(z3D, planarZ, flattenTo2DProgress);
    };

    const isNonconvex = !vrep.isConvex();

    if (polytopeComplete && vertices.length >= 3 && inputMode !== "manual") {
      const material = new MeshBasicMaterial({
        color: isNonconvex ? COLORS.polytopeHighlight : COLORS.polytopeFill,
        transparent: true,
        opacity: 0.6,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });

      const shapeGeometry = new ShapeGeometry(buildShapeFromVertices(vertices));
      if (is3D) {
        const positions = shapeGeometry.getAttribute("position") as Float32BufferAttribute;
        const planarZ = getFinalPlanarOffset(0);
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z3D = getObjectiveZValue(x, y);
          positions.setZ(i, mixHeight(z3D, planarZ));
        }
      }
      const mesh = new Mesh(shapeGeometry, material);
      if (!is3D) {
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
      const z1Base = getObjectiveZValue(v.x, v.y);
      const z2Base = getObjectiveZValue(next.x, next.y);
      const z1 = mixHeight(z1Base + EDGE_Z_OFFSET, getFinalPlanarOffset(EDGE_Z_OFFSET));
      const z2 = mixHeight(z2Base + EDGE_Z_OFFSET, getFinalPlanarOffset(EDGE_Z_OFFSET));
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
      const baseZ = getObjectiveZValue(v.x, v.y);
      const z = mixHeight(baseZ + VERTEX_Z_OFFSET, getFinalPlanarOffset(VERTEX_Z_OFFSET));
      const position = new Vector3(v.x, v.y, z);
      const sprite = helpers.createCircleSpriteWithPixelSize(position, COLORS.vertex, vertexSizePx);
      sprite.renderOrder = RENDER_LAYERS.polytopeVertices;
      groups.polytopeVertices.add(sprite);
    });

    if (!polytopeComplete && vertices.length >= 1 && currentMouse && !skipPreviewDrawing) {
      const last = vertices[vertices.length - 1];
      const lastZBase = context.scaleZValue(context.computeObjectiveValue(last.x, last.y));
      const previewZBase = context.scaleZValue(context.computeObjectiveValue(currentMouse.x, currentMouse.y));
      const lastZ = mixHeight(lastZBase + EDGE_Z_OFFSET, getFinalPlanarOffset(EDGE_Z_OFFSET));
      const previewZ = mixHeight(previewZBase + EDGE_Z_OFFSET, getFinalPlanarOffset(EDGE_Z_OFFSET));
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
    helpers.clearGroup(groups.traceLines);
    helpers.clearGroup(groups.trace);

    const { traceEnabled, traceBuffer } = getState();
    if (!traceEnabled || !traceBuffer || traceBuffer.length === 0) {
      return;
    }

    const sampledPositions: number[] = [];
    traceBuffer.forEach((traceEntry) => {
      const lineData = traceEntry.lineData;
      if (!lineData) return;
      const positions = this.buildTraceLinePositions(lineData.positions, context, is3D);
      if (positions.length === 0) return;
      const line = helpers.createThickLine(positions, {
        color: COLORS.trace,
        width: TRACE_LINE_THICKNESS,
        depthTest: is3D,
        depthWrite: is3D,
        transparent: true,
        opacity: TRACE_LINE_OPACITY,
      });
      line.renderOrder = RENDER_LAYERS.traceLine;
      groups.traceLines.add(line);

      const pointPositions = this.buildTraceSamplePositions(positions, lineData.sampledIndices);
      if (pointPositions.length) {
        sampledPositions.push(...pointPositions);
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

  private buildTraceLinePositions(rawPositions: number[], context: CanvasRenderContext, is3D: boolean): number[] {
    if (rawPositions.length === 0) {
      return [];
    }
    const positions = new Array<number>(rawPositions.length);
    for (let i = 0; i < rawPositions.length; i += 3) {
      positions[i] = rawPositions[i];
      positions[i + 1] = rawPositions[i + 1];
      const scaledZ = context.scaleZValue(rawPositions[i + 2]);
      positions[i + 2] = is3D ? scaledZ : scaledZ + TRACE_Z_OFFSET;
    }
    return positions;
  }

  private buildTraceSamplePositions(linePositions: number[], sampledIndices: number[]): number[] {
    if (linePositions.length === 0 || sampledIndices.length === 0) {
      return [];
    }
    const samples: number[] = [];
    for (let i = 0; i < sampledIndices.length; i++) {
      const baseIndex = sampledIndices[i] * 3;
      if (baseIndex + 2 >= linePositions.length) continue;
      samples.push(linePositions[baseIndex], linePositions[baseIndex + 1], linePositions[baseIndex + 2]);
    }
    return samples;
  }

  private renderIterate(context: CanvasRenderContext) {
    const { helpers, groups, is3D, flattenTo2DProgress, getFinalPlanarOffset } = context;
    helpers.clearGroup(groups.iterate);
    helpers.clearGroup(groups.overlay);

    const { iteratePath, highlightIteratePathIndex } = getState();
    if (!iteratePath || iteratePath.length === 0) {
      return;
    }

    const planarIterateZ = getFinalPlanarOffset(ITERATE_Z_OFFSET);
    const blendIterateZ = (entry: number[]) => {
      const zValue = entry[2] !== undefined ? entry[2] : context.computeObjectiveValue(entry[0], entry[1]);
      const z3D = context.scaleZValue(zValue);
      if (!is3D) {
        return planarIterateZ;
      }
      if (!flattenTo2DProgress) {
        return z3D;
      }
      return lerp(z3D, planarIterateZ, flattenTo2DProgress);
    };

    const positions = new Float32Array(iteratePath.length * 3);
    for (let i = 0; i < iteratePath.length; i++) {
      const entry = iteratePath[i];
      const z = blendIterateZ(entry);
      positions[i * 3] = entry[0];
      positions[i * 3 + 1] = entry[1];
      positions[i * 3 + 2] = z;
    }

    const buildIteratePosition = (entry: number[]) => new Vector3(entry[0], entry[1], blendIterateZ(entry));
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
      const highlightPos = buildIteratePosition(iteratePath[highlightIteratePathIndex]);
      const highlightSize = helpers.getWorldSizeFromPixels(ITERATE_POINT_PIXEL_SIZE * 1.3, highlightPos);
      const highlightSprite = helpers.createCircleSprite(highlightPos, COLORS.iterateHighlight, highlightSize);
      highlightSprite.renderOrder = RENDER_LAYERS.iterateHighlight;
      groups.iterate.add(highlightSprite);
    }

    const lastPos = buildIteratePosition(iteratePath[iteratePath.length - 1]);
    const star = helpers.createStarSprite(lastPos, COLORS.iterateHighlight);
    star.renderOrder = RENDER_LAYERS.iterateStar;
    groups.overlay.add(star);
  }
}
