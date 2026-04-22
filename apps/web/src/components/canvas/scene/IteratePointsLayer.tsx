import { useLayoutEffect, useMemo, useRef } from "react";
import { Box3, BufferGeometry, Color, type PointsMaterial, Sphere, Vector3 } from "three";

import { useLpvizStore } from "@/features/core/store";
import type { State } from "@/features/core/store";
import { useViewportRenderSnapshot } from "@/features/viewport/r3f/snapshot";
import type { PointXY } from "@lpviz/math/blas";
import { RENDER_ORDER } from "./renderOrder";
import { shallowEqual } from "./shallowEqual";
import { SHARED_CIRCLE_TEXTURE } from "./sharedTextures";
import { shouldRenderSnapshotMode } from "./sceneVisibility";

const ITERATE_POINT_COLOR = "#800080";
const PHASE_COLORS = [
  "#e41a1c",
  "#377eb8",
  "#4daf4a",
  "#984ea3",
  "#ff7f00",
  "#ffff33",
  "#a65628",
  "#f781bf",
  "#999999",
  "#17becf",
];
// Pre-compute linear RGB tuples to avoid per-iteration setStyle → setHex → SRGBToLinear calls.
const PHASE_COLORS_LINEAR: ReadonlyArray<readonly [number, number, number]> =
  PHASE_COLORS.map((hex) => {
    const c = new Color(hex);
    return [c.r, c.g, c.b] as const;
  });
const ITERATE_Z = 0.03;
const ITERATE_POINT_PIXEL_SIZE = 8;
const ITERATE_POINTS_RENDER_ORDER = RENDER_ORDER.iteratePoints;

type IteratePointsLayerState = {
  iteratePath: State["iteratePath"];
  iteratePhases: State["iteratePhases"];
  iterateObjectiveVector: PointXY | null;
  zScale: number;
  zAxisOffsetOnly: boolean;
  is3DMode: boolean;
  isTransitioning3D: boolean;
};

const selectIteratePointsLayerState = (
  state: State,
): IteratePointsLayerState => ({
  iteratePath: state.iteratePath,
  iteratePhases: state.iteratePhases,
  iterateObjectiveVector: state.iterateObjectiveVector,
  zScale: state.zScale,
  zAxisOffsetOnly: state.zAxisOffsetOnly,
  is3DMode: state.is3DMode,
  isTransitioning3D: state.isTransitioning3D,
});

function getDisplayedIterateZ(
  entry: ReadonlyArray<number>,
  objectiveVector: PointXY | null,
  zAxisOffsetOnly: boolean,
) {
  const objectiveValue = objectiveVector
    ? objectiveVector.x * entry[0]! + objectiveVector.y * entry[1]!
    : 0;
  const totalValue = entry[2] !== undefined ? entry[2]! : objectiveValue;
  return zAxisOffsetOnly ? totalValue - objectiveValue : totalValue;
}

function buildIteratePointGeometry(
  state: IteratePointsLayerState,
  mode: ReturnType<typeof useViewportRenderSnapshot>["mode"],
) {
  if (
    state.iteratePath.length === 0 ||
    !shouldRenderSnapshotMode(mode, state)
  ) {
    return {
      positions: new Float32Array(),
      colors: null as Float32Array | null,
    };
  }

  const is3D = mode === "3d";
  const positions = new Float32Array(state.iteratePath.length * 3);
  const hasPhases =
    state.iteratePhases.length === state.iteratePath.length &&
    state.iteratePhases.length > 0;
  const colors = hasPhases
    ? new Float32Array(state.iteratePath.length * 3)
    : null;

  for (let index = 0; index < state.iteratePath.length; index += 1) {
    const entry = state.iteratePath[index]!;
    const baseIndex = index * 3;
    positions[baseIndex] = entry[0]!;
    positions[baseIndex + 1] = entry[1]!;
    positions[baseIndex + 2] = is3D
      ? (getDisplayedIterateZ(
          entry,
          state.iterateObjectiveVector,
          state.zAxisOffsetOnly,
        ) *
          state.zScale) /
          100 +
        ITERATE_Z
      : ITERATE_Z;

    if (colors) {
      const isLastPoint = index === state.iteratePath.length - 1;
      const phase = isLastPoint
        ? state.iteratePhases[index]!
        : state.iteratePhases[index + 1]!;
      const rgb = PHASE_COLORS_LINEAR[phase % PHASE_COLORS_LINEAR.length]!;
      colors[baseIndex] = rgb[0];
      colors[baseIndex + 1] = rgb[1];
      colors[baseIndex + 2] = rgb[2];
    }
  }

  return { positions, colors };
}

export function IteratePointsLayer() {
  const snapshot = useViewportRenderSnapshot();
  const iterateState = useLpvizStore(
    selectIteratePointsLayerState,
    shallowEqual,
  );
  const geometry = useMemo(
    () => buildIteratePointGeometry(iterateState, snapshot.mode),
    [iterateState, snapshot.mode],
  );

  const geoRef = useRef<BufferGeometry>(null);
  useLayoutEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    geo.boundingBox = new Box3(new Vector3(-1e10, -1e10, -1e10), new Vector3(1e10, 1e10, 1e10));
    geo.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e10);
    geo.computeBoundingBox = () => {};
    geo.computeBoundingSphere = () => {};
  }, []);

  const materialRef = useRef<PointsMaterial>(null);
  const hasColors = Boolean(geometry.colors);
  // r3f doesn't set material.needsUpdate when vertexColors changes, so the shader
  // won't recompile automatically. Set it explicitly so Three.js recompiles USE_COLOR.
  useLayoutEffect(() => {
    if (materialRef.current) materialRef.current.needsUpdate = true;
  }, [hasColors]);

  if (geometry.positions.length === 0) {
    return null;
  }

  return (
    <points renderOrder={ITERATE_POINTS_RENDER_ORDER} frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[geometry.positions, 3]}
        />
        {geometry.colors ? (
          <bufferAttribute
            attach="attributes-color"
            args={[geometry.colors, 3]}
          />
        ) : null}
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        color={geometry.colors ? "#ffffff" : ITERATE_POINT_COLOR}
        size={ITERATE_POINT_PIXEL_SIZE}
        sizeAttenuation={false}
        transparent
        depthTest={false}
        depthWrite={false}
        alphaMap={SHARED_CIRCLE_TEXTURE}
        alphaTest={0.2}
        vertexColors={hasColors}
      />
    </points>
  );
}
