import { getRenderBenchConfig, type RenderBenchConfig } from "@/bench/renderBenchConfig";
import { DEFAULT_VIEW_ANGLE, DEFAULT_Z_SCALE, setState, type State } from "@/features/core/store";
import { createViewportRuntime, type ViewportRuntime } from "@/features/viewport/runtime";
import { mountCanvasGL } from "@/ui/canvas/mountCanvasGL";
import "@/style.css";
import type { Lines, PointXY, PointXYZ, Vertices } from "@lpviz/math/types";
import { deriveRegionFromPoints } from "@lpviz/polytope/regionAssembly";
import { pdhgEq } from "@lpviz/solver-engine/pdhg_eq";
import type { ViewportBridge } from "@lpviz/viewport/types";

type BenchVariant = "optimized" | "old-trace-line-pool" | "old-bounds-recompute" | "old-line-distances" | "old-orbit-layer-updates" | "old-single-scene";
type BenchScenario = "rotate-trace" | "orbit-complete-trace" | "draw-complete-trace";

type FrameMetrics = {
  totalMs: number;
  layerUpdateMs: number;
  renderMs: number;
};

type RotationFrame = {
  objectiveVector: PointXY;
  path: Float64Array[];
};

type BenchMetadata = {
  variant: BenchVariant;
  shape: string;
  constraints: number;
  rotationSteps: number;
  totalTracePoints: number;
  maxit: number;
  angleStep: number;
  sweepFraction: number;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  browser: {
    userAgent: string;
    platform: string;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    webglVendor?: string;
    webglRenderer?: string;
    webglVersion?: string;
  };
  config: RenderBenchConfig;
};

type BenchResult = {
  variant: BenchVariant;
  scenario: BenchScenario;
  reps: number;
  samples: FrameMetrics[];
};

type RenderRotationBenchApi = {
  describeScene(): BenchMetadata;
  run(options: { scenario: BenchScenario; reps?: number }): Promise<BenchResult>;
  cleanup(): Promise<void>;
};

type ScenarioSummary = {
  medianMs: number;
  p05Ms: number;
  p95Ms: number;
  trialMediansMs: number[];
  sampleCount: number;
  layerUpdateMedianMs: number;
  renderMedianMs: number;
};

type VariantSummary = {
  variant: BenchVariant;
  label: string;
  rotateTrace: ScenarioSummary;
  orbitCompleteTrace: ScenarioSummary;
  ratiosVsOptimized: {
    rotateTrace: number;
    orbitCompleteTrace: number;
  };
};

type BrowserOutput = {
  generatedAt: string;
  note: string;
  parameters: LauncherOptions;
  metadata: BenchMetadata;
  summaries: VariantSummary[];
  rawResults: BenchResult[];
};

type LauncherOptions = {
  shape: string;
  maxit: number;
  angleStep: number;
  sweepFraction: number;
  trials: number;
  rotationReps: number;
  orbitReps: number;
  viewport: { width: number; height: number };
  variants: BenchVariant[];
};

declare global {
  interface Window {
    __LPVIZ_RENDER_BENCH__?: RenderRotationBenchApi;
    __LPVIZ_RENDER_BENCH_CONFIG__?: RenderBenchConfig;
  }
}

const VARIANT_LABELS: Record<BenchVariant, string> = {
  optimized: "Optimized",
  "old-trace-line-pool": "Old trace Line2 pool",
  "old-bounds-recompute": "Naive bounds/frustum culling",
  "old-line-distances": "Naive line distances",
  "old-orbit-layer-updates": "Old orbit layer updates",
  "old-single-scene": "Naive single scene",
};

const DEFAULT_VARIANTS: BenchVariant[] = ["optimized", "old-trace-line-pool", "old-bounds-recompute", "old-line-distances", "old-orbit-layer-updates", "old-single-scene"];

const pageParams = new URLSearchParams(window.location.search);
if (pageParams.get("worker") === "1") {
  await runWorker(pageParams);
} else {
  runLauncher();
}

