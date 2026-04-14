// @ts-nocheck
import { readdirSync, statSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";

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

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@lpviz/state/react",
        replacement: resolve(__dirname, "packages/state/src/react.ts"),
      },
      {
        find: "@lpviz/viewport/react",
        replacement: resolve(__dirname, "packages/viewport/src/react.ts"),
      },
      {
        find: "@lpviz/contracts",
        replacement: resolve(__dirname, "packages/contracts/src/index.ts"),
      },
      {
        find: "@lpviz/math",
        replacement: resolve(__dirname, "packages/math/src/index.ts"),
      },
      {
        find: "@lpviz/polytope",
        replacement: resolve(__dirname, "packages/polytope/src/index.ts"),
      },
      {
        find: "@lpviz/solver-engine",
        replacement: resolve(__dirname, "packages/solver-engine/src/index.ts"),
      },
      {
        find: "@lpviz/state",
        replacement: resolve(__dirname, "packages/state/src/index.ts"),
      },
      {
        find: "@lpviz/viewport",
        replacement: resolve(__dirname, "packages/viewport/src/index.ts"),
      },
      {
        find: "@lpviz/runtime",
        replacement: resolve(__dirname, "packages/runtime/src/index.ts"),
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
});
