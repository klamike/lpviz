import type { PointXYZ } from "../../solvers/utils/blas";

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

export const PHASE_COLORS = [
  0x1f77b4, // blue
  0xff7f0e, // orange
  0x2ca02c, // green
  0xd62728, // red
  0x9467bd, // purple
  0x8c564b, // brown
  0xe377c2, // pink
  0x7f7f7f, // gray
  0xbcbd22, // olive
  0x17becf, // cyan
];

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

export const DEFAULT_VIEW_ANGLE: PointXYZ = { x: -1.15, y: 0.4, z: 0 };
export const DEFAULT_TRANSITION_DURATION = 500;
export const DEFAULT_FOCAL_DISTANCE = 1000;
export const DEFAULT_Z_SCALE = 0.1;

export const DEFAULT_BOUNDING_EXTENT = 1e9;

export const DEFAULT_BUTTON_STATES = {
  ipmButton: false,
  simplexButton: false,
  pdhgButton: false,
  iteratePathButton: false,
  traceButton: false,
  zoomButton: true,
};

export const ORTHO_MIN_SCALE_FACTOR = 0.05;
export const ORTHO_MAX_SCALE_FACTOR = 400;
export const MIN_3D_DRAG_BOUND = 60;
export const MAX_3D_DRAG_BOUND = 5000;
export const VIEW_DRAG_BOUND_MULTIPLIER = 6;
export const MAX_3D_PLANE_SLOPE = 2;

export const TOUR_CURSOR_TRANSITION_MS = 700;
export const POPUP_ANIMATION_MS = 300;
export const TOUR_DEFAULT_DELAY_MS = 300;
export const TOUR_STEP_PAUSE_MS = 250;
export const TOUR_CLICK_AT_POINT_DELAY_MS = 120;
export const TOUR_BUTTON_CLICK_DELAY_MS = 150;
export const TOUR_CURSOR_CLICK_ANIMATION_MS = 100;
export const TOUR_INACTIVITY_TIMEOUT_MS = 5000;
