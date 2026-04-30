import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.html",
    },
    chunkSizeWarningLimit: 1000,
    emptyOutDir: true,
  },
});
