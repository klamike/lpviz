import type { State } from "./store";

type DrawingPhase = "empty" | "sketching_polytope" | "awaiting_objective" | "objective_preview" | "ready_for_solvers";

type DrawingInteractionMode = "idle" | "dragging_vertex" | "dragging_objective" | "panning";

export interface DrawingPhaseSnapshot {
  phase: DrawingPhase;
  interactionMode: DrawingInteractionMode;
  objectiveDefined: boolean;
  isTouring: boolean;
}

export function computeDrawingSnapshot(state: State): DrawingPhaseSnapshot {
  const verticesCount = state.vertices.length;
  const polytopeComplete = state.polytopeComplete;
  const objectiveDefined = state.objectiveVector !== null;

  let phase: DrawingPhase;
  if (verticesCount === 0) {
    phase = "empty";
  } else if (!polytopeComplete) {
    phase = "sketching_polytope";
  } else if (!objectiveDefined) {
    phase = state.currentObjective !== null ? "objective_preview" : "awaiting_objective";
  } else {
    phase = "ready_for_solvers";
  }

  let interactionMode: DrawingInteractionMode = "idle";
  if (state.draggingPointIndex !== null) {
    interactionMode = "dragging_vertex";
  } else if (state.draggingObjective) {
    interactionMode = "dragging_objective";
  } else if (state.isPanning) {
    interactionMode = "panning";
  }

  return {
    phase,
    interactionMode,
    objectiveDefined,
    isTouring: state.tourActive,
  };
}
