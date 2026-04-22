// @ts-nocheck
import react from "@vitejs/plugin-react";
import { readdirSync, statSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

function findHtmlFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "dist" || entry.startsWith(".")) continue;
      files.push(...findHtmlFiles(fullPath));
    } else if (stats.isFile() && entry.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

const docsDir = resolve(__dirname, "docs");
const docHtmlInputs = findHtmlFiles(docsDir);

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    svgr(),
  ],
  // Exclude r3f from pre-bundling in dev so Vite serves the ESM files directly.
  // The pre-bundler (esbuild) would merge r3f + React reconciler + zustand etc.
  // into one huge chunk whose source-map offsets don't match the original files,
  // making the profiler useless. Serving the files un-bundled gives accurate
  // per-file source positions.
  optimizeDeps:
    mode !== "production"
      ? {
          exclude: ["@react-three/fiber"],
          // r3f is served directly (excluded above), so Vite won't scan its
          // imports at startup. Its CJS transitive deps must be listed here so
          // esbuild pre-bundles them into browser-compatible ESM; otherwise the
          // browser chokes on bare `require()` / missing `default` exports.
          include: [
            "suspend-react",
            "scheduler",
            "use-sync-external-store/shim/with-selector",
          ],
        }
      : undefined,
  resolve: {
    alias: [
      {
        find: "@",
        replacement: resolve(__dirname, "apps/web/src"),
      },
      {
        find: /^@lpviz\/math\/(.+)$/,
        replacement: resolve(__dirname, "packages/math/src/$1"),
      },
      {
        find: /^@lpviz\/polytope\/(.+)$/,
        replacement: resolve(__dirname, "packages/polytope/src/$1"),
      },
      {
        find: /^@lpviz\/solver-engine\/(.+)$/,
        replacement: resolve(__dirname, "packages/solver-engine/src/$1"),
      },
    ],
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    rollupOptions: {
      input: [resolve(__dirname, "index.html"), ...docHtmlInputs],
    },
    chunkSizeWarningLimit: 1000,
    emptyOutDir: false,
  },
}));
