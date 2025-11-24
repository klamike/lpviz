import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  PointsMaterial,
  Shape,
  ShapeGeometry,
} from "three";
import type { PointXY } from "../../solvers/utils/blas";
import { COLORS } from "../../ui/rendering/constants";
import {
  buildArrowHeadSegments,
  clipLineToBounds,
  type Bounds,
} from "../../ui/rendering/geometry";
import { useStoreSelector } from "../hooks/useStoreSelector";
import { InteractionLayer } from "./InteractionLayer";

const GRID_EXTENT = 400;
const GRID_SPACING = 20;

function CameraRig() {
  const is3D = useStoreSelector(
    (state) => state.is3DMode || state.isTransitioning3D
  );
  const { size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const orthoHeight = 400;
  const orthoWidth = orthoHeight * aspect;

  if (is3D) {
    return (
      <>
        <PerspectiveCamera
          makeDefault
          position={[200, 180, 260]}
          fov={45}
          near={0.1}
          far={5000}
        />
        <OrbitControls enableRotate enablePan enableZoom makeDefault />
      </>
    );
  }

  return (
    <>
      <OrthographicCamera
        makeDefault
        left={-orthoWidth / 2}
        right={orthoWidth / 2}
        top={orthoHeight / 2}
        bottom={-orthoHeight / 2}
        near={-1000}
        far={1000}
        position={[0, 0, 100]}
        up={[0, 1, 0]}
      />
      <OrbitControls enableRotate={false} enablePan enableZoom makeDefault />
    </>
  );
}

function GridLines() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (let x = -GRID_EXTENT; x <= GRID_EXTENT; x += GRID_SPACING) {
      positions.push(x, -GRID_EXTENT, 0, x, GRID_EXTENT, 0);
    }
    for (let y = -GRID_EXTENT; y <= GRID_EXTENT; y += GRID_SPACING) {
      positions.push(-GRID_EXTENT, y, 0, GRID_EXTENT, y, 0);
    }

    const buffer = new BufferGeometry();
    buffer.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(positions), 3)
    );
    return buffer;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={-10} frustumCulled={false}>
      <lineBasicMaterial color="#c7ceda" depthTest depthWrite={false} />
    </lineSegments>
  );
}

function Axes() {
  const geometry = useMemo(() => {
    const positions = new Float32Array([
      -GRID_EXTENT,
      0,
      0,
      GRID_EXTENT,
      0,
      0,
      0,
      -GRID_EXTENT,
      0,
      0,
      GRID_EXTENT,
      0,
    ]);
    const buffer = new BufferGeometry();
    buffer.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return buffer;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={-9}>
      <lineBasicMaterial color="#888888" depthTest depthWrite={false} />
    </lineSegments>
  );
}

function buildShape(vertices: ReadonlyArray<PointXY>) {
  const shape = new Shape();
  if (vertices.length === 0) return shape;
  shape.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i += 1) {
    shape.lineTo(vertices[i].x, vertices[i].y);
  }
  shape.closePath();
  return shape;
}

