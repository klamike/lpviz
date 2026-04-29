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
      { find: "@", replacement: resolve(__dirname, "apps/web/src") },
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
      {
        find: /^@lpviz\/viewport\/(.+)$/,
        replacement: resolve(__dirname, "packages/viewport/src/$1"),
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
