export const state = {
  vertices: [],
  currentMouse: null,
  polygonComplete: false,
  interiorPoint: null,
  objectiveVector: null,
  currentObjective: null,
  computedVertices: [],
  computedLines: [],
  snapToGrid: false,
  highlightIndex: null,
  analyticCenter: null,
  iteratePath: [],
  iteratePathComputed: false,
  historyStack: [],
  redoStack: [],
  highlightIteratePathIndex: null,
  isIteratePathComputing: false,
  rotateObjectiveMode: false,
  barrierWeightsVisible: false,
  draggingPointIndex: null,
  draggingObjective: false,
  barrierWeights: [],
  solverMode: "central",
  animationIntervalId: null,
  originalIteratePath: [],
  isPanning: false,
  lastPan: { x: 0, y: 0 },
  wasPanning: false,
  wasDraggingPoint: false,
  wasDraggingObjective: false,
  is3DMode: false,
  viewAngle: { x: -1.15, y: 0.4, z: 0 },
  focalDistance: 1000,
  isRotatingCamera: false,
  lastRotationMouse: { x: 0, y: 0 },
  zScale: 0.1,
  traceEnabled: false,
  accumulatedTraces: [],
  currentTracePath: [],
  totalRotationAngle: 0,
  rotationCount: 0,
  isTransitioning3D: false,
  transitionStartTime: 0,
  transitionDuration: 500,
  transition3DStartAngles: { x: 0, y: 0, z: 0 },
  transition3DEndAngles: { x: -1.15, y: 0.4, z: 0 },
  inputMode: 'visual',
  manualConstraints: [],
  manualObjective: null,
  objectiveDirection: 'max',
  parsedConstraints: []
};