function PolytopeFill() {
  const vertices = useStoreSelector((state) => state.vertices);
  const polytopeComplete = useStoreSelector((state) => state.polytopeComplete);

  const geometry = useMemo(() => {
    if (!polytopeComplete || vertices.length < 3) return null;
    const shape = buildShape(vertices);
    const geo = new ShapeGeometry(shape);
    return geo;
  }, [polytopeComplete, vertices]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={0}>
      <meshBasicMaterial
        color="#f2f5ff"
        transparent
        opacity={0.6}
        side={DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

function PolytopeOutline() {
  const vertices = useStoreSelector((state) => state.vertices);
  const polytopeComplete = useStoreSelector((state) => state.polytopeComplete);

  const geometry = useMemo(() => {
    if (vertices.length < 2) return null;
    const edgeCount = polytopeComplete
      ? vertices.length
      : Math.max(vertices.length - 1, 0);
    const positions: number[] = [];
    for (let i = 0; i < edgeCount; i += 1) {
      const nextIndex = (i + 1) % vertices.length;
      if (!polytopeComplete && nextIndex >= vertices.length) break;
      const start = vertices[i];
      const end = vertices[nextIndex];
      positions.push(start.x, start.y, 0, end.x, end.y, 0);
    }
    if (positions.length === 0) return null;
    const buffer = new BufferGeometry();
    buffer.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(positions), 3)
    );
    return buffer;
  }, [polytopeComplete, vertices]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial color="#111111" linewidth={1} depthTest={false} depthWrite={false} />
    </lineSegments>
  );
}

function PolytopeVertices() {
  const vertices = useStoreSelector((state) => state.vertices);

  const geometry = useMemo(() => {
    if (vertices.length === 0) return null;
    const buffer = new BufferGeometry();
    const positions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i += 1) {
      const v = vertices[i];
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = 0.5;
    }
    buffer.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return buffer;
  }, [vertices]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  const material = useMemo(
    () =>
      new PointsMaterial({
        color: "#111111",
        size: 18,
        sizeAttenuation: false,
        depthTest: false,
      }),
    []
  );

  useEffect(() => () => material.dispose(), [material]);

  return <points geometry={geometry} material={material} renderOrder={2} />;
}

function ObjectiveArrow() {
  const objective = useStoreSelector((state) => state.objectiveVector);
  if (!objective) return null;

  const length = Math.hypot(objective.x, objective.y);
  if (length < 1e-6) return null;
  const arrowColor = COLORS.objective;
  const baseZ = 0.15;
  const headLength = 10;
  const angle = Math.atan2(objective.y, objective.x);
  const headSegments = buildArrowHeadSegments(
    { x: objective.x, y: objective.y },
    angle,
    headLength
  );

  const shaftPositions = new Float32Array([
    0,
    0,
    baseZ,
    objective.x,
    objective.y,
    baseZ,
  ]);
  const shaftGeom = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(shaftPositions, 3));
    return geo;
  }, [shaftPositions]);

  useEffect(() => () => shaftGeom.dispose(), [shaftGeom]);

  const headGeometries = useMemo(() => {
    return headSegments.map(([x1, y1, x2, y2]) => {
      const g = new BufferGeometry();
      g.setAttribute(
        "position",
        new Float32BufferAttribute(new Float32Array([x1, y1, baseZ, x2, y2, baseZ]), 3)
      );
      return g;
    });
  }, [baseZ, headSegments]);
  useEffect(() => () => headGeometries.forEach((g) => g.dispose()), [headGeometries]);

  const material = useMemo(
    () => new PointsMaterial({ color: arrowColor, size: 0 }),
    [arrowColor]
  );
  useEffect(() => () => material.dispose(), [material]);

  return (
    <>
      <lineSegments geometry={shaftGeom} renderOrder={3}>
        <lineBasicMaterial color={arrowColor} depthTest depthWrite />
      </lineSegments>
      {headGeometries.map((geom, idx) => (
        <lineSegments key={idx} renderOrder={3} geometry={geom}>
          <lineBasicMaterial color={arrowColor} depthTest depthWrite />
        </lineSegments>
      ))}
    </>
  );
}

function ConstraintLines() {
  const polytope = useStoreSelector((state) => state.polytope);
  const is3D = useStoreSelector(
    (state) => state.is3DMode || state.isTransitioning3D
  );
  const lines = polytope?.lines ?? [];
  if (!lines.length) return null;

  const margin = 200;
  const bounds: Bounds = {
    minX: -GRID_EXTENT - margin,
    maxX: GRID_EXTENT + margin,
    minY: -GRID_EXTENT - margin,
    maxY: GRID_EXTENT + margin,
  };

  const geometries = useMemo(() => {
    return lines
      .map((line) => clipLineToBounds(line, bounds))
      .filter(Boolean)
      .map((segment) => {
        const [start, end] = segment!;
        const g = new BufferGeometry();
        g.setAttribute(
          "position",
          new Float32BufferAttribute(
            new Float32Array([start.x, start.y, 0, end.x, end.y, 0]),
            3
          )
        );
        return g;
      });
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, lines]);

  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  return (
    <>
      {geometries.map((geometry, idx) => (
        <lineSegments key={idx} geometry={geometry} renderOrder={1}>
          <lineBasicMaterial
            color={idx === 0 && is3D ? COLORS.polytopeHighlight : 0x646464}
            depthTest={is3D}
            depthWrite={is3D}
          />
        </lineSegments>
      ))}
    </>
  );
}

