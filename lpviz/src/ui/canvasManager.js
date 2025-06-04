import { state } from "../state/state.js";

export class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.gridSpacing = 20;
    this.scaleFactor = 1;
    this.offset = { x: 0, y: 0 };
    this.centerX = window.innerWidth / 2;
    this.centerY = window.innerHeight / 2;
  }

  updateDimensions() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sidebarWidth = document.getElementById("sidebar").offsetWidth;
    this.centerX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    this.centerY = window.innerHeight / 2;
  }

  toLogicalCoords(x, y) {
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

  toCanvasCoords(x, y) {
    return {
      x: this.centerX + (x + this.offset.x) * this.gridSpacing * this.scaleFactor,
      y: this.centerY - (y + this.offset.y) * this.gridSpacing * this.scaleFactor,
    };
  }

  drawGrid() {
    const width = window.innerWidth,
      height = window.innerHeight;
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

  drawPolygon() {
    if (state.vertices.length === 0) return;
    if (state.polygonComplete) {
      state.vertices.forEach((v, i) => {
        const cp1 = this.toCanvasCoords(v.x, v.y);
        const cp2 = this.toCanvasCoords(
          state.vertices[(i + 1) % state.vertices.length].x,
          state.vertices[(i + 1) % state.vertices.length].y
        );
        this.ctx.beginPath();
        this.ctx.strokeStyle = state.highlightIndex === i ? "red" : "black";
        this.ctx.lineWidth = state.highlightIndex === i ? 4 : 2;
        this.ctx.moveTo(cp1.x, cp1.y);
        this.ctx.lineTo(cp2.x, cp2.y);
        this.ctx.stroke();
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
      if (state.currentMouse) {
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

  drawAnalyticCenter() {
    if (state.analyticCenter) {
      const ac = this.toCanvasCoords(state.analyticCenter[0], state.analyticCenter[1]);
      this.ctx.fillStyle = "black";
      this.ctx.beginPath();
      this.ctx.arc(ac.x, ac.y, 6, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  drawObjective() {
    const target =
      state.objectiveVector ||
      (state.polygonComplete && state.currentObjective ? state.currentObjective : null);
    if (target) {
      const origin = this.toCanvasCoords(0, 0);
      const end = this.toCanvasCoords(target.x, target.y);
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

  drawStar(cx, cy, spikes, outerRadius, innerRadius, fillStyle) {
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

  drawIteratePath() {
    if (state.iteratePath && state.iteratePath.length > 0) {
      this.ctx.strokeStyle = "purple";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      const start = this.toCanvasCoords(state.iteratePath[0][0], state.iteratePath[0][1]);
      this.ctx.moveTo(start.x, start.y);
      for (let i = 1; i < state.iteratePath.length; i++) {
        const pt = this.toCanvasCoords(state.iteratePath[i][0], state.iteratePath[i][1]);
        this.ctx.lineTo(pt.x, pt.y);
      }
      this.ctx.stroke();
      state.iteratePath.forEach((entry, i) => {
        const cp = this.toCanvasCoords(entry[0], entry[1]);
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
    this.drawAnalyticCenter();
    this.drawObjective();
    this.drawIteratePath();
  }

  isPolygonConvex(points) {
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
}
