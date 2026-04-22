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
  resolve: {
    alias: [
      // In dev, alias r3f to its CJS dev build so the profiler shows the full
      // un-minified source with readable names. The CJS build is pre-bundled
      // by esbuild (unlike the ESM build), so all its transitive CJS deps get
      // rewritten to ESM correctly — no missing `default` export errors.
      ...(mode !== "production"
        ? [
            {
              find: "@react-three/fiber",
              replacement: resolve(
                __dirname,
                "node_modules/@react-three/fiber/dist/react-three-fiber.cjs.dev.js",
              ),
            },
          ]
        : []),
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
