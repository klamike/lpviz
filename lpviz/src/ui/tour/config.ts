import type { PointXY } from "../../solvers/utils/blas";

export type GuidedStep =
  | { type: "wait"; duration: number }
  | { type: "draw-vertex"; point: PointXY }
  | { type: "close-polytope"; point: PointXY }
  | { type: "set-objective"; point: PointXY }
  | { type: "click-button"; id: string };

export function buildGuidedScript(vertices: PointXY[], objective: PointXY): GuidedStep[] {
  const steps: GuidedStep[] = [{ type: "wait", duration: 500 }];
  vertices.forEach((point) => steps.push({ type: "draw-vertex", point }));
  steps.push({ type: "close-polytope", point: { x: 0, y: 0 } });
  steps.push({ type: "wait", duration: 1000 });
  steps.push({ type: "set-objective", point: objective });
  steps.push({ type: "wait", duration: 1000 });
  steps.push({ type: "click-button", id: "ipmButton" });
  steps.push({ type: "wait", duration: 750 });
  steps.push({ type: "click-button", id: "traceButton" });
  steps.push({ type: "wait", duration: 750 });
  steps.push({ type: "click-button", id: "toggle3DButton" });
  steps.push({ type: "wait", duration: 750 });
  steps.push({ type: "click-button", id: "startRotateObjectiveButton" });
  steps.push({ type: "wait", duration: 2000 });
  steps.push({ type: "click-button", id: "iteratePathButton" });
  steps.push({ type: "wait", duration: 1500 });
  steps.push({ type: "click-button", id: "traceCheckbox" });
  return steps;
}

export function generatePentagon(): PointXY[] {
  const centerX = 0;
  const centerY = 0;
  const baseRadius = 10;
  const vertices: PointXY[] = [];

  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const radiusVariation = 0.8 + Math.random() * 0.4;
    const radius = baseRadius * radiusVariation;
    const angleVariation = (Math.random() - 0.5) * 0.3;

    vertices.push({
      x: centerX + radius * Math.cos(angle + angleVariation),
      y: centerY + radius * Math.sin(angle + angleVariation),
    });
  }

  return vertices;
}

export function generateObjective(): PointXY {
  const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
  const magnitude = 6 + Math.random() * 8;

  return {
    x: magnitude * Math.cos(angle),
    y: magnitude * Math.sin(angle),
  };
}

