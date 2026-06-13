// Rotation hot-path performance gate.
//
// Loads the worst-case repro (maxitPDHG=100000, rotation speed 3, trace on),
// runs continuous objective rotation, and measures main-thread blocking — the
// metric that maps to dropped frames. This is the oracle that guards every
// refactor touching the render / solver / viewport hot path.
//
// Usage:
//   1. start a server:  bun run dev   (or `bun run preview` after a build)
//   2. run the bench:    bun run bench            (firefox, the user's browser)
//                        bun run bench -- chromium
//                        bun run bench -- firefox http://localhost:3000
//
// Exit code is non-zero if a regression threshold is exceeded, so it can gate CI.

import { chromium, firefox } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const share = readFileSync(join(here, "share-param.txt"), "utf8").trim();

const browserName = process.argv[2] || "firefox";
const url = process.argv[3] || "http://localhost:3000";
const launcher = browserName === "chromium" ? chromium : firefox;
const launchArgs =
  browserName === "chromium" ? ["--use-angle=metal"] : undefined;

// Regression thresholds. The meaningful, display-rate-independent signals are
// the dropped-frame count (must stay 0) and main-thread block time; p50 just
// tracks the display refresh (8.3ms at 120Hz, 16.7ms at 60Hz) so it is bounded
// loosely to catch only a true 2x stall, not a 60Hz session.
const THRESHOLDS = { framesOver34: 0, maxBlockMs: 40, p50Ms: 20 };

const browser = await launcher.launch({ headless: false, args: launchArgs });
const ctx = await browser.newContext({
  viewport: { width: 1728, height: 1050 },
  deviceScaleFactor: 2, // the user's display is retina; non-retina hides the cost
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(`${url}/?s=${share}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const c = document.getElementById("traceCheckbox");
  if (c && !c.checked) c.click();
});
await page.evaluate(() =>
  document.getElementById("startRotateObjectiveButton")?.click(),
);
// let the trace ring fill to capacity and reach steady state
await page.waitForTimeout(16000);

const result = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const blocks = [];
      let lastT = performance.now();
      const timer = setInterval(() => {
        const t = performance.now();
        if (t - lastT > 8) blocks.push(Math.round(t - lastT));
        lastT = t;
      }, 1);
      const frames = [];
      let last = performance.now();
      const end = last + 10000;
      const tick = (t) => {
        frames.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(tick);
        else {
          clearInterval(timer);
          blocks.sort((a, b) => a - b);
          frames.sort((a, b) => a - b);
          resolve({
            blocksOver16: blocks.filter((b) => b > 16).length,
            blocksOver34: blocks.filter((b) => b > 34).length,
            maxBlockMs: blocks.length ? blocks[blocks.length - 1] : 0,
            framesOver34: frames.filter((f) => f > 34).length,
            p50Ms: +frames[Math.floor(frames.length / 2)].toFixed(1),
            maxFrameMs: +frames[frames.length - 1].toFixed(1),
            totalBlockedMs: blocks.reduce((a, b) => a + b, 0),
          });
        }
      };
      requestAnimationFrame(tick);
    }),
);
await browser.close();

const regressions = [];
if (errors.length) regressions.push(`console/page errors: ${errors.length}`);
if (result.framesOver34 > THRESHOLDS.framesOver34)
  regressions.push(`framesOver34 ${result.framesOver34} > ${THRESHOLDS.framesOver34}`);
if (result.maxBlockMs > THRESHOLDS.maxBlockMs)
  regressions.push(`maxBlockMs ${result.maxBlockMs} > ${THRESHOLDS.maxBlockMs}`);
if (result.p50Ms > THRESHOLDS.p50Ms)
  regressions.push(`p50Ms ${result.p50Ms} > ${THRESHOLDS.p50Ms}`);

console.log(
  `[${browserName}] ${JSON.stringify({ ...result, errors: errors.length })}`,
);
if (regressions.length) {
  console.error(`REGRESSION: ${regressions.join("; ")}`);
  process.exit(1);
}
console.log("OK — within thresholds");
