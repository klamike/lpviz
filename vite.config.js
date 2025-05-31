import { defineConfig } from 'vite';

export default defineConfig({
  root: './ext/LPVizHTTPExt/static',
  build: {
    outDir: '../../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  }
}); 