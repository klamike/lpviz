import { Box3, type BufferGeometry, Sphere, Vector3 } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

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
      transparent: opts.opacity < 1,
      opacity: opts.opacity,
    });
    materialCache.set(key, mat);
  }
  return mat;
}

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
