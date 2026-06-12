import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  GLSL3,
  Mesh,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
} from "three";
import { applyHugeBounds } from "./sharedLineMaterials";

// Constant screen-width polyline rendering with true fat-line styling at a
// fraction of the cost of instanced fat lines (Line2): one miter-joined
// triangle strip per path, extruded in the vertex shader. Line2 expands every
// segment into a capped quad — at millions of sub-pixel segments that is
// orders of magnitude of redundant overdraw — while a ribbon rasterizes
// width x on-screen-length once for the whole path.
//
// The path lives in a float texture indexed by gl_VertexID (two vertices per
// point, no vertex attributes at all), so a path costs one RGBA32F texel per
// point of GPU memory and geometries share a single static index buffer.

const TEX_WIDTH = 4096;
const TEX_WIDTH_MASK = TEX_WIDTH - 1;
const TEX_WIDTH_SHIFT = 12;

// Shared by reference across every ribbon material; updated on resize via
// tickSharedLineMaterialResolutions (CSS pixels, matching LineMaterial).
const sharedResolution = new Vector2(1, 1);
export function setPathRibbonResolution(width: number, height: number): void {
  sharedResolution.set(width, height);
}

const VERTEX_SHADER = /* glsl */ `
uniform sampler2D pathTex;
uniform int pointCount;
uniform vec2 resolution;
uniform float linewidth;

vec3 fetchPoint(int i) {
  i = clamp(i, 0, pointCount - 1);
  return texelFetch(pathTex, ivec2(i & ${TEX_WIDTH_MASK}, i >> ${TEX_WIDTH_SHIFT}), 0).xyz;
}

void main() {
  int i = gl_VertexID >> 1;
  float side = ((gl_VertexID & 1) == 0) ? 1.0 : -1.0;

  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec4 clipCur = mvp * vec4(fetchPoint(i), 1.0);
  vec4 clipPrev = mvp * vec4(fetchPoint(i - 1), 1.0);
  vec4 clipNext = mvp * vec4(fetchPoint(i + 1), 1.0);

  vec2 half_res = 0.5 * resolution;
  vec2 sCur = clipCur.xy / clipCur.w * half_res;
  vec2 sPrev = clipPrev.xy / clipPrev.w * half_res;
  vec2 sNext = clipNext.xy / clipNext.w * half_res;

  vec2 dirA = sCur - sPrev;
  vec2 dirB = sNext - sCur;
  float lenA = length(dirA);
  float lenB = length(dirB);
  vec2 dA = lenA > 1e-4 ? dirA / lenA : vec2(0.0);
  vec2 dB = lenB > 1e-4 ? dirB / lenB : vec2(0.0);

  vec2 tangent = dA + dB;
  float tangentLen = length(tangent);
  vec2 dir;
  if (tangentLen > 1e-4) {
    dir = tangent / tangentLen;
  } else if (lenA > 1e-4) {
    dir = dA;
  } else if (lenB > 1e-4) {
    dir = dB;
  } else {
    dir = vec2(1.0, 0.0);
  }

  vec2 normal = vec2(-dir.y, dir.x);
  vec2 segNormal = lenB > 1e-4
    ? vec2(-dB.y, dB.x)
    : (lenA > 1e-4 ? vec2(-dA.y, dA.x) : normal);
  // miter widening, clamped so hairpin turns bevel instead of spiking
  float miter = 1.0 / clamp(abs(dot(normal, segNormal)), 0.5, 1.0);

  vec2 offsetPx = normal * (side * 0.5 * linewidth * miter);
  vec4 clip = clipCur;
  clip.xy += offsetPx / half_res * clip.w;
  gl_Position = clip;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 color;
uniform float opacity;
out vec4 outColor;

void main() {
  outColor = vec4(color, opacity);
}
`;

// One static index buffer shared by all ribbon geometries: triangles
// (2i, 2i+1, 2i+2) / (2i+1, 2i+3, 2i+2) stitch the per-point vertex pairs
// into a strip. Grown geometrically when a longer path appears.
let sharedIndex = new BufferAttribute(new Uint32Array(0), 1);

function ensureSharedIndex(pointCount: number): BufferAttribute {
  const needed = Math.max(0, pointCount - 1) * 6;
  if (sharedIndex.count >= needed) return sharedIndex;
  const capacity = Math.max(needed, sharedIndex.count * 2, 6 * 4096);
  const segments = Math.ceil(capacity / 6);
  const indices = new Uint32Array(segments * 6);
  for (let s = 0; s < segments; s++) {
    const v = 2 * s;
    const o = 6 * s;
    indices[o] = v;
    indices[o + 1] = v + 1;
    indices[o + 2] = v + 2;
    indices[o + 3] = v + 1;
    indices[o + 4] = v + 3;
    indices[o + 5] = v + 2;
  }
  sharedIndex = new BufferAttribute(indices, 1);
  return sharedIndex;
}

export type PathRibbonStyle = {
  color: string;
  opacity: number;
  linewidth: number;
};

export class PathRibbon {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private geometry: BufferGeometry;
  private texture: DataTexture | null = null;

  constructor(style: PathRibbonStyle) {
    // built-in materials encode their linear working-space color back to sRGB
    // at the end of the fragment shader; mirror that so the ribbon color
    // matches the rest of the palette exactly
    const color = new Color(style.color).convertLinearToSRGB();
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        pathTex: { value: null },
        pointCount: { value: 0 },
        resolution: { value: sharedResolution },
        linewidth: { value: style.linewidth },
        color: { value: color },
        opacity: { value: style.opacity },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
    this.geometry = new BufferGeometry();
    applyHugeBounds(this.geometry);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setDepth(enabled: boolean): void {
    this.material.depthTest = enabled;
    this.material.depthWrite = enabled;
  }

  // points: per-point [x, y, z]; writes a fresh path texture (build-once per
  // path — callers reuse ribbons only when the path itself is replaced)
  setPath(points: Float32Array, pointCount: number): void {
    this.texture?.dispose();
    const rows = Math.max(1, Math.ceil(pointCount / TEX_WIDTH));
    const data = new Float32Array(TEX_WIDTH * rows * 4);
    for (let i = 0; i < pointCount; i++) {
      data[i * 4] = points[i * 3]!;
      data[i * 4 + 1] = points[i * 3 + 1]!;
      data[i * 4 + 2] = points[i * 3 + 2]!;
      data[i * 4 + 3] = 1;
    }
    const texture = new DataTexture(
      data,
      TEX_WIDTH,
      rows,
      RGBAFormat,
      FloatType,
    );
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.texture = texture;

    this.material.uniforms.pathTex!.value = texture;
    this.material.uniforms.pointCount!.value = pointCount;
    this.geometry.setIndex(ensureSharedIndex(pointCount));
    this.geometry.setDrawRange(0, Math.max(0, pointCount - 1) * 6);
  }

  dispose(): void {
    this.texture?.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
