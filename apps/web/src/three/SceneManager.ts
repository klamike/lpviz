import {
  Scene,
  WebGLRenderer,
  Camera,
} from "three";
import { LayerHost } from "./LayerHost";
import type { Layer } from "./Layer";
import type { SceneContext } from "./SceneContext";
import { getViewportRenderSnapshot } from "@/features/viewport/runtime/snapshot";
import { getState } from "@/features/core/store";
import { getCurrentMouse } from "@/features/core/currentMouse";

export type Size = { width: number; height: number; dpr: number };

export class SceneManager {
  readonly scene = new Scene();
  readonly renderer: WebGLRenderer;
  readonly layerHost = new LayerHost();

  private camera: Camera | null = null;
  private dirty = true;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private ticks = new Set<(ctx: SceneContext) => void>();

  private _size: Size = { width: 0, height: 0, dpr: 1 };
  private sizeListeners = new Set<(size: Size) => void>();

  readonly sizeSignal = {
    subscribe: (fn: (size: Size) => void): (() => void) => {
      this.sizeListeners.add(fn);
      return () => {
        this.sizeListeners.delete(fn);
      };
    },
    get: (): Size => this._size,
  };

  private readonly ctx: SceneContext;

  constructor(
    canvas: HTMLCanvasElement,
    options: { dpr: [number, number] },
  ) {
    const [minDpr, maxDpr] = options.dpr;
    const dpr = Math.min(maxDpr, Math.max(minDpr, window.devicePixelRatio));

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(dpr);

    this._size = {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      dpr,
    };
    this.renderer.setSize(this._size.width, this._size.height, false);

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        this.setSize(width, height);
      }
    });
    this.resizeObserver.observe(canvas);

    this.ctx = {
      scene: this.scene,
      size: this._size,
      getSnapshot: getViewportRenderSnapshot,
      getFullSnapshot: getViewportRenderSnapshot,
      getState,
      getCurrentMouse,
      invalidate: () => this.invalidate(),
    };
  }

  private setSize(width: number, height: number): void {
    const dpr = Math.min(
      2,
      Math.max(1, window.devicePixelRatio),
    );
    if (
      this._size.width === width &&
      this._size.height === height &&
      this._size.dpr === dpr
    ) {
      return;
    }
    this._size = { width, height, dpr };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.sizeListeners.forEach((fn) => fn(this._size));
    this.invalidate();
  }

  start(): void {
    if (this.disposed || this.rafId !== null) {
      return;
    }
    this.loop();
  }

  private loop = (): void => {
    if (this.disposed) {
      return;
    }
    this.rafId = requestAnimationFrame(this.loop);

    if (!this.dirty) {
      return;
    }
    this.dirty = false;

    // Update layers
    this.layerHost.update(this.ctx);

    // Run registered ticks
    for (const tick of this.ticks) {
      tick(this.ctx);
    }

    if (this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  invalidate(): void {
    if (!this.dirty) {
      this.dirty = true;
    }
  }

  setCamera(cam: Camera): void {
    this.camera = cam;
    this.invalidate();
  }

  addLayer(layer: Layer): void {
    this.layerHost.add(layer);
    this.scene.add(layer.object3D);
    this.invalidate();
  }

  removeLayer(layer: Layer): void {
    this.layerHost.remove(layer);
    this.scene.remove(layer.object3D);
    this.invalidate();
  }

  addTick(fn: (ctx: SceneContext) => void): void {
    this.ticks.add(fn);
  }

  removeTick(fn: (ctx: SceneContext) => void): void {
    this.ticks.delete(fn);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.layerHost.dispose();
    for (const child of [...this.scene.children]) {
      this.scene.remove(child);
    }

    this.renderer.dispose();
  }
}