function TracePaths() {
  const traceEnabled = useStoreSelector((state) => state.traceEnabled);
  const traceBuffer = useStoreSelector((state) => state.traceBuffer);
  if (!traceEnabled || !traceBuffer || traceBuffer.length === 0) return null;

  const lineMaterial = useMemo(
    () =>
      new PointsMaterial({
        color: COLORS.trace,
        size: 0,
      }),
    []
  );
  useEffect(() => () => lineMaterial.dispose(), [lineMaterial]);

  const pointMaterial = useMemo(
    () =>
      new PointsMaterial({
        color: COLORS.trace,
        size: 6,
        sizeAttenuation: false,
        depthWrite: false,
        depthTest: false,
        transparent: false,
        opacity: 1,
      }),
    []
  );
  useEffect(() => () => pointMaterial.dispose(), [pointMaterial]);

  return (
    <>
      {traceBuffer.map((entry, idx) => {
        const positions = entry.lineData.positions;
        if (!positions.length) return null;

        const lineGeom = useMemo(() => {
          const g = new BufferGeometry();
          g.setAttribute("position", new Float32BufferAttribute(new Float32Array(positions), 3));
          return g;
        }, [positions]);
        const pointsGeom = useMemo(() => {
          const g = new BufferGeometry();
          g.setAttribute("position", new Float32BufferAttribute(new Float32Array(positions), 3));
          return g;
        }, [positions]);
        useEffect(() => () => lineGeom.dispose(), [lineGeom]);
        useEffect(() => () => pointsGeom.dispose(), [pointsGeom]);

        return (
          <group key={idx} renderOrder={3}>
            <lineSegments geometry={lineGeom}>
              <lineBasicMaterial color={COLORS.trace} depthTest depthWrite={false} transparent opacity={0.25} />
            </lineSegments>
            <points geometry={pointsGeom} material={pointMaterial} />
          </group>
        );
      })}
    </>
  );
}

function IteratePath() {
  const iteratePath = useStoreSelector((state) => state.iteratePath);
  const highlightIndex = useStoreSelector(
    (state) => state.highlightIteratePathIndex
  );
  if (!iteratePath || iteratePath.length === 0) return null;

  const positions = useMemo(() => {
    const arr = new Float32Array(iteratePath.length * 3);
    for (let i = 0; i < iteratePath.length; i += 1) {
      const entry = iteratePath[i];
      arr[i * 3] = entry[0];
      arr[i * 3 + 1] = entry[1];
      arr[i * 3 + 2] = entry[2] ?? 0;
    }
    return arr;
  }, [iteratePath]);

  const lineGeom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  const pointsGeom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useEffect(() => () => lineGeom.dispose(), [lineGeom]);
  useEffect(() => () => pointsGeom.dispose(), [pointsGeom]);

  const pointMaterial = useMemo(
    () =>
      new PointsMaterial({
        color: COLORS.iteratePath,
        size: 8,
        sizeAttenuation: false,
        depthTest: false,
      }),
    []
  );
  useEffect(() => () => pointMaterial.dispose(), [pointMaterial]);

  const highlightMaterial = useMemo(
    () =>
      new PointsMaterial({
        color: COLORS.iterateHighlight,
        size: 12,
        sizeAttenuation: false,
        depthTest: false,
      }),
    []
  );
  useEffect(() => () => highlightMaterial.dispose(), [highlightMaterial]);

  const highlightGeom = useMemo(() => {
    if (highlightIndex === null || highlightIndex >= iteratePath.length)
      return null;
    const g = new BufferGeometry();
    const idx = highlightIndex * 3;
    g.setAttribute(
      "position",
      new Float32BufferAttribute(
        new Float32Array([positions[idx], positions[idx + 1], positions[idx + 2]]),
        3
      )
    );
    return g;
  }, [highlightIndex, iteratePath.length, positions]);

  useEffect(() => () => highlightGeom?.dispose(), [highlightGeom]);

  return (
    <>
      <lineSegments geometry={lineGeom} renderOrder={4}>
        <lineBasicMaterial
          color={COLORS.iteratePath}
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
      <points geometry={pointsGeom} material={pointMaterial} renderOrder={4} />
      {highlightGeom ? (
        <points geometry={highlightGeom} material={highlightMaterial} renderOrder={5} />
      ) : null}
    </>
  );
}

function PreviewLine() {
  const vertices = useStoreSelector((state) => state.vertices);
  const polytopeComplete = useStoreSelector((state) => state.polytopeComplete);
  const currentMouse = useStoreSelector((state) => state.currentMouse);
  if (polytopeComplete || vertices.length === 0 || !currentMouse) return null;

  const last = vertices[vertices.length - 1];
  const positions = new Float32Array([last.x, last.y, 0.2, currentMouse.x, currentMouse.y, 0.2]);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      <lineBasicMaterial color="#111111" depthTest={false} depthWrite={false} />
    </lineSegments>
  );
}

export function SceneContent() {
  return (
    <>
      <CameraRig />
      <ambientLight intensity={0.75} />
      <InteractionLayer />
      <GridLines />
      <Axes />
      <PolytopeFill />
      <ConstraintLines />
      <PolytopeOutline />
      <PolytopeVertices />
      <PreviewLine />
      <ObjectiveArrow />
      <TracePaths />
      <IteratePath />
    </>
  );
}
