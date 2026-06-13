import { describe, expect, test } from "bun:test";
import {
  getConstraintViewportDirtyFlags,
  getDraftPreviewViewportDirtyFlags,
  getIterateViewportDirtyFlags,
  getObjectiveViewportDirtyFlags,
  getPolytopeViewportDirtyFlags,
  getTraceViewportDirtyFlags,
  getZScaleViewportDirtyFlags,
  isViewport3DState,
} from "./dirtyFlags";

// Golden mapping of "what render layers does each kind of state change repaint".
// This is the oracle Phase 2 must reproduce exactly when it switches to deriving
// viewportDirty from the changed store fields. If Phase 2 changes any of these,
// the change is intentional and this file is updated alongside it.
describe("viewport dirty-flag mapping (Phase 2 oracle)", () => {
  test("objective change repaints the objective (and polytope in 3D)", () => {
    expect(getObjectiveViewportDirtyFlags(false)).toEqual({ objective: true });
    expect(getObjectiveViewportDirtyFlags(true)).toEqual({
      polytope: true,
      objective: true,
    });
  });

  test("polytope edit repaints polytope + constraints + objective", () => {
    expect(getPolytopeViewportDirtyFlags()).toEqual({
      polytope: true,
      constraints: true,
      objective: true,
    });
  });

  test("trace / iterate / constraint changes are single-layer", () => {
    expect(getTraceViewportDirtyFlags()).toEqual({ trace: true });
    expect(getIterateViewportDirtyFlags()).toEqual({ iterate: true });
    expect(getConstraintViewportDirtyFlags()).toEqual({ constraints: true });
  });

  test("draft preview repaints the polytope only", () => {
    expect(getDraftPreviewViewportDirtyFlags()).toEqual({ polytope: true });
  });

  test("zScale change repaints every world-anchored layer", () => {
    expect(getZScaleViewportDirtyFlags()).toEqual({
      polytope: true,
      objective: true,
      trace: true,
      iterate: true,
    });
  });

  test("a view counts as 3D while in 3D or mid-transition", () => {
    expect(isViewport3DState({ is3DMode: true, isTransitioning3D: false })).toBe(
      true,
    );
    expect(isViewport3DState({ is3DMode: false, isTransitioning3D: true })).toBe(
      true,
    );
    expect(
      isViewport3DState({ is3DMode: false, isTransitioning3D: false }),
    ).toBe(false);
  });
});
