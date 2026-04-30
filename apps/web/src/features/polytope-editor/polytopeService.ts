import { getState, setState } from "@/features/core/store";
import { computeEditorRegionForState } from "@/features/polytope-editor/editorSession";
import { getPolytopeViewportDirtyFlags } from "@/features/viewport/dirtyFlags";

export type PolytopeService = { send: () => void };

export function createPolytopeService(
  getHandleProblemChange: () => () => void,
): PolytopeService {
  const send = () => {
    try {
      const regionResult = computeEditorRegionForState(getState());
      if (regionResult.status === "nonconvex") {
        setState(
          {
            polytope: null,
            inequalitiesMessage: "Nonconvex",
            highlightIndex: null,
          },
          { viewportDirty: getPolytopeViewportDirtyFlags() },
        );
        getHandleProblemChange()();
        return;
      }
      const promotion = regionResult.promotion;
      if (promotion)
        setState(
          {
            vertices: promotion.vertices,
            completionMode: promotion.completionMode,
            interiorPoint: promotion.interiorPoint,
          },
          { viewportDirty: getPolytopeViewportDirtyFlags() },
        );
      const result = regionResult.polytope;
      if (!result.inequalities) {
        setState(
          {
            polytope: null,
            inequalitiesMessage: "No inequalities returned.",
            highlightIndex: null,
          },
          { viewportDirty: getPolytopeViewportDirtyFlags() },
        );
        getHandleProblemChange()();
        return;
      }
      const { highlightIndex } = getState();
      setState(
        {
          polytope: result,
          inequalitiesMessage: null,
          ...(highlightIndex !== null &&
          highlightIndex >= result.inequalities.length
            ? { highlightIndex: null }
            : {}),
        },
        { viewportDirty: getPolytopeViewportDirtyFlags() },
      );
      getHandleProblemChange()();
    } catch (error) {
      console.error("Error:", error);
      setState(
        {
          polytope: null,
          inequalitiesMessage: "Error computing inequalities.",
          highlightIndex: null,
        },
        { viewportDirty: getPolytopeViewportDirtyFlags() },
      );
      getHandleProblemChange()();
    }
  };
  return { send };
}
