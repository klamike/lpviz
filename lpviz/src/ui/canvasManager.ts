import { state } from "../state/state";
import { PointXY } from "../types/arrays";
import { transform2DTo3DAndProject, inverseTransform2DProjection } from "../utils/math3d";

export class CanvasManager {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gridSpacing: number;
  scaleFactor: number;
  offset: { x: number; y: number };
  centerX: number;
  centerY: number;
  private guidedTour: any = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.gridSpacing = 20;
    this.scaleFactor = 1;
    this.offset = { x: 0, y: 0 };
    this.centerX = window.innerWidth / 2;
    this.centerY = window.innerHeight / 2;
  }

  setTourComponents(guidedTour: any) {
    this.guidedTour = guidedTour;
  }

  private shouldSkipPreviewDrawing(): boolean {
    return this.guidedTour?.isTouring();
  }

  updateDimensions() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sidebarWidth = document.getElementById("sidebar")?.offsetWidth || 0;
    this.centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    this.centerY = window.innerHeight / 2;
  }

  toLogicalCoords(x: number, y: number) {
    if (state.is3DMode || state.isTransitioning3D) {
      let projected2D = {
        x: (x - this.centerX) / (this.gridSpacing * this.scaleFactor) - this.offset.x,
        y: (this.centerY - y) / (this.gridSpacing * this.scaleFactor) - this.offset.y,
      };
      
      let logical = inverseTransform2DProjection(projected2D, state.viewAngle, state.focalDistance);
      
      if (state.snapToGrid) {
        logical.x = Math.round(logical.x);
        logical.y = Math.round(logical.y);
      }
      return logical;
    } else {
      let logical = {
        x: (x - this.centerX) / (this.gridSpacing * this.scaleFactor) - this.offset.x,
        y: (this.centerY - y) / (this.gridSpacing * this.scaleFactor) - this.offset.y,
      };
      if (state.snapToGrid) {
        logical.x = Math.round(logical.x);
        logical.y = Math.round(logical.y);
      }
      return logical;
    }
  }

  toCanvasCoords(x: number, y: number, z?: number) {
    if (state.is3DMode || state.isTransitioning3D) {
      let actualZ = z;
      if (actualZ === undefined && state.objectiveVector) {
        actualZ = state.objectiveVector.x * x + state.objectiveVector.y * y;
      } else if (actualZ === undefined) {
        actualZ = 0;
      }
      
      const scaledZ = actualZ * state.zScale / 100;
      
      const projected = transform2DTo3DAndProject(
        { x, y, z: scaledZ }, 
        state.viewAngle, 
        state.focalDistance
      );
      return {
        x: this.centerX + (projected.x + this.offset.x) * this.gridSpacing * this.scaleFactor,
        y: this.centerY - (projected.y + this.offset.y) * this.gridSpacing * this.scaleFactor,
      };
    } else {
      return {
        x: this.centerX + (x + this.offset.x) * this.gridSpacing * this.scaleFactor,
        y: this.centerY - (y + this.offset.y) * this.gridSpacing * this.scaleFactor,
      };
    }
  }

  drawGrid() {
    const width = window.innerWidth,
      height = window.innerHeight;
    
    if (state.is3DMode || state.isTransitioning3D) {
      this.ctx.strokeStyle = "#e0e0e0";
      this.ctx.lineWidth = 0.5;
      
      const scaledSpacing = this.gridSpacing * this.scaleFactor;
      const viewportLogicalWidth = width / scaledSpacing;
      const viewportLogicalHeight = height / scaledSpacing;
      
      const baseRange = Math.max(viewportLogicalWidth, viewportLogicalHeight);
      const gridRange = Math.max(50, Math.ceil(baseRange * 2));
      
      const offsetX = this.offset.x;
      const offsetY = this.offset.y;
      const rangeX = Math.ceil(Math.abs(offsetX)) + gridRange;
      const rangeY = Math.ceil(Math.abs(offsetY)) + gridRange;
      
      for (let i = -rangeX; i <= rangeX; i++) {
        this.ctx.beginPath();
        const startPoint = this.toCanvasCoords(i, -rangeY, 0);
        const endPoint = this.toCanvasCoords(i, rangeY, 0);
        
        if (this.isLineVisible(startPoint, endPoint, width, height)) {
          this.ctx.moveTo(startPoint.x, startPoint.y);
          this.ctx.lineTo(endPoint.x, endPoint.y);
          this.ctx.stroke();
        }
      }
      
      for (let i = -rangeY; i <= rangeY; i++) {
        this.ctx.beginPath();
        const startPoint = this.toCanvasCoords(-rangeX, i, 0);
        const endPoint = this.toCanvasCoords(rangeX, i, 0);
        
        if (this.isLineVisible(startPoint, endPoint, width, height)) {
          this.ctx.moveTo(startPoint.x, startPoint.y);
          this.ctx.lineTo(endPoint.x, endPoint.y);
          this.ctx.stroke();
        }
      }
      
      this.ctx.strokeStyle = "#707070";
      this.ctx.lineWidth = 0.8;
      
      const axisRange = Math.max(rangeX, rangeY);
      
      const xAxisStart = this.toCanvasCoords(-axisRange, 0, 0);
      const xAxisEnd = this.toCanvasCoords(axisRange, 0, 0);
      this.ctx.beginPath();
      this.ctx.moveTo(xAxisStart.x, xAxisStart.y);
      this.ctx.lineTo(xAxisEnd.x, xAxisEnd.y);
      this.ctx.stroke();
      
      const yAxisStart = this.toCanvasCoords(0, -axisRange, 0);
      const yAxisEnd = this.toCanvasCoords(0, axisRange, 0);
      this.ctx.beginPath();
      this.ctx.moveTo(yAxisStart.x, yAxisStart.y);
      this.ctx.lineTo(yAxisEnd.x, yAxisEnd.y);
      this.ctx.stroke();
      
    } else {
      const originX = this.centerX + this.offset.x * this.gridSpacing * this.scaleFactor;
      const originY = this.centerY - this.offset.y * this.gridSpacing * this.scaleFactor;
      this.ctx.strokeStyle = "#e0e0e0";
      this.ctx.lineWidth = 0.5;
      for (let x = originX; x <= width; x += this.gridSpacing * this.scaleFactor) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();
      }
      for (let x = originX; x >= 0; x -= this.gridSpacing * this.scaleFactor) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();
      }
      for (let y = originY; y <= height; y += this.gridSpacing * this.scaleFactor) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();
      }
      for (let y = originY; y >= 0; y -= this.gridSpacing * this.scaleFactor) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();
      }
      this.ctx.strokeStyle = "#707070";
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(originX, 0);
      this.ctx.lineTo(originX, height);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(0, originY);
      this.ctx.lineTo(width, originY);
      this.ctx.stroke();
    }
  }

  drawPolygon() {
    if (state.vertices.length === 0) return;
    if (state.polygonComplete) {
      if (state.vertices.length >= 3 && state.inputMode !== 'manual') {
        this.ctx.fillStyle = (state.is3DMode || state.isTransitioning3D) 
          ? "rgba(230, 230, 230, 0.3)"
          : "rgba(230, 230, 230, 0.3)";
        
        this.ctx.beginPath();
        const start = this.toCanvasCoords(state.vertices[0].x, state.vertices[0].y);
        this.ctx.moveTo(start.x, start.y);
        for (let i = 1; i < state.vertices.length; i++) {
          const cp = this.toCanvasCoords(state.vertices[i].x, state.vertices[i].y);
          this.ctx.lineTo(cp.x, cp.y);
        }
        this.ctx.closePath();
        this.ctx.fill();
      }
      state.vertices.forEach((v, i) => {
        const cp1 = this.toCanvasCoords(v.x, v.y);
        const cp2 = this.toCanvasCoords(
          state.vertices[(i + 1) % state.vertices.length].x,
          state.vertices[(i + 1) % state.vertices.length].y
        );
        this.ctx.beginPath();
        
        if (state.inputMode === 'manual') {
          this.ctx.strokeStyle = "black";
          this.ctx.lineWidth = 2;
          this.ctx.setLineDash([]);
        } else {
          this.ctx.strokeStyle = state.highlightIndex === i ? "red" : "black";
          this.ctx.lineWidth = state.highlightIndex === i ? 4 : 2;
        }
        
        this.ctx.moveTo(cp1.x, cp1.y);
        this.ctx.lineTo(cp2.x, cp2.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      });
      
      state.vertices.forEach((pt) => {
        const cp = this.toCanvasCoords(pt.x, pt.y);
        this.ctx.fillStyle = "red";
        this.ctx.beginPath();
        this.ctx.arc(cp.x, cp.y, 4, 0, 2 * Math.PI);
        this.ctx.fill();
      });
      if (!this.isPolygonConvex(state.vertices)) {
        this.ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
        this.ctx.beginPath();
        const start = this.toCanvasCoords(state.vertices[0].x, state.vertices[0].y);
        this.ctx.moveTo(start.x, start.y);
        for (let i = 1; i < state.vertices.length; i++) {
          const cp = this.toCanvasCoords(state.vertices[i].x, state.vertices[i].y);
          this.ctx.lineTo(cp.x, cp.y);
        }
        this.ctx.closePath();
        this.ctx.fill();
      }
    } else {
      this.ctx.beginPath();
      const start = this.toCanvasCoords(state.vertices[0].x, state.vertices[0].y);
      this.ctx.moveTo(start.x, start.y);
      for (let i = 1; i < state.vertices.length; i++) {
        const cp = this.toCanvasCoords(state.vertices[i].x, state.vertices[i].y);
        this.ctx.lineTo(cp.x, cp.y);
      }
      if (state.currentMouse && !this.shouldSkipPreviewDrawing()) {
        const rbEnd = this.toCanvasCoords(state.currentMouse.x, state.currentMouse.y);
        this.ctx.lineTo(rbEnd.x, rbEnd.y);
      }
      this.ctx.strokeStyle = "black";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      state.vertices.forEach((pt) => {
        const cp = this.toCanvasCoords(pt.x, pt.y);
        this.ctx.fillStyle = "red";
        this.ctx.beginPath();
        this.ctx.arc(cp.x, cp.y, 4, 0, 2 * Math.PI);
        this.ctx.fill();
      });
    }
  }

  drawConstraintLines() {
    if (state.inputMode === 'manual' && state.computedLines && state.computedLines.length > 0) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      state.computedLines.forEach((line, index) => {
        const [A, B, C] = line;
        
        if (Math.abs(A) < 1e-10 && Math.abs(B) < 1e-10) return;
        
        let x1: number, y1: number, x2: number, y2: number;
        
        const margin = 50;
        const topLeft = this.toLogicalCoords(-margin, -margin);
        const bottomRight = this.toLogicalCoords(width + margin, height + margin);
        
        const minX = Math.min(topLeft.x, bottomRight.x) - margin;
        const maxX = Math.max(topLeft.x, bottomRight.x) + margin;
        const minY = Math.min(topLeft.y, bottomRight.y) - margin;
        const maxY = Math.max(topLeft.y, bottomRight.y) + margin;
        
        if (Math.abs(B) > Math.abs(A)) {
          x1 = minX;
          y1 = (C - A * x1) / B;
          x2 = maxX;
          y2 = (C - A * x2) / B;
        } else {
          y1 = minY;
          x1 = (C - B * y1) / A;
          y2 = maxY;
          x2 = (C - B * y2) / A;
        }
        
        const start = this.toCanvasCoords(x1, y1);
        const end = this.toCanvasCoords(x2, y2);
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = state.highlightIndex === index ? "red" : "rgba(100, 100, 100, 0.7)";
        this.ctx.lineWidth = state.highlightIndex === index ? 3 : 1;
        this.ctx.setLineDash(state.highlightIndex === index ? [] : [5, 5]);
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      });
    }
  }

  drawObjective() {
    const target =
      state.objectiveVector ||
      (state.polygonComplete && state.currentObjective && !this.shouldSkipPreviewDrawing() ? state.currentObjective : null);
    if (target) {
      // In 3D mode, the objective vector should be drawn in the XY plane (z=0)
      const origin = this.toCanvasCoords(0, 0, 0);
      const end = this.toCanvasCoords(target.x, target.y, 0);
      this.ctx.strokeStyle = "green";
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(origin.x, origin.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
      const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
      const headLength = 10;
      this.ctx.beginPath();
      this.ctx.moveTo(end.x, end.y);
      this.ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6),
                      end.y - headLength * Math.sin(angle + Math.PI / 6));
      this.ctx.moveTo(end.x, end.y);
      this.ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6),
                      end.y - headLength * Math.sin(angle - Math.PI / 6));
      this.ctx.stroke();
    }
  }

  drawStar(cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, fillStyle: string | CanvasGradient | CanvasPattern) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      this.ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      this.ctx.lineTo(x, y);
      rot += step;
    }
    this.ctx.closePath();
    this.ctx.fillStyle = fillStyle;
    this.ctx.fill();
  }

  drawSingleTrace(path: number[][]) {
    if (path.length === 0) return;
    
    this.ctx.strokeStyle = "rgba(255, 165, 0, 0.6)";
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    
    const startZ = path[0][2] !== undefined ? path[0][2] : 
      (state.objectiveVector ? state.objectiveVector.x * path[0][0] + state.objectiveVector.y * path[0][1] : 0);
    const start = this.toCanvasCoords(path[0][0], path[0][1], startZ);
    this.ctx.moveTo(start.x, start.y);
    
    for (let i = 1; i < path.length; i++) {
      const z = path[i][2] !== undefined ? path[i][2] : 
        (state.objectiveVector ? state.objectiveVector.x * path[i][0] + state.objectiveVector.y * path[i][1] : 0);
      const pt = this.toCanvasCoords(path[i][0], path[i][1], z);
      this.ctx.lineTo(pt.x, pt.y);
    }
    
    this.ctx.stroke();
  
    path.forEach((entry: number[]) => {
      const z = entry[2] !== undefined ? entry[2] : 
        (state.objectiveVector ? state.objectiveVector.x * entry[0] + state.objectiveVector.y * entry[1] : 0);
      const cp = this.toCanvasCoords(entry[0], entry[1], z);
      this.ctx.beginPath();
      this.ctx.fillStyle = "rgba(255, 165, 0, 0.8)";
      this.ctx.arc(cp.x, cp.y, 2, 0, 2 * Math.PI);
      this.ctx.fill();
    });
  }

  drawIteratePath() {
    if (state.traceEnabled) {
      if (state.traceBuffer && state.traceBuffer.length > 0) {
        state.traceBuffer.forEach(traceEntry => {
          this.drawSingleTrace(traceEntry.path);
        });
      }
    }
    
    if (state.iteratePath && state.iteratePath.length > 0) {
      this.ctx.strokeStyle = "purple";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      
      const startZ = state.iteratePath[0][2] !== undefined ? state.iteratePath[0][2] : state.objectiveVector ? state.objectiveVector.x * state.iteratePath[0][0] + state.objectiveVector.y * state.iteratePath[0][1] : 0;
      const start = this.toCanvasCoords(state.iteratePath[0][0], state.iteratePath[0][1], startZ);
      this.ctx.moveTo(start.x, start.y);
      
      for (let i = 1; i < state.iteratePath.length; i++) {
        const z = state.iteratePath[i][2] !== undefined ? state.iteratePath[i][2] : state.objectiveVector ? state.objectiveVector.x * state.iteratePath[i][0] + state.objectiveVector.y * state.iteratePath[i][1] : 0;
        const pt = this.toCanvasCoords(state.iteratePath[i][0], state.iteratePath[i][1], z);
        this.ctx.lineTo(pt.x, pt.y);
      }
      this.ctx.stroke();
      
      state.iteratePath.forEach((entry, i) => {
        const z = entry[2] !== undefined ? entry[2] : state.objectiveVector ? state.objectiveVector.x * entry[0] + state.objectiveVector.y * entry[1] : 0;
        const cp = this.toCanvasCoords(entry[0], entry[1], z);
        if (i === state.iteratePath.length - 1) {
          this.drawStar(cp.x, cp.y, 5, 8, 4, "green");
        } else {
          this.ctx.beginPath();
          this.ctx.fillStyle = state.highlightIteratePathIndex === i ? "green" : "purple";
          this.ctx.arc(cp.x, cp.y, state.highlightIteratePathIndex === i ? 5 : 3, 0, 2 * Math.PI);
          this.ctx.fill();
        }
      });
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    this.drawGrid();
    this.drawPolygon();
    this.drawConstraintLines();
    this.drawObjective();
    this.drawIteratePath();
  }

  isPolygonConvex(points: PointXY[]) {
    if (points.length < 3) return true;
    let prevCross = 0;
    for (let i = 0, n = points.length; i < n; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % n];
      const p2 = points[(i + 2) % n];
      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (cross !== 0) {
        if (prevCross === 0) prevCross = cross;
        else if (Math.sign(cross) !== Math.sign(prevCross)) return false;
      }
    }
    return true;
  }

  isLineVisible(startPoint: PointXY, endPoint: PointXY, width: number, height: number) {
    const margin = 100;
    
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);
    
    return !(maxX < -margin || minX > width + margin || 
             maxY < -margin || minY > height + margin);
  }
}
