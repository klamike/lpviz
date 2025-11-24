export const COLORS = {
  grid: 0xe0e0e0,
  axis: 0x707070,
  polytopeFill: 0xe6e6e6,
  polytopeHighlight: 0xff0000,
  vertex: 0xff0000,
  objective: 0x008000,
  iteratePath: 0x800080,
  iterateHighlight: 0x008000,
  trace: 0xffa500,
};

export const GRID_MARGIN = 100;

export const TRACE_Z_OFFSET = 0.02;
export const ITERATE_Z_OFFSET = 0.03;
export const EDGE_Z_OFFSET = 0.002;
export const VERTEX_Z_OFFSET = 0.004;
export const OBJECTIVE_Z_OFFSET = 0.015;

export const MAX_TRACE_POINT_SPRITES = 1200;

export const TRACE_POINT_PIXEL_SIZE = 6;
export const ITERATE_POINT_PIXEL_SIZE = 8;
export const STAR_POINT_PIXEL_SIZE = 18;
export const VERTEX_POINT_PIXEL_SIZE = 10;

export const POLY_LINE_THICKNESS = 2;
export const TRACE_LINE_THICKNESS = 2;
export const TRACE_LINE_OPACITY = 0.4;
export const ITERATE_LINE_THICKNESS = 3;

export const RENDER_LAYERS = {
  grid: 0,
  polyEdges: 3,
  objective: 4,
  traceLine: 5,
  constraintLines: 6,
  polytopeVertices: 12,
  tracePoints: 14,
  iterateLine: 20,
  iteratePoints: 22,
  iterateStar: 24,
  iterateHighlight: 26,
};
