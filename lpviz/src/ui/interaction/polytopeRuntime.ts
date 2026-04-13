import { getState, mutate } from "../../state/store";
import { computeEditorRegionForState } from "./editorSession";

export function createPolytopeRuntime({
  handleProblemChange,
  scheduleNonconvexHint,
}: {
  handleProblemChange: () => void;
  scheduleNonconvexHint: () => void;
}) {
  return {
    send() {
      const state = getState();

      try {
        const regionResult = computeEditorRegionForState(state);

        if (regionResult.status === "nonconvex") {
          mutate((draft) => {
            draft.polytope = null;
            draft.inequalitiesMessage = "Nonconvex";
            draft.highlightIndex = null;
          });
          handleProblemChange();
          scheduleNonconvexHint();
          return;
        }

        const promotion = regionResult.promotion;
        if (promotion) {
          mutate((draft) => {
            draft.vertices = promotion.vertices;
            draft.completionMode = promotion.completionMode;
            draft.interiorPoint = promotion.interiorPoint;
          });
        }

        const result = regionResult.polytope;
        if (!result.inequalities) {
          mutate((draft) => {
            draft.polytope = null;
            draft.inequalitiesMessage = "No inequalities returned.";
            draft.highlightIndex = null;
          });
          handleProblemChange();
          return;
        }

        mutate((draft) => {
          draft.polytope = result;
          draft.inequalitiesMessage = null;
          if (draft.highlightIndex !== null && draft.highlightIndex >= result.inequalities.length) {
            draft.highlightIndex = null;
          }
        });
        scheduleNonconvexHint();
        handleProblemChange();
      } catch (error) {
        console.error("Error:", error);
        mutate((draft) => {
          draft.polytope = null;
          draft.inequalitiesMessage = "Error computing inequalities.";
          draft.highlightIndex = null;
        });
        handleProblemChange();
        scheduleNonconvexHint();
      }
    },
  };
}
