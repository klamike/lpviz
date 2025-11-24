import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { DoubleSide, PlaneGeometry, Vector3 } from "three";
import type { Lines } from "../../solvers/utils/blas";
import { VRep, verticesFromLines } from "../../solvers/utils/polytope";
import { getState, mutate, setState } from "../../state/store";

/**
 * Transparent plane for pointer interactions. Adds vertices on click and toggles
 * polygon closure on double-click. Dragging: grab nearest vertex within a
 * screen-scaled radius and move it.
 */
export function InteractionLayer() {
  const { camera, size, viewport } = useThree();
  const geometry = useMemo(() => new PlaneGeometry(10000, 10000), []);
  const dragIndexRef = useRef<number | null>(null);
  const draggingObjectiveRef = useRef<boolean>(false);
  const constraintDragRef = useRef<{
    index: number;
    start: Vector3;
    normal: { x: number; y: number };
    lines: Lines;
  } | null>(null);

  const getWorldHitRadius = () => {
    const v = viewport.getCurrentViewport(camera, new Vector3(0, 0, 0), size);
    const unitsPerPixel = v.width / size.width;
    return unitsPerPixel * 12;
  };

  const maybeSnapPoint = (point: Vector3) => {
    const { snapToGrid } = getState();
    if (!snapToGrid) return point;
    const snapped = point.clone();
    snapped.x = Math.round(snapped.x);
    snapped.y = Math.round(snapped.y);
    return snapped;
  };

  const findNearestVertex = (point: Vector3) => {
    const { vertices } = getState();
    const threshold = getWorldHitRadius();
    let nearestIndex: number | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < vertices.length; i += 1) {
      const v = vertices[i];
      const dist = Math.hypot(v.x - point.x, v.y - point.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }
    if (nearestIndex === null || nearestDist > threshold) return null;
    return nearestIndex;
  };

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    const snapped = maybeSnapPoint(event.point);
    const { x, y } = snapped;
    if (constraintDragRef.current) {
      const { index, start, normal, lines } = constraintDragRef.current;
      const line = lines[index];
      const length = Math.hypot(line[0], line[1]);
      if (length > 0) {
        const delta = (x - start.x) * normal.x + (y - start.y) * normal.y;
        const shift = delta * length;
        const updatedLines = lines.map((l, i) =>
          i === index ? [l[0], l[1], l[2] + shift] : l
        ) as Lines;
        const updatedVertices = verticesFromLines(updatedLines);
        if (updatedVertices.length >= 2) {
          mutate((draft) => {
            draft.vertices = updatedVertices.map(([vx, vy]) => ({
              x: vx,
              y: vy,
            }));
            draft.polytopeComplete = updatedVertices.length >= 3;
          });
          constraintDragRef.current = {
            index,
            start: snapped.clone(),
            normal,
            lines: updatedLines,
          };
        }
      }
      return;
    }
    if (draggingObjectiveRef.current) {
      mutate((draft) => {
        draft.objectiveVector = { x, y };
      });
      return;
    }
    if (dragIndexRef.current !== null) {
      const idx = dragIndexRef.current;
      mutate((draft) => {
        draft.vertices[idx] = { x, y };
      });
      return;
    }
    setState({ currentMouse: { x, y } });
  }, []);

  const handlePointerLeave = useCallback(() => {
    dragIndexRef.current = null;
    constraintDragRef.current = null;
    setState({ currentMouse: null });
  }, []);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const snappedPoint = maybeSnapPoint(event.point);
    const state = getState();
    const { objectiveVector } = state;
    if (objectiveVector) {
      const distToObjective = Math.hypot(
        objectiveVector.x - snappedPoint.x,
        objectiveVector.y - snappedPoint.y
      );
      if (distToObjective <= getWorldHitRadius()) {
        draggingObjectiveRef.current = true;
        return;
      }
    }
    const nearestIndex = findNearestVertex(snappedPoint);
    if (nearestIndex !== null) {
      dragIndexRef.current = nearestIndex;
      return;
    }
    if (
      state.polytopeComplete &&
      state.vertices.length >= 3 &&
      state.polytope?.lines?.length
    ) {
      const edgeIndex = VRep.fromPoints(state.vertices).findEdgeNearPoint(
        { x: snappedPoint.x, y: snappedPoint.y },
        getWorldHitRadius()
      );
      if (edgeIndex !== null) {
        const line = state.polytope.lines[edgeIndex];
        constraintDragRef.current = {
          index: edgeIndex,
          start: snappedPoint.clone(),
          normal: { x: line[0], y: line[1] },
          lines: state.polytope.lines.map((l) => [...l]) as Lines,
        };
        return;
      }
    }
    const { x, y } = snappedPoint;
    mutate((draft) => {
      draft.vertices.push({ x, y });
      draft.polytopeComplete = false;
      draft.currentMouse = null;
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragIndexRef.current = null;
    draggingObjectiveRef.current = false;
    constraintDragRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    mutate((draft) => {
      if (draft.vertices.length >= 3) {
        draft.polytopeComplete = true;
      }
    });
  }, []);

  return (
    <mesh
      geometry={geometry}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      position={[0, 0, 0]}
      renderOrder={-20}
    >
      <meshBasicMaterial
        color="white"
        transparent
        opacity={0}
        side={DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
