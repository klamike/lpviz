import { describe, expect, test } from "bun:test";
import type { State } from "@/features/core/store";
import { getEditorContext, getEditorTransition } from "./editorSession";

// Characterization tests for the pure editor FSM. These pin today's behavior so
// the Phase 4 interaction rework (routing drags through getEditorTransition) is
// provably behavior-preserving. getEditorTransition reads only a handful of
// State fields, so a minimal fixture suffices.
function st(o: Partial<State>): State {
  return {
    vertices: [],
    completionMode: "draft",
    currentObjective: null,
    objectiveVector: null,
    polytope: null,
    interiorPoint: null,
    editorInteraction: { kind: "idle" },
    ...o,
  } as unknown as State;
}

const TRI = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 2, y: 3 },
];

describe("getEditorContext.session", () => {
  test("empty/sketching → drafting", () => {
    expect(getEditorContext(st({})).session.kind).toBe("drafting");
    expect(getEditorContext(st({ vertices: TRI })).session.kind).toBe(
      "drafting",
    );
  });
  test("finished region, no objective → selecting-objective", () => {
    expect(
      getEditorContext(st({ vertices: TRI, completionMode: "closed" })).session
        .kind,
    ).toBe("selecting-objective");
  });
  test("closed with objective → editing-closed", () => {
    expect(
      getEditorContext(
        st({
          vertices: TRI,
          completionMode: "closed",
          objectiveVector: { x: 1, y: 0 },
        }),
      ).session.kind,
    ).toBe("editing-closed");
  });
});

describe("getEditorTransition: click", () => {
  test("first click adds a draft vertex", () => {
    const t = getEditorTransition(st({}), {
      kind: "click",
      point: { x: 1, y: 2 },
    });
    expect(t).toEqual({
      kind: "edit",
      result: {
        vertices: [{ x: 1, y: 2 }],
        completionMode: "draft",
        interiorPoint: null,
      },
      saveToHistory: true,
    });
  });

  test("click near first vertex of a triangle closes it (centroid interior)", () => {
    const t = getEditorTransition(st({ vertices: TRI }), {
      kind: "click",
      point: { x: 0.2, y: 0.1 },
    });
    expect(t.kind).toBe("edit");
    if (t.kind !== "edit") throw new Error();
    expect(t.result.completionMode).toBe("closed");
    expect(t.result.interiorPoint).toEqual({ x: 2, y: 1 });
  });

  test("click strictly inside a triangle closes with the clicked interior point", () => {
    const t = getEditorTransition(st({ vertices: TRI }), {
      kind: "click",
      point: { x: 2.5, y: 1 },
    });
    expect(t.kind).toBe("edit");
    if (t.kind !== "edit") throw new Error();
    expect(t.result.completionMode).toBe("closed");
    expect(t.result.interiorPoint).toEqual({ x: 2.5, y: 1 });
  });

  test("click that would make a non-convex polygon is rejected", () => {
    const t = getEditorTransition(st({ vertices: [...TRI] }), {
      kind: "click",
      point: { x: -1, y: -1 },
    });
    expect(t.kind).toBe("reject-nonconvex");
    // the reason now travels with the transition (callers no longer hardcode it)
    if (t.kind === "reject-nonconvex")
      expect(t.reason).toContain("nonconvex");
  });

  test("click while selecting objective picks the objective", () => {
    const t = getEditorTransition(
      st({ vertices: TRI, completionMode: "closed" }),
      { kind: "click", point: { x: 3, y: 2 } },
    );
    expect(t).toEqual({
      kind: "select-objective",
      objectiveVector: { x: 3, y: 2 },
      saveToHistory: true,
    });
  });

  test("click in editing-closed (objective set) is a noop", () => {
    const t = getEditorTransition(
      st({
        vertices: TRI,
        completionMode: "closed",
        objectiveVector: { x: 1, y: 0 },
      }),
      { kind: "click", point: { x: 9, y: 9 } },
    );
    expect(t.kind).toBe("noop");
  });
});

describe("getEditorTransition: finish-open", () => {
  test("fewer than 2 vertices is a noop", () => {
    expect(
      getEditorTransition(st({ vertices: [{ x: 0, y: 0 }] }), {
        kind: "finish-open",
      }).kind,
    ).toBe("noop");
  });
  test("convex chain finishes as an open region", () => {
    const t = getEditorTransition(
      st({
        vertices: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 6, y: 3 },
        ],
      }),
      { kind: "finish-open" },
    );
    expect(t.kind).toBe("edit");
    if (t.kind !== "edit") throw new Error();
    expect(t.result.completionMode).toBe("open");
  });
  test("non-convex chain is rejected", () => {
    const t = getEditorTransition(
      st({
        vertices: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 2, y: 1 },
          { x: 6, y: 0 },
        ],
      }),
      { kind: "finish-open" },
    );
    expect(t.kind).toBe("reject-nonconvex");
    if (t.kind === "reject-nonconvex")
      expect(t.reason).toContain("nonconvex");
  });
});

describe("getEditorTransition: delete-vertex", () => {
  test("drafting delete removes the vertex, stays draft", () => {
    const t = getEditorTransition(
      st({
        vertices: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 2, y: 3 },
        ],
      }),
      { kind: "delete-vertex", deleteIndex: 1 },
    );
    expect(t.kind).toBe("edit");
    if (t.kind !== "edit") throw new Error();
    expect(t.result.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 3 },
    ]);
    expect(t.result.completionMode).toBe("draft");
  });
});
