import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page } from "playwright";

type BenchVariant =
  | "optimized"
  | "old-trace-line-pool"
  | "old-bounds-recompute"
  | "old-orbit-layer-updates"
  | "old-single-scene";
type BenchScenario =
  | "rotate-trace"
  | "orbit-complete-trace"
  | "draw-complete-trace";

type FrameMetrics = {
  totalMs: number;
  layerUpdateMs: number;
  renderMs: number;
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
  browser: Record<string, unknown>;
  config: Record<string, unknown>;
};

type BenchRunResult = {
  variant: BenchVariant;
  scenario: BenchScenario;
  reps: number;
  samples: FrameMetrics[];
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

const args = process.argv.slice(2);
const getArgValue = (name: string, fallback: string) => {
  const flag = `--${name}`;
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1]! : fallback;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const port = Math.max(1024, Number(getArgValue("port", "4173")));
const shape = getArgValue("shape", "square");
const maxit = Math.max(1, Math.floor(Number(getArgValue("maxit", "1000"))));
const angleStep = Number(getArgValue("angle-step", "0.001"));
const sweepFraction = Math.min(
  1,
  Math.max(1e-6, Number(getArgValue("sweep-fraction", "0.25"))),
);
const trials = Math.max(1, Math.floor(Number(getArgValue("trials", "5"))));
const rotationReps = Math.max(
  1,
  Math.floor(Number(getArgValue("rotation-reps", "30"))),
);
const orbitReps = Math.max(
  1,
  Math.floor(Number(getArgValue("orbit-reps", "60"))),
);
const viewportWidth = Math.max(
  1,
  Math.floor(Number(getArgValue("viewport-width", "1600"))),
);
const viewportHeight = Math.max(
  1,
  Math.floor(Number(getArgValue("viewport-height", "1200"))),
);
const deviceScaleFactor = Number(getArgValue("device-scale-factor", "1"));
const selectedVariants = parseVariants(
  getArgValue(
    "variants",
    "optimized,old-trace-line-pool,old-bounds-recompute,old-orbit-layer-updates",
  ),
);

const VARIANT_LABELS: Record<BenchVariant, string> = {
  optimized: "Optimized",
  "old-trace-line-pool": "Old trace Line2 pool",
  "old-bounds-recompute": "Old bounds recompute",
  "old-orbit-layer-updates": "Old orbit layer updates",
  "old-single-scene": "Old single scene",
};

const SCENARIO_NAMES: Record<
  Exclude<BenchScenario, "draw-complete-trace">,
  string
> = {
  "rotate-trace": "Traced Rotate Time (ms)",
  "orbit-complete-trace": "3D Camera Move Time (ms)",
};

async function main() {
  const server = startViteServer(port);
  try {
    await waitForServer(`http://127.0.0.1:${port}/render-rotation-bench.html`);
    const browser = await chromium.launch({
      headless: hasFlag("headless"),
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
    });

    try {
      const metadata = await readMetadata(browser);
      printMetadata(metadata);

      const rawResults: BenchRunResult[] = [];
      const summaries: Omit<VariantSummary, "ratiosVsOptimized">[] = [];
      for (const variant of selectedVariants) {
        const measured = await measureVariant(browser, variant, rawResults);
        summaries.push({
          variant,
          label: VARIANT_LABELS[variant],
          rotateTrace: measured.rotateTrace,
          orbitCompleteTrace: measured.orbitCompleteTrace,
        });
      }

      const optimized = summaries.find(
        (entry) => entry.variant === "optimized",
      );
      if (!optimized) throw new Error("The optimized variant must be included");

      const completeSummaries: VariantSummary[] = summaries.map((entry) => ({
        ...entry,
        ratiosVsOptimized: {
          rotateTrace:
            entry.rotateTrace.medianMs / optimized.rotateTrace.medianMs,
          orbitCompleteTrace:
            entry.orbitCompleteTrace.medianMs /
            optimized.orbitCompleteTrace.medianMs,
        },
      }));

      const timestamp = formatTimestamp(new Date());
      const output = {
        generatedAt: new Date().toISOString(),
        command: process.argv.join(" "),
        note: "Non-optimized variants are source-backed old paths from perf commits: pre-822e411 per-trace Line2 updates, pre-6e22a89/f227be2 geometry bounds recomputation, and pre-2995c65/34189c5 camera frames that update all layers.",
        parameters: {
          shape,
          maxit,
          angleStep,
          sweepFraction,
          trials,
          rotationReps,
          orbitReps,
          viewport: {
            width: viewportWidth,
            height: viewportHeight,
            deviceScaleFactor,
          },
          variants: selectedVariants,
        },
        metadata,
        summaries: completeSummaries,
        rawResults,
      };

      await mkdir("bench-results", { recursive: true });
      const base = join("bench-results", `render-rotation-${timestamp}`);
      await writeFile(`${base}.json`, `${JSON.stringify(output, null, 2)}\n`);
      await writeFile(
        `${base}.md`,
        renderMarkdown(metadata, completeSummaries),
      );
      await writeFile(`${base}.tex`, renderLatex(metadata, completeSummaries));
      console.log(renderMarkdown(metadata, completeSummaries));
      console.log(`\nWrote ${base}.json, ${base}.md, and ${base}.tex`);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
    await onceExited(server);
  }
}

function parseVariants(value: string): BenchVariant[] {
  const variants = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const allowed = new Set<BenchVariant>([
    "optimized",
    "old-trace-line-pool",
    "old-bounds-recompute",
    "old-orbit-layer-updates",
    "old-single-scene",
  ]);
  const parsed = variants.filter((variant): variant is BenchVariant =>
    allowed.has(variant as BenchVariant),
  );
  return parsed.includes("optimized") ? parsed : ["optimized", ...parsed];
}

function startViteServer(portNumber: number) {
  const server = spawn(
    "bunx",
    [
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(portNumber),
      "--strictPort",
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => process.stderr.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return server;
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function onceExited(processHandle: ChildProcessWithoutNullStreams) {
  if (processHandle.exitCode !== null) return;
  await new Promise<void>((resolve) =>
    processHandle.once("exit", () => resolve()),
  );
}

function buildUrl(variant: BenchVariant) {
  const searchParams = new URLSearchParams({
    variant,
    shape,
    maxit: String(maxit),
    angleStep: String(angleStep),
    sweepFraction: String(sweepFraction),
  });
  return `http://127.0.0.1:${port}/render-rotation-bench.html?${searchParams.toString()}`;
}

async function openBenchPage(browser: Browser, variant: BenchVariant) {
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      process.stderr.write(`[browser:${variant}] ${message.text()}\n`);
    }
  });
  page.on("pageerror", (error) => {
    process.stderr.write(`[browser:${variant}] ${String(error)}\n`);
  });
  await page.goto(buildUrl(variant), {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });
  await page.waitForFunction(
    () => Boolean(window.__LPVIZ_RENDER_BENCH__),
    null,
    { timeout: 0 },
  );
  return { context, page };
}

async function readMetadata(browser: Browser) {
  const benchPage = await openBenchPage(browser, "optimized");
  try {
    return (await benchPage.page.evaluate(() =>
      window.__LPVIZ_RENDER_BENCH__!.describeScene(),
    )) as BenchMetadata;
  } finally {
    await benchPage.page.close();
    await benchPage.context.close();
  }
}

function printMetadata(metadata: BenchMetadata) {
  console.log("Benchmark metadata:");
  console.log(`constraints=${metadata.constraints}`);
  console.log(`rotationSteps=${metadata.rotationSteps}`);
  console.log(`totalTracePoints=${metadata.totalTracePoints}`);
  console.log(`maxit=${metadata.maxit}`);
  console.log(`angleStep=${metadata.angleStep}`);
  console.log(`sweepFraction=${metadata.sweepFraction}`);
  console.log(`browser=${JSON.stringify(metadata.browser)}`);
}

async function runOnPage(page: Page, scenario: BenchScenario, reps: number) {
  return (await page.evaluate(
    async ({ pageScenario, pageReps }) =>
      window.__LPVIZ_RENDER_BENCH__!.run({
        scenario: pageScenario,
        reps: pageReps,
      }),
    { pageScenario: scenario, pageReps: reps },
  )) as BenchRunResult;
}

async function measureVariant(
  browser: Browser,
  variant: BenchVariant,
  rawResults: BenchRunResult[],
) {
  const rotateTrialMedians: number[] = [];
  const orbitTrialMedians: number[] = [];
  const rotateSamples: FrameMetrics[] = [];
  const orbitSamples: FrameMetrics[] = [];

  for (let trial = 0; trial < trials; trial++) {
    process.stderr.write(`Running ${variant} trial ${trial + 1}/${trials}\n`);
    const benchPage = await openBenchPage(browser, variant);
    try {
      const rotate = await runOnPage(
        benchPage.page,
        "rotate-trace",
        rotationReps,
      );
      rawResults.push(rotate);
      rotateSamples.push(...rotate.samples);
      rotateTrialMedians.push(
        median(rotate.samples.map((sample) => sample.totalMs)),
      );

      const orbit = await runOnPage(
        benchPage.page,
        "orbit-complete-trace",
        orbitReps,
      );
      rawResults.push(orbit);
      orbitSamples.push(...orbit.samples);
      orbitTrialMedians.push(
        median(orbit.samples.map((sample) => sample.totalMs)),
      );
    } finally {
      await benchPage.page.close();
      await benchPage.context.close();
    }
  }

  return {
    rotateTrace: summarizeSamples(rotateSamples, rotateTrialMedians),
    orbitCompleteTrace: summarizeSamples(orbitSamples, orbitTrialMedians),
  };
}

function summarizeSamples(
  samples: FrameMetrics[],
  trialMedians: number[],
): ScenarioSummary {
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

function median(values: number[]) {
  return percentile(values, 0.5);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p)),
  );
  return sorted[index]!;
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function fmt(value: number) {
  return value.toFixed(2);
}

function ratio(value: number) {
  return `${value.toFixed(2)}x`;
}

function renderMarkdown(metadata: BenchMetadata, summaries: VariantSummary[]) {
  return [
    "# Rendering rotation benchmark",
    "",
    `Shape: ${metadata.shape}; constraints: ${metadata.constraints}; maxit: ${metadata.maxit}; angle step: ${metadata.angleStep}; sweep fraction: ${metadata.sweepFraction}.`,
    `Rotation steps: ${metadata.rotationSteps}; total trace points: ${metadata.totalTracePoints.toLocaleString()}.`,
    "",
    `| Variant | ${SCENARIO_NAMES["rotate-trace"]} | vs Opt. | ${SCENARIO_NAMES["orbit-complete-trace"]} | vs Opt. |`,
    "| --- | ---: | ---: | ---: | ---: |",
    ...summaries.map(
      (entry) =>
        `| ${entry.label} | ${fmt(entry.rotateTrace.medianMs)} | ${ratio(entry.ratiosVsOptimized.rotateTrace)} | ${fmt(entry.orbitCompleteTrace.medianMs)} | ${ratio(entry.ratiosVsOptimized.orbitCompleteTrace)} |`,
    ),
    "",
  ].join("\n");
}

function renderLatex(_metadata: BenchMetadata, summaries: VariantSummary[]) {
  const byVariant = new Map(summaries.map((entry) => [entry.variant, entry]));
  const ordered = [
    "optimized",
    "old-trace-line-pool",
    "old-bounds-recompute",
    "old-orbit-layer-updates",
    "old-single-scene",
  ] as const;
  const rows = ordered
    .map((variant) => byVariant.get(variant))
    .filter((entry): entry is VariantSummary => Boolean(entry));
  const optimized = rows[0];
  const rest = rows.slice(1);
  const optimizedRow = optimized
    ? `{Optimized} & {${latexMs(optimized.rotateTrace.medianMs)}} & {${latexRatio(optimized.ratiosVsOptimized.rotateTrace)}} & {${latexMs(optimized.orbitCompleteTrace.medianMs)}} & {${latexRatio(optimized.ratiosVsOptimized.orbitCompleteTrace)}} \\\\`
    : "";
  const ablationRows = rest
    .map(
      (entry) =>
        `${entry.label} & ${latexMs(entry.rotateTrace.medianMs)} & ${latexRatio(entry.ratiosVsOptimized.rotateTrace)} & ${latexMs(entry.orbitCompleteTrace.medianMs)} & ${latexRatio(entry.ratiosVsOptimized.orbitCompleteTrace)} \\\\`,
    )
    .join("\n");
  return `\\begin{table}[t]
\\color{red}% %%%%%%%%%%%TODO REMOVE
\\centering
\\caption{Rendering performance benchmark against real old slow paths found in perf commits: pre-822e411 trace line pool updates, pre-6e22a89/f227be2 geometry bounds recomputation, and pre-2995c65/34189c5 all-layer orbit updates. Workload: traced quarter-rotation using PDHG equality on a problem with 4 constraints, \\texttt{maxit}=1000, and angle step \\(0.001\\).}
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

await main();
