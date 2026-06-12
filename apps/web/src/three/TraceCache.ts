import { getState } from "@/features/core/store";
import { getViewportRenderSnapshot } from "@/features/viewport/runtime/snapshot";
import {
  CustomBlending,
  GLSL3,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { setPathRibbonResolution } from "./helpers/pathRibbon";

// World-anchored impostor for the trace/iterate render passes in 2D mode.
//
// During a camera drag the trace content is completely static, yet a direct
// render re-shades every vertex of every trace chunk on every frame — cost
// proportional to maxit x trace capacity. Instead, the two heavy passes are
// rendered once into an offscreen target covering the visible rect plus a
// pan margin, at the same device pixels-per-world-unit as the canvas, and
// camera frames composite that texture as a single world-anchored quad:
// panning costs one textured-quad draw regardless of how much trace exists.
//
// The cache re-renders only when the content changes (trace/iterate dirty),
// the zoom level changes, the view pans beyond the margin, or the canvas
// size changes. 3D and transition frames bypass it entirely (a perspective
// view cannot composite from an orthographic billboard).
const CACHE_MARGIN = 1.25;
// match the antialiasing of the default framebuffer so cached strokes look
// identical to directly rendered ones
const CACHE_SAMPLES = 4;
const MAX_CACHE_DIMENSION = 8192;

const QUAD_VERTEX_SHADER = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Rendering translucent strokes onto a transparent black target yields
// premultiplied alpha, so the composite uses (ONE, ONE_MINUS_SRC_ALPHA).
// The cache holds linear values (three renders into targets in linear);
// linearToOutputTexel applies the canvas's sRGB encode exactly once here.
const QUAD_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D map;
in vec2 vUv;
out vec4 outColor;

void main() {
  vec4 texel = texture(map, vUv);
  outColor = vec4(linearToOutputTexel(vec4(texel.rgb, 1.0)).rgb, texel.a);
}
`;

function sceneHasVisibleContent(scene: Scene): boolean {
  return scene.children.some((child) => child.visible);
}

export class TraceCache {
  private renderTarget: WebGLRenderTarget | null = null;
  private cacheCamera = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  private quadScene = new Scene();
  private quad: Mesh;
  private material: ShaderMaterial;
  private contentDirty = true;
  private cachedUnitsPerPixel = 0;
  private cachedCenterX = 0;
  private cachedCenterY = 0;
  private cachedHalfWidth = 0;
  private cachedHalfHeight = 0;
  private cachedPixelWidth = 0;
  private cachedPixelHeight = 0;

  constructor() {
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader: QUAD_FRAGMENT_SHADER,
      uniforms: { map: { value: null } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.quad = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  markContentDirty(): void {
    this.contentDirty = true;
  }

  // Prepares the impostor for the two trace passes. Returns the scene with
  // the composite quad when the cache applies (the caller renders it in
  // place of the passes), or null when they must render directly.
  prepare(
    renderer: WebGLRenderer,
    traceLinesScene: Scene,
    traceScene: Scene,
  ): Scene | null {
    const snapshot = getViewportRenderSnapshot();
    if (snapshot.mode !== "2d" || getState().isTransitioning3D) {
      // keep a stale billboard from surviving a round trip through 3D
      this.contentDirty = true;
      return null;
    }

    if (
      !sceneHasVisibleContent(traceLinesScene) &&
      !sceneHasVisibleContent(traceScene)
    ) {
      this.contentDirty = true;
      this.quad.visible = false;
      return this.quadScene;
    }

    const width = snapshot.width || 1;
    const height = snapshot.height || 1;
    const unitsPerPixel = snapshot.unitsPerPixel;
    const dpr = renderer.getPixelRatio();
    const pixelWidth = Math.min(
      MAX_CACHE_DIMENSION,
      Math.ceil(width * CACHE_MARGIN * dpr),
    );
    const pixelHeight = Math.min(
      MAX_CACHE_DIMENSION,
      Math.ceil(height * CACHE_MARGIN * dpr),
    );
    const halfVisibleWidth = (width * unitsPerPixel) / 2;
    const halfVisibleHeight = (height * unitsPerPixel) / 2;
    const centerX = snapshot.target.x;
    const centerY = snapshot.target.y;

    const panContained =
      centerX + halfVisibleWidth <= this.cachedCenterX + this.cachedHalfWidth &&
      centerX - halfVisibleWidth >= this.cachedCenterX - this.cachedHalfWidth &&
      centerY + halfVisibleHeight <=
        this.cachedCenterY + this.cachedHalfHeight &&
      centerY - halfVisibleHeight >= this.cachedCenterY - this.cachedHalfHeight;

    if (
      this.contentDirty ||
      unitsPerPixel !== this.cachedUnitsPerPixel ||
      pixelWidth !== this.cachedPixelWidth ||
      pixelHeight !== this.cachedPixelHeight ||
      !panContained
    ) {
      this.recache(renderer, traceLinesScene, traceScene, {
        width,
        height,
        unitsPerPixel,
        dpr,
        pixelWidth,
        pixelHeight,
        centerX,
        centerY,
      });
    }

    this.quad.visible = true;
    return this.quadScene;
  }

  private recache(
    renderer: WebGLRenderer,
    traceLinesScene: Scene,
    traceScene: Scene,
    view: {
      width: number;
      height: number;
      unitsPerPixel: number;
      dpr: number;
      pixelWidth: number;
      pixelHeight: number;
      centerX: number;
      centerY: number;
    },
  ): void {
    if (
      !this.renderTarget ||
      this.renderTarget.width !== view.pixelWidth ||
      this.renderTarget.height !== view.pixelHeight
    ) {
      this.renderTarget?.dispose();
      this.renderTarget = new WebGLRenderTarget(
        view.pixelWidth,
        view.pixelHeight,
        {
          samples: CACHE_SAMPLES,
          depthBuffer: false,
          stencilBuffer: false,
        },
      );
      this.material.uniforms.map!.value = this.renderTarget.texture;
    }

    // world extents derived from target pixels so the cache keeps exactly
    // the canvas's device pixels-per-world-unit (1:1 composite, no resample)
    const cssWidth = view.pixelWidth / view.dpr;
    const cssHeight = view.pixelHeight / view.dpr;
    const halfWidth = (cssWidth * view.unitsPerPixel) / 2;
    const halfHeight = (cssHeight * view.unitsPerPixel) / 2;

    const camera = this.cacheCamera;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(view.centerX, view.centerY, 10);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // screen-space line widths must be computed against the cache viewport
    setPathRibbonResolution(cssWidth, cssHeight);
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(traceLinesScene, camera);
    renderer.render(traceScene, camera);
    renderer.setRenderTarget(previousTarget);
    setPathRibbonResolution(view.width, view.height);

    this.quad.position.set(view.centerX, view.centerY, 0);
    this.quad.scale.set(halfWidth * 2, halfHeight * 2, 1);

    this.cachedUnitsPerPixel = view.unitsPerPixel;
    this.cachedCenterX = view.centerX;
    this.cachedCenterY = view.centerY;
    this.cachedHalfWidth = halfWidth;
    this.cachedHalfHeight = halfHeight;
    this.cachedPixelWidth = view.pixelWidth;
    this.cachedPixelHeight = view.pixelHeight;
    this.contentDirty = false;
  }

  dispose(): void {
    this.renderTarget?.dispose();
    this.renderTarget = null;
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
