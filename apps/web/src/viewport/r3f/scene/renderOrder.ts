/**
 * Global render-order buckets for the R3F single-scene renderer.
 *
 * The old viewport used multiple scenes rendered in this order:
 *   background -> transparent(fill) -> foreground -> vertices -> traceLines -> trace -> overlay
 *
 * In the R3F migration everything lives in one scene, so we need renderOrder
 * values that encode those former scene passes globally.
 */

const PASS = {
  background: 0,
  fill: 100,
  foreground: 200,
  vertices: 300,
  traceLines: 400,
  trace: 500,
  overlay: 600,
} as const;

export const RENDER_ORDER = {
  grid: PASS.background + 0,
  axis: PASS.background + 1,

  polytopeFill: PASS.fill + 2,

  polyEdges: PASS.foreground + 3,
  objective: PASS.foreground + 4,
  constraintLines: PASS.foreground + 6,

  polytopeVertices: PASS.vertices + 12,

  traceLine: PASS.traceLines + 5,

  tracePoints: PASS.trace + 14,
  iterateLine: PASS.trace + 20,
  iteratePoints: PASS.trace + 22,
  iterateRestartPoints: PASS.trace + 23,
  iterateHighlight: PASS.trace + 26,

  iterateStar: PASS.overlay + 24,
} as const;
