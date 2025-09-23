// @ts-nocheck
import { defineConfig } from "vite";
import { resolve } from "path";
import { readdirSync, statSync } from "fs";

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

const rootDir = resolve(__dirname);
const docsDir = resolve(rootDir, "lpviz/docs");
const docHtmlInputs = findHtmlFiles(docsDir);

export default defineConfig({
  root: rootDir,
  build: {
    outDir: resolve(__dirname, "dist"),
    rollupOptions: {
      input: [resolve(rootDir, "index.html"), ...docHtmlInputs],
    },
  },
});
