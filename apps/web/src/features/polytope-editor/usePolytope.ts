import { computeEditorRegionForState } from "@/features/polytope-editor/editorSession";
import { getState, setState } from "@/features/core/store";
import { useRef } from "react";

export function usePolytope({
  handleProblemChange,
}: {
  handleProblemChange: () => void;
}) {
  const handleProblemChangeRef = useRef(handleProblemChange);
  handleProblemChangeRef.current = handleProblemChange;

  const send = () => {
    const state = getState();
    try {
      const regionResult = computeEditorRegionForState(state);

      if (regionResult.status === "nonconvex") {
        setState({ polytope: null, inequalitiesMessage: "Nonconvex", highlightIndex: null });
        handleProblemChangeRef.current();
        return;
      }

      const promotion = regionResult.promotion;
      if (promotion) {
        setState({ vertices: promotion.vertices, completionMode: promotion.completionMode, interiorPoint: promotion.interiorPoint });
      }

      const result = regionResult.polytope;
      if (!result.inequalities) {
        setState({ polytope: null, inequalitiesMessage: "No inequalities returned.", highlightIndex: null });
        handleProblemChangeRef.current();
        return;
      }

      const { highlightIndex } = getState();
      setState({
        polytope: result,
        inequalitiesMessage: null,
        ...(highlightIndex !== null && highlightIndex >= result.inequalities.length
          ? { highlightIndex: null }
          : {}),
      });
      handleProblemChangeRef.current();
    } catch (error) {
      console.error("Error:", error);
      setState({ polytope: null, inequalitiesMessage: "Error computing inequalities.", highlightIndex: null });
      handleProblemChangeRef.current();
    }
  };

  const sendRef = useRef(send);
  sendRef.current = send;

  return { send, sendRef };
}
