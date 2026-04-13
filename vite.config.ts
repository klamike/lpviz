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
  build: {
    outDir: resolve(__dirname, "dist"),
    rollupOptions: {
      input: [resolve(__dirname, "index.html"), ...docHtmlInputs],
    },
    chunkSizeWarningLimit: 1000,
    emptyOutDir: false,
  },
});
