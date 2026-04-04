import type { CompletionMode, SolverMode, State } from "../state/store";

export type ShareSettings = {
  alphaMax?: number;
  correctorThreshold?: number;
  maxitIPM?: number;
  ipmColorByPhase?: boolean;
  simplexDualMode?: boolean;
  pdhgEta?: number;
  pdhgTau?: number;
  maxitPDHG?: number;
  pdhgIneqMode?: boolean;
  pdhgHalpernMode?: boolean;
  pdhgColorByBasis?: boolean;
  centralPathIter?: number;
  objectiveAngleStep?: number;
  objectiveRotationSpeed?: number;
};

export type SharedAppState = {
  vertices: { x: number; y: number }[];
  completionMode?: CompletionMode;
  objective: { x: number; y: number } | null;
  solverMode: SolverMode;
  settings: ShareSettings;
  zScale?: number;
  zAxisOffsetOnly?: boolean;
};

const shareKeyMap = {
  vertices: "v",
  completionMode: "k",
  objective: "o",
  solverMode: "s",
  settings: "g",
  zScale: "l",
  zAxisOffsetOnly: "u",
  x: "x",
  y: "y",
  alphaMax: "a",
  correctorThreshold: "f",
  maxitIPM: "i",
  ipmColorByPhase: "w",
  simplexDualMode: "d",
  pdhgEta: "e",
  pdhgTau: "t",
  maxitPDHG: "p",
  pdhgIneqMode: "m",
  pdhgHalpernMode: "j",
  pdhgColorByBasis: "h",
  centralPathIter: "c",
  objectiveAngleStep: "r",
  objectiveRotationSpeed: "q",
} as const;

const expandedShareKeyMap = Object.fromEntries(
  Object.entries(shareKeyMap).map(([key, value]) => [value, key]),
) as Record<string, string>;

const FORBIDDEN_SHARE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function transformShareObject<T>(value: T, keyMap: Record<string, string>): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformShareObject(item, keyMap)) as unknown as T;
  }

  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const mappedKey = keyMap[key] || key;
    if (FORBIDDEN_SHARE_KEYS.has(mappedKey)) {
      continue;
    }
    result[mappedKey] = transformShareObject(nestedValue, keyMap);
  }
  return result as T;
}

export function compactSharedAppState<T>(value: T): T {
  return transformShareObject(value, shareKeyMap);
}

export function expandSharedAppState<T>(value: T): T {
  return transformShareObject(value, expandedShareKeyMap);
}

export function buildSharedStatePatch(sharedState: SharedAppState): Partial<State> {
  const mappedVertices = Array.isArray(sharedState.vertices)
    ? sharedState.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }))
    : [];

  return {
    vertices: mappedVertices,
    completionMode: sharedState.completionMode ?? (mappedVertices.length > 2 ? "closed" : "draft"),
    objectiveVector: sharedState.objective ? { x: sharedState.objective.x, y: sharedState.objective.y } : null,
    solverMode: sharedState.solverMode,
    ...(sharedState.zScale !== undefined ? { zScale: sharedState.zScale } : {}),
    ...(sharedState.zAxisOffsetOnly !== undefined ? { zAxisOffsetOnly: sharedState.zAxisOffsetOnly } : {}),
  };
}
