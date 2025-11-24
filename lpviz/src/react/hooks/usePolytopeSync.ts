import { useEffect } from "react";
import { VRep } from "../../solvers/utils/polytope";
import { mutate, setState } from "../../state/store";
import { useStoreSelector } from "./useStoreSelector";

/**
 * Keeps derived polytope data in sync with the current vertices so the React UI
 * can render inequalities/constraints/objective overlays without relying on the
 * legacy imperative pipeline.
 */
export function usePolytopeSync() {
  const vertices = useStoreSelector((state) => state.vertices);

  useEffect(() => {
    if (vertices.length === 0) {
      setState({ polytope: null });
      return;
    }

    try {
      const vrep = VRep.fromPoints(vertices);
      if (!vrep.isConvex()) {
        setState({ polytope: null, highlightIndex: null });
        return;
      }
      const polytope = vrep.toPolytopeRepresentation();
      mutate((draft) => {
        draft.polytope = polytope;
        if (!draft.objectiveVector) {
          draft.objectiveVector = { x: 1, y: 1 };
        }
      });
    } catch (err) {
      console.error("Failed to compute polytope from vertices", err);
      setState({ polytope: null });
    }
  }, [vertices]);
}