function runLauncher(): void {
  const root = getRoot();
  root.replaceChildren();
  document.body.style.overflow = "auto";
  document.body.style.textAlign = "left";

  const style = document.createElement("style");
  style.textContent = `
    .bench-page { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
    .bench-page h1 { margin-top: 0; }
    .bench-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; max-width: 1100px; }
    .bench-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    .bench-field input { font: inherit; padding: 6px 8px; }
    .bench-variants { display: flex; flex-wrap: wrap; gap: 12px 18px; margin: 16px 0; }
    .bench-actions { display: flex; gap: 12px; align-items: center; margin: 16px 0; }
    .bench-actions button, .bench-actions a { font: inherit; padding: 8px 12px; border: 1px solid #333; border-radius: 6px; background: #fff; color: #111; text-decoration: none; cursor: pointer; }
    .bench-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
    .bench-log { white-space: pre-wrap; background: #111; color: #e8e8e8; padding: 12px; min-height: 120px; max-height: 300px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .bench-frame-wrap { margin-top: 18px; overflow: auto; border: 1px solid #bbb; max-width: 100%; background: #f8f8f8; }
    .bench-frame-wrap iframe { display: block; border: 0; background: #fff; }
    .bench-output { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 18px; max-width: 1100px; }
    .bench-output textarea { width: 100%; min-height: 180px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  `;
  document.head.append(style);

  const page = document.createElement("div");
  page.className = "bench-page";
  page.innerHTML = `
    <h1>LPViz rendering benchmark</h1>
    <p>Configure the workload, then click <strong>Run benchmark</strong>. The benchmark renders in the visible frame below; no headless browser or Playwright driver is used.</p>
    <div class="bench-grid">
      <label class="bench-field">Shape <input id="bench-shape" value="square" /></label>
      <label class="bench-field">maxit <input id="bench-maxit" type="number" value="1000" min="1" /></label>
      <label class="bench-field">Angle step <input id="bench-angle-step" type="number" value="0.001" step="0.001" min="0.000001" /></label>
      <label class="bench-field">Sweep fraction <input id="bench-sweep-fraction" type="number" value="0.25" step="0.01" min="0.000001" max="1" /></label>
      <label class="bench-field">Trials <input id="bench-trials" type="number" value="5" min="1" /></label>
      <label class="bench-field">Rotation reps <input id="bench-rotation-reps" type="number" value="30" min="1" /></label>
      <label class="bench-field">Orbit reps <input id="bench-orbit-reps" type="number" value="60" min="1" /></label>
      <label class="bench-field">Viewport width <input id="bench-vw" type="number" value="1600" min="1" /></label>
      <label class="bench-field">Viewport height <input id="bench-vh" type="number" value="1200" min="1" /></label>
    </div>
    <div class="bench-variants" id="bench-variants"></div>
    <div class="bench-actions">
      <button id="bench-run">Run benchmark</button>
      <a id="bench-download-json" download>Download JSON</a>
      <a id="bench-download-md" download>Download Markdown</a>
      <a id="bench-download-tex" download>Download LaTeX</a>
    </div>
    <div class="bench-log" id="bench-log">Ready.</div>
    <div class="bench-frame-wrap" id="bench-frame-wrap"></div>
    <div class="bench-output">
      <label>Markdown<textarea id="bench-md" readonly></textarea></label>
      <label>LaTeX<textarea id="bench-tex" readonly></textarea></label>
    </div>
  `;
  root.append(page);

  const variantsHost = getElement<HTMLDivElement>("bench-variants");
  for (const variant of DEFAULT_VARIANTS) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" value="${variant}" checked /> ${VARIANT_LABELS[variant]}`;
    variantsHost.append(label);
  }

  const runButton = getElement<HTMLButtonElement>("bench-run");
  runButton.addEventListener("click", () => {
    void runFromUi().catch((error) => {
      log(`ERROR: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      runButton.disabled = false;
    });
  });
}

async function runFromUi(): Promise<void> {
  const runButton = getElement<HTMLButtonElement>("bench-run");
  runButton.disabled = true;
  clearDownloads();
  getElement<HTMLTextAreaElement>("bench-md").value = "";
  getElement<HTMLTextAreaElement>("bench-tex").value = "";
  log("Starting benchmark…");

  try {
    const options = readLauncherOptions();
    const rawResults: BenchResult[] = [];
    const partial = new Map<
      BenchVariant,
      {
        rotateSamples: FrameMetrics[];
        orbitSamples: FrameMetrics[];
        rotateTrialMedians: number[];
        orbitTrialMedians: number[];
      }
    >();
    let metadata: BenchMetadata | null = null;

    for (const variant of options.variants) {
      const bucket = {
        rotateSamples: [] as FrameMetrics[],
        orbitSamples: [] as FrameMetrics[],
        rotateTrialMedians: [] as number[],
        orbitTrialMedians: [] as number[],
      };
      partial.set(variant, bucket);
      for (let trial = 0; trial < options.trials; trial++) {
        log(`Running ${VARIANT_LABELS[variant]} trial ${trial + 1}/${options.trials}`);
        const trialResult = await runOneTrial(options, variant);
        metadata ??= trialResult.metadata;
        rawResults.push(trialResult.rotate, trialResult.orbit);
        bucket.rotateSamples.push(...trialResult.rotate.samples);
        bucket.orbitSamples.push(...trialResult.orbit.samples);
        bucket.rotateTrialMedians.push(median(trialResult.rotate.samples.map((sample) => sample.totalMs)));
        bucket.orbitTrialMedians.push(median(trialResult.orbit.samples.map((sample) => sample.totalMs)));
      }
    }

    if (!metadata) throw new Error("No benchmark metadata collected");
    const optimizedBucket = partial.get("optimized");
    if (!optimizedBucket) throw new Error("Optimized variant is required");
    const optimizedRotate = summarizeSamples(optimizedBucket.rotateSamples, optimizedBucket.rotateTrialMedians);
    const optimizedOrbit = summarizeSamples(optimizedBucket.orbitSamples, optimizedBucket.orbitTrialMedians);

    const summaries = options.variants.map((variant) => {
      const bucket = partial.get(variant);
      if (!bucket) throw new Error(`Missing results for ${variant}`);
      const rotateTrace = summarizeSamples(bucket.rotateSamples, bucket.rotateTrialMedians);
      const orbitCompleteTrace = summarizeSamples(bucket.orbitSamples, bucket.orbitTrialMedians);
      return {
        variant,
        label: VARIANT_LABELS[variant],
        rotateTrace,
        orbitCompleteTrace,
        ratiosVsOptimized: {
          rotateTrace: rotateTrace.medianMs / optimizedRotate.medianMs,
          orbitCompleteTrace: orbitCompleteTrace.medianMs / optimizedOrbit.medianMs,
        },
      } satisfies VariantSummary;
    });

    const output: BrowserOutput = {
      generatedAt: new Date().toISOString(),
      note: "Manual in-browser rendering benchmark. Non-optimized variants cover source-backed old paths and naive Three.js baselines: pre-822e411 per-trace Line2 updates, pre-6e22a89/f227be2 geometry bounds/frustum culling, naive Line2 line-distance recomputation, pre-2995c65/34189c5 camera frames that update all layers, and a single-Scene renderer baseline.",
      parameters: options,
      metadata,
      summaries,
      rawResults,
    };
    const timestamp = formatTimestamp(new Date());
    const markdown = renderMarkdown(metadata, summaries);
    const latex = renderLatex(metadata, summaries);
    const json = `${JSON.stringify(output, null, 2)}\n`;
    getElement<HTMLTextAreaElement>("bench-md").value = markdown;
    getElement<HTMLTextAreaElement>("bench-tex").value = latex;
    setDownload("bench-download-json", `render-rotation-${timestamp}.json`, json, "application/json");
    setDownload("bench-download-md", `render-rotation-${timestamp}.md`, markdown, "text/markdown");
    setDownload("bench-download-tex", `render-rotation-${timestamp}.tex`, latex, "application/x-tex");
    log("Done. Use the download links above to save JSON/Markdown/LaTeX.");
  } finally {
    runButton.disabled = false;
  }
}

async function runOneTrial(
  options: LauncherOptions,
  variant: BenchVariant,
): Promise<{
  metadata: BenchMetadata;
  rotate: BenchResult;
  orbit: BenchResult;
}> {
  const iframe = document.createElement("iframe");
  let api: RenderRotationBenchApi | null = null;
  try {
    iframe.width = String(options.viewport.width);
    iframe.height = String(options.viewport.height);
    iframe.style.width = `${options.viewport.width}px`;
    iframe.style.height = `${options.viewport.height}px`;
    getElement<HTMLDivElement>("bench-frame-wrap").replaceChildren(iframe);
    iframe.src = buildWorkerUrl(options, variant);
    api = await waitForWorkerApi(iframe);
    const metadata = api.describeScene();
    log(`  constraints=${metadata.constraints}, rotationSteps=${metadata.rotationSteps}, totalTracePoints=${metadata.totalTracePoints}`);
    const rotate = await api.run({
      scenario: "rotate-trace",
      reps: options.rotationReps,
    });
    const orbit = await api.run({
      scenario: "orbit-complete-trace",
      reps: options.orbitReps,
    });
    return { metadata, rotate, orbit };
  } finally {
    if (api) {
      await api.cleanup().catch((error) => log(`  cleanup warning: ${error instanceof Error ? error.message : String(error)}`));
    }
    iframe.src = "about:blank";
    iframe.remove();
    await releaseMemoryTurn();
  }
}

function readLauncherOptions(): LauncherOptions {
  const variants = Array.from(getElement<HTMLDivElement>("bench-variants").querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")).map((input) => parseVariant(input.value));
  const uniqueVariants = Array.from(new Set(variants));
  if (!uniqueVariants.includes("optimized")) uniqueVariants.unshift("optimized");
  return {
    shape: getElement<HTMLInputElement>("bench-shape").value.trim() || "square",
    maxit: Math.max(1, Math.floor(Number(getElement<HTMLInputElement>("bench-maxit").value))),
    angleStep: Math.max(1e-6, Number(getElement<HTMLInputElement>("bench-angle-step").value)),
    sweepFraction: Math.min(1, Math.max(1e-6, Number(getElement<HTMLInputElement>("bench-sweep-fraction").value))),
    trials: Math.max(1, Math.floor(Number(getElement<HTMLInputElement>("bench-trials").value))),
    rotationReps: Math.max(1, Math.floor(Number(getElement<HTMLInputElement>("bench-rotation-reps").value))),
    orbitReps: Math.max(1, Math.floor(Number(getElement<HTMLInputElement>("bench-orbit-reps").value))),
    viewport: {
      width: Math.max(1, Math.floor(Number(getElement<HTMLInputElement>("bench-vw").value))),
      height: Math.max(1, Math.floor(Number(getElement<HTMLInputElement>("bench-vh").value))),
    },
    variants: uniqueVariants,
  };
}

function buildWorkerUrl(options: LauncherOptions, variant: BenchVariant): string {
  const params = new URLSearchParams({
    worker: "1",
    variant,
    shape: options.shape,
    maxit: String(options.maxit),
    angleStep: String(options.angleStep),
    sweepFraction: String(options.sweepFraction),
  });
  return `${window.location.pathname}?${params.toString()}`;
}

async function waitForWorkerApi(iframe: HTMLIFrameElement): Promise<RenderRotationBenchApi> {
  const start = performance.now();
  while (performance.now() - start < 10 * 60 * 1000) {
    const api = (
      iframe.contentWindow as
        | (Window &
            typeof globalThis & {
              __LPVIZ_RENDER_BENCH__?: RenderRotationBenchApi;
            })
        | null
    )?.__LPVIZ_RENDER_BENCH__;
    if (api) return api;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for benchmark iframe");
}

async function runWorker(params: URLSearchParams): Promise<void> {
  const variant = parseVariant(params.get("variant"));
  const shapeName = params.get("shape") ?? "square";
  const maxit = Math.max(1, Math.floor(Number(params.get("maxit") ?? "1000")));
  const angleStep = Math.max(1e-6, Number(params.get("angleStep") ?? params.get("angle-step") ?? "0.001"));
  const sweepFraction = Math.min(1, Math.max(1e-6, Number(params.get("sweepFraction") ?? params.get("sweep-fraction") ?? "0.25")));

  window.__LPVIZ_RENDER_BENCH_CONFIG__ = buildConfig(variant);

  const root = getRoot();
  root.replaceChildren();
  root.style.position = "fixed";
  root.style.inset = "0";
  document.body.style.overflow = "hidden";

  const vertices = buildShape(shapeName);
  const polytope = deriveRegionFromPoints(vertices, "closed");
  const lines: Lines = polytope.lines;
  const rotationSteps = Math.ceil((2 * Math.PI * sweepFraction) / angleStep);
  const rotationFrames = buildRotationFrames(lines, rotationSteps, angleStep, maxit);
  const fullTraceBuffer: State["traceBuffer"] = rotationFrames.map((frame) => ({
    path: frame.path,
    objectiveVector: frame.objectiveVector,
  }));
  const totalTracePoints = rotationFrames.reduce((sum, frame) => sum + frame.path.length, 0);
  const orbitAngles = buildOrbitAngles(180);

  const { viewport, bridge, destroy } = await mountBenchViewport(root);
  let disposed = false;
  seedBaseScene(rotationFrames, vertices, polytope, rotationSteps, maxit, angleStep);
  viewport.updateDimensions();
  viewport.setSidebarWidth(0);
  viewport.setControlsBlocked(true);
  viewport.set2DPanEnabled(false);
  viewport.zoomToFit(getVertexBounds(vertices), 0.16);
  await drawAndWait(bridge);

  window.__LPVIZ_RENDER_BENCH__ = {
    describeScene() {
      return {
        variant,
        shape: shapeName,
        constraints: lines.length,
        rotationSteps,
        totalTracePoints,
        maxit,
        angleStep,
        sweepFraction,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          deviceScaleFactor: window.devicePixelRatio,
        },
        browser: getBrowserInfo(bridge),
        config: getRenderBenchConfig(),
      };
    },
    async run({ scenario, reps }) {
      if (disposed) throw new Error("Benchmark worker has already been cleaned up");
      if (scenario === "draw-complete-trace") {
        seedCompletedRotation(rotationFrames, fullTraceBuffer, vertices, polytope, rotationSteps, maxit, angleStep);
        await drawAndWait(bridge);
        return { variant, scenario, reps: 1, samples: [getMetrics(bridge)] };
      }

      if (scenario === "rotate-trace") {
        const sampleCount = Math.min(rotationFrames.length, reps ?? 30);
        const samples: FrameMetrics[] = [];
        const startIndex = Math.max(0, rotationFrames.length - sampleCount);
        const tracePrefix = fullTraceBuffer.slice(0, startIndex);
        seedRotationStart(rotationFrames, tracePrefix, Math.max(0, startIndex - 1), vertices, polytope, rotationSteps, maxit, angleStep);
        await drawAndWait(bridge);
        for (let frameIndex = startIndex; frameIndex < rotationFrames.length; frameIndex++) {
          tracePrefix.push(fullTraceBuffer[frameIndex]!);
          setRotationFrame(rotationFrames, frameIndex, tracePrefix);
          await drawAndWait(bridge);
          samples.push(getMetrics(bridge));
        }
        return { variant, scenario, reps: samples.length, samples };
      }

      seedCompletedRotation(rotationFrames, fullTraceBuffer, vertices, polytope, rotationSteps, maxit, angleStep);
      await drawAndWait(bridge);
      const sampleCount = Math.min(orbitAngles.length, reps ?? 60);
      const samples: FrameMetrics[] = [];
      for (let index = 0; index < sampleCount; index++) {
        viewport.set3DViewAngle(orbitAngles[index]!);
        await drawAndWait(bridge);
        samples.push(getMetrics(bridge));
      }
      return { variant, scenario, reps: samples.length, samples };
    },
    async cleanup() {
      if (disposed) return;
      disposed = true;
      window.__LPVIZ_RENDER_BENCH__ = undefined;
      setState(
        {
          vertices: [],
          interiorPoint: null,
          polytope: null,
          objectiveVector: null,
          currentObjective: null,
          iteratePath: [],
          originalIteratePath: [],
          iteratePhases: [],
          originalIteratePhases: [],
          iterateRestartIndices: [],
          originalIterateRestartIndices: [],
          traceBuffer: [],
          maxTraceCount: 0,
          animationIntervalId: null,
        },
        {
          viewportDirty: {
            grid: true,
            polytope: true,
            constraints: true,
            objective: true,
            trace: true,
            iterate: true,
          },
        },
      );
      rotationFrames.length = 0;
      fullTraceBuffer.length = 0;
      orbitAngles.length = 0;
      vertices.length = 0;
      lines.length = 0;
      viewport.destroy();
      destroy();
      root.replaceChildren();
      await releaseMemoryTurn();
    },
  };
}

function parseVariant(value: string | null): BenchVariant {
  if (value === "old-trace-line-pool" || value === "old-bounds-recompute" || value === "old-line-distances" || value === "old-orbit-layer-updates" || value === "old-single-scene") return value;
  return "optimized";
}

function buildConfig(nextVariant: BenchVariant): RenderBenchConfig {
  if (nextVariant === "old-trace-line-pool") {
    return { legacyTraceLinePool: true };
  }
  if (nextVariant === "old-bounds-recompute") return { legacyBounds: true };
  if (nextVariant === "old-line-distances") return { computeLineDistances: true };
  if (nextVariant === "old-orbit-layer-updates") return { forceAllDirty: true };
  if (nextVariant === "old-single-scene") return { singleScene: true };
  return {};
}

function buildShape(name: string): Vertices {
  if (name !== "square") throw new Error(`Unsupported render benchmark shape: ${name}`);
  return [
    [-5, -5],
    [5, -5],
    [5, 5],
    [-5, 5],
  ];
}

function buildRotationFrames(benchmarkLines: Lines, steps: number, angleStep: number, maxit: number): RotationFrame[] {
  const frames: RotationFrame[] = [];
  for (let step = 0; step < steps; step++) {
    const theta = step * angleStep;
    const objectiveVector = { x: Math.cos(theta), y: Math.sin(theta) };
    const result = pdhgEq(benchmarkLines, new Float64Array([objectiveVector.x, objectiveVector.y]), {
      maxit,
      eta: 0.25,
      tau: 0.25,
      tol: 1e-4,
      verbose: false,
      halpern: false,
      colorByBasis: false,
    });
    const path = result.iterations.map((xy, index) => {
      const objectiveValue = objectiveVector.x * xy[0]! + objectiveVector.y * xy[1]!;
      return new Float64Array([xy[0]!, xy[1]!, objectiveValue + 500 * (result.eps[index] ?? 0)]);
    });
    frames.push({ objectiveVector, path });
  }
  return frames;
}

async function mountBenchViewport(parent: HTMLElement): Promise<{ viewport: ViewportRuntime; bridge: ViewportBridge; destroy: () => void }> {
  return await new Promise((resolve, reject) => {
    let destroyCanvas: (() => void) | null = null;
    const mounted = mountCanvasGL(parent, (bridge) => {
      void createViewportRuntime({ viewportBridge: bridge })
        .then((viewport) =>
          resolve({
            viewport,
            bridge,
            destroy: () => destroyCanvas?.(),
          }),
        )
        .catch(reject);
    });
    destroyCanvas = () => mounted.destroy();
  });
}

function seedBaseScene(rotationFrames: RotationFrame[], vertices: Vertices, polytope: ReturnType<typeof deriveRegionFromPoints>, rotationSteps: number, maxit: number, angleStep: number): void {
  const firstObjective = rotationFrames[0]?.objectiveVector ?? { x: 1, y: 0 };
  setState(
    {
      vertices: vertices.map(([x, y]) => ({ x, y })),
      completionMode: "closed",
      interiorPoint: { x: 0, y: 0 },
      polytope,
      inequalitiesMessage: null,
      objectiveVector: firstObjective,
      currentObjective: null,
      objectiveHidden: false,
      solverMode: "pdhg",
      solverSettings: {
        alphaMax: 0.1,
        correctorThreshold: 0.9,
        maxitIPM: 1000,
        simplexDualMode: false,
        pdhgEta: 0.25,
        pdhgTau: 0.25,
        maxitPDHG: maxit,
        pdhgIneqMode: false,
        pdhgHalpernMode: false,
        pdhgColorByBasis: false,
        centralPathIter: 75,
        objectiveAngleStep: angleStep,
        objectiveRotationSpeed: 1,
        replaySpeed: 10,
      },
      iteratePath: [],
      originalIteratePath: [],
      iteratePhases: [],
      originalIteratePhases: [],
      iterateRestartIndices: [],
      originalIterateRestartIndices: [],
      iterateObjectiveVector: firstObjective,
      originalIterateObjectiveVector: firstObjective,
      highlightIteratePathIndex: null,
      rotateObjectiveMode: false,
      animationIntervalId: null,
      is3DMode: true,
      isTransitioning3D: false,
      transitionDirection: null,
      transitionProgress: 0,
      viewAngle: { ...DEFAULT_VIEW_ANGLE },
      zScale: 24 * DEFAULT_Z_SCALE,
      traceEnabled: true,
      traceBuffer: [],
      maxTraceCount: rotationSteps,
      isNavigatingViewport: false,
    },
    {
      viewportDirty: {
        grid: true,
        polytope: true,
        constraints: true,
        objective: true,
        trace: true,
        iterate: true,
      },
    },
  );
}

function seedRotationStart(rotationFrames: RotationFrame[], traceBuffer: State["traceBuffer"], frameIndex: number, vertices: Vertices, polytope: ReturnType<typeof deriveRegionFromPoints>, rotationSteps: number, maxit: number, angleStep: number): void {
  seedBaseScene(rotationFrames, vertices, polytope, rotationSteps, maxit, angleStep);
  if (traceBuffer.length > 0 && rotationFrames[frameIndex]) setRotationFrame(rotationFrames, frameIndex, traceBuffer);
}

function setRotationFrame(rotationFrames: RotationFrame[], frameIndex: number, traceBuffer: State["traceBuffer"]): void {
  const frame = rotationFrames[frameIndex];
  if (!frame) return;
  setState(
    {
      objectiveVector: frame.objectiveVector,
      iteratePath: frame.path,
      originalIteratePath: frame.path.map((entry) => entry.slice()),
      iterateObjectiveVector: frame.objectiveVector,
      originalIterateObjectiveVector: frame.objectiveVector,
      traceBuffer,
    },
    { viewportDirty: { objective: true, iterate: true, trace: true } },
  );
}

function seedCompletedRotation(rotationFrames: RotationFrame[], fullTraceBuffer: State["traceBuffer"], vertices: Vertices, polytope: ReturnType<typeof deriveRegionFromPoints>, rotationSteps: number, maxit: number, angleStep: number): void {
  seedBaseScene(rotationFrames, vertices, polytope, rotationSteps, maxit, angleStep);
  setRotationFrame(rotationFrames, rotationFrames.length - 1, fullTraceBuffer);
}

function getVertexBounds(points: Vertices) {
  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function buildOrbitAngles(count: number): PointXYZ[] {
  return Array.from({ length: count }, (_, index) => ({
    x: DEFAULT_VIEW_ANGLE.x + 0.14 * Math.sin(index * 0.055),
    y: DEFAULT_VIEW_ANGLE.y + 0.34 * Math.cos(index * 0.045),
    z: DEFAULT_VIEW_ANGLE.z + 0.06 * Math.sin(index * 0.04),
  }));
}

async function drawAndWait(bridge: ViewportBridge): Promise<void> {
  if (bridge.drawAndWait) {
    await bridge.drawAndWait();
    return;
  }
  bridge.invalidate({ layers: false });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function releaseMemoryTurn(): Promise<void> {
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function getMetrics(bridge: ViewportBridge): FrameMetrics {
  return (
    bridge.getLastFrameMetrics?.() ?? {
      totalMs: 0,
      layerUpdateMs: 0,
      renderMs: 0,
    }
  );
}

function getBrowserInfo(bridge: ViewportBridge): BenchMetadata["browser"] {
  const info: BenchMetadata["browser"] = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  };
  if (navigator.hardwareConcurrency !== undefined) info.hardwareConcurrency = navigator.hardwareConcurrency;
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
  };
  if (navigatorWithMemory.deviceMemory !== undefined) info.deviceMemory = navigatorWithMemory.deviceMemory;
  const webglInfo = bridge.getWebGLInfo?.();
  if (webglInfo?.vendor) info.webglVendor = webglInfo.vendor;
  if (webglInfo?.renderer) info.webglRenderer = webglInfo.renderer;
  if (webglInfo?.version) info.webglVersion = webglInfo.version;
  return info;
}

function summarizeSamples(samples: FrameMetrics[], trialMedians: number[]): ScenarioSummary {
  return {
    medianMs: median(trialMedians),
    p05Ms: percentile(
      samples.map((sample) => sample.totalMs),
      0.05,
    ),
    p95Ms: percentile(
      samples.map((sample) => sample.totalMs),
      0.95,
    ),
    trialMediansMs: trialMedians,
    sampleCount: samples.length,
    layerUpdateMedianMs: median(samples.map((sample) => sample.layerUpdateMs)),
    renderMedianMs: median(samples.map((sample) => sample.renderMs)),
  };
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index]!;
}

function renderMarkdown(metadata: BenchMetadata, summaries: VariantSummary[]): string {
  return ["# Rendering rotation benchmark", "", `Shape: ${metadata.shape}; constraints: ${metadata.constraints}; maxit: ${metadata.maxit}; angle step: ${metadata.angleStep}; sweep fraction: ${metadata.sweepFraction}.`, `Rotation steps: ${metadata.rotationSteps}; total trace points: ${metadata.totalTracePoints.toLocaleString()}.`, "", "| Variant | Traced Rotate Time (ms) | vs Opt. | 3D Camera Move Time (ms) | vs Opt. |", "| --- | ---: | ---: | ---: | ---: |", ...summaries.map((entry) => `| ${entry.label} | ${fmt(entry.rotateTrace.medianMs)} | ${ratio(entry.ratiosVsOptimized.rotateTrace)} | ${fmt(entry.orbitCompleteTrace.medianMs)} | ${ratio(entry.ratiosVsOptimized.orbitCompleteTrace)} |`), ""].join("\n");
}

function renderLatex(_metadata: BenchMetadata, summaries: VariantSummary[]): string {
  const byVariant = new Map(summaries.map((entry) => [entry.variant, entry]));
  const ordered = ["optimized", "old-trace-line-pool", "old-bounds-recompute", "old-line-distances", "old-orbit-layer-updates", "old-single-scene"] as const;
  const rows = ordered.map((variant) => byVariant.get(variant)).filter((entry): entry is VariantSummary => Boolean(entry));
  const optimized = rows[0];
  const rest = rows.slice(1);
  const optimizedRow = optimized ? `{Optimized} & {${latexMs(optimized.rotateTrace.medianMs)}} & {${latexRatio(optimized.ratiosVsOptimized.rotateTrace)}} & {${latexMs(optimized.orbitCompleteTrace.medianMs)}} & {${latexRatio(optimized.ratiosVsOptimized.orbitCompleteTrace)}} \\\\` : "";
  const ablationRows = rest.map((entry) => `${entry.label} & ${latexMs(entry.rotateTrace.medianMs)} & ${latexRatio(entry.ratiosVsOptimized.rotateTrace)} & ${latexMs(entry.orbitCompleteTrace.medianMs)} & ${latexRatio(entry.ratiosVsOptimized.orbitCompleteTrace)} \\\\`).join("\n");
  return `\\begin{table}[t]
\\color{red}% %%%%%%%%%%%TODO REMOVE
\\centering
\\caption{Rendering performance benchmark against optimized render-loop paths and naive Three.js baselines: pre-822e411 trace line pool updates, pre-6e22a89/f227be2 geometry bounds/frustum culling, line-distance recomputation for dashed-line support, pre-2995c65/34189c5 all-layer orbit updates, and a single-Scene renderer. Workload: traced quarter-rotation using PDHG equality on a problem with 4 constraints, \\texttt{maxit}=1000, and angle step \\(0.001\\).}
\\label{tab:renderperf}
\\begin{tabular}{l@{\\hspace{0em}}rrrr}
\\toprule
& \\multicolumn{2}{c}{Traced Rotate} & \\multicolumn{2}{c}{3D Camera Move} \\\\
\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}
Variant & Time (ms) & vs Opt. & Time (ms) & vs Opt. \\\\
\\midrule
${optimizedRow}
\\midrule
${ablationRows}
\\bottomrule
\\end{tabular}
\\end{table}
}
`;
}

function latexMs(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

function latexRatio(value: number): string {
  const formatted = value >= 100 ? String(Math.round(value)) : value.toFixed(1);
  return `${formatted}$\\times$`;
}

function fmt(value: number): string {
  return value.toFixed(2);
}

function ratio(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function setDownload(id: string, filename: string, content: string, type: string): void {
  const link = getElement<HTMLAnchorElement>(id);
  URL.revokeObjectURL(link.href);
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
}

function clearDownloads(): void {
  for (const id of ["bench-download-json", "bench-download-md", "bench-download-tex"]) {
    const link = getElement<HTMLAnchorElement>(id);
    if (link.href) URL.revokeObjectURL(link.href);
    link.removeAttribute("href");
  }
}

function log(message: string): void {
  const el = getElement<HTMLDivElement>("bench-log");
  el.textContent = `${el.textContent === "Ready." ? "" : `${el.textContent}\n`}${message}`;
  el.scrollTop = el.scrollHeight;
}

function getRoot(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) throw new Error('Element with id "root" not found');
  return root;
}

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
}
