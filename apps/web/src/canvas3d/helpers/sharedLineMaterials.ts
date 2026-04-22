import { Box3, type BufferGeometry, Sphere, Vector3 } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// ─── Shared LineMaterial cache ────────────────────────────────────────────────
// All line objects with identical visual properties share one LineMaterial
// instance. This lets Three.js skip redundant GPU state changes between draw
// calls that use the same material.

type LineMaterialKey = {
  color: string | number;
  linewidth: number;
  depthTest: boolean;
  depthWrite: boolean;
  opacity: number;
};

const materialCache = new Map<string, LineMaterial>();

function makeKey(k: LineMaterialKey): string {
  return `${k.color}|${k.linewidth}|${k.depthTest}|${k.depthWrite}|${k.opacity}`;
}

export function getSharedLineMaterial(opts: LineMaterialKey): LineMaterial {
  const key = makeKey(opts);
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new LineMaterial({
      color: opts.color,
      linewidth: opts.linewidth,
      depthTest: opts.depthTest,
      depthWrite: opts.depthWrite,
      transparent: true,
      opacity: opts.opacity,
    });
    materialCache.set(key, mat);
  }
  return mat;
}

// Called once per frame by SharedMaterialsController when canvas size changes.
let _lastW = 0;
let _lastH = 0;

export function tickSharedLineMaterialResolutions(w: number, h: number): void {
  if (w === _lastW && h === _lastH) return;
  _lastW = w;
  _lastH = h;
  materialCache.forEach((mat) => mat.resolution.set(w, h));
}

// ─── Bounding volume helpers ──────────────────────────────────────────────────
// Pre-set a huge bounding box/sphere and no-op the compute methods so
// setPositions() (which calls them internally) does no unnecessary work.

const HUGE = 1e10;
const HUGE_BOX = new Box3(
  new Vector3(-HUGE, -HUGE, -HUGE),
  new Vector3(HUGE, HUGE, HUGE),
);
const HUGE_SPHERE = new Sphere(new Vector3(0, 0, 0), HUGE);

export function applyHugeBounds(geo: BufferGeometry): void {
  geo.boundingBox = HUGE_BOX.clone();
  geo.boundingSphere = HUGE_SPHERE.clone();
  geo.computeBoundingBox = () => {};
  geo.computeBoundingSphere = () => {};
}
