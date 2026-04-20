import { computeEditorRegionForState } from "@/lib/editorSession";
import { getState, mutate } from "@/state";
import { useCallback, useMemo, useRef } from "react";

export type PolytopeActions = {
  send: () => void;
  sendRef: React.MutableRefObject<() => void>;
};

export function usePolytope({
  handleProblemChange,
  scheduleNonconvexHint,
}: {
  handleProblemChange: () => void;
  scheduleNonconvexHint: () => void;
}): PolytopeActions {
  const handleProblemChangeRef = useRef(handleProblemChange);
  handleProblemChangeRef.current = handleProblemChange;
  const scheduleNonconvexHintRef = useRef(scheduleNonconvexHint);
  scheduleNonconvexHintRef.current = scheduleNonconvexHint;

  const send = useCallback(() => {
    const state = getState();
    try {
      const regionResult = computeEditorRegionForState(state);

      if (regionResult.status === "nonconvex") {
        mutate((draft) => {
          draft.polytope = null;
          draft.inequalitiesMessage = "Nonconvex";
          draft.highlightIndex = null;
        });
        handleProblemChangeRef.current();
        scheduleNonconvexHintRef.current();
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
        handleProblemChangeRef.current();
        return;
      }

      mutate((draft) => {
        draft.polytope = result;
        draft.inequalitiesMessage = null;
        if (
          draft.highlightIndex !== null &&
          draft.highlightIndex >= result.inequalities.length
        ) {
          draft.highlightIndex = null;
        }
      });
      scheduleNonconvexHintRef.current();
      handleProblemChangeRef.current();
    } catch (error) {
      console.error("Error:", error);
      mutate((draft) => {
        draft.polytope = null;
        draft.inequalitiesMessage = "Error computing inequalities.";
        draft.highlightIndex = null;
      });
      handleProblemChangeRef.current();
      scheduleNonconvexHintRef.current();
    }
  }, []);

  const sendRef = useRef(send);
  sendRef.current = send;

  return useMemo(() => ({ send, sendRef }), [send]);
}
