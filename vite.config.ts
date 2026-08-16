import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Connect, type Plugin, type ResolvedConfig } from "vite";

// In production, Cloudflare's asset server maps clean URLs onto the static
// docs pages (html_handling: auto-trailing-slash): /docs and /docs/ serve
// docs/index.html, /docs/simplex serves docs/simplex.html. Vite's dev and
// preview servers only serve the literal file paths, so mirror that mapping.
function docsCleanUrls(): Plugin {
  let config: ResolvedConfig;

  const middleware =
    (pagesDir: string): Connect.NextHandleFunction =>
    (req, _res, next) => {
      const url = req.url ?? "";
      const queryIndex = url.search(/[?#]/);
      const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
      const query = queryIndex === -1 ? "" : url.slice(queryIndex);

      if (pathname === "/docs" || pathname === "/docs/") {
        req.url = `/docs/index.html${query}`;
      } else {
        const page = pathname.match(/^\/docs\/([\w-]+)\/?$/)?.[1];
        if (page && existsSync(resolve(pagesDir, "docs", `${page}.html`))) {
          req.url = `/docs/${page}.html${query}`;
        }
      }
      next();
    };

  return {
    name: "docs-clean-urls",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use(middleware(config.publicDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(resolve(config.root, config.build.outDir)));
    },
  };
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [docsCleanUrls()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.html",
    },
    chunkSizeWarningLimit: 1000,
    emptyOutDir: true,
  },
});
