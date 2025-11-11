export interface InteractionSlice {
  snapToGrid: boolean;
  highlightIndex: number | null;
  draggingPointIndex: number | null;
  potentialDragPointIndex: number | null;
  dragStartPos: { x: number; y: number } | null;
  draggingObjective: boolean;
  isPanning: boolean;
  lastPan: { x: number; y: number };
  wasPanning: boolean;
  wasDraggingPoint: boolean;
  wasDraggingObjective: boolean;
}

export const createInteractionSlice = (): InteractionSlice => ({
  snapToGrid: false,
  highlightIndex: null,
  draggingPointIndex: null,
  potentialDragPointIndex: null,
  dragStartPos: null,
  draggingObjective: false,
  isPanning: false,
  lastPan: { x: 0, y: 0 },
  wasPanning: false,
  wasDraggingPoint: false,
  wasDraggingObjective: false,
});
