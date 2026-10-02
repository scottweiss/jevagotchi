import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // GitHub Pages serves project sites from /<repo>/ rather than the domain root.
  base: process.env.GITHUB_PAGES === "true" ? "/jevagotchi/" : "/",
  server: {
    port: 5173,
    // The SDK refuses to run in a browser, so every think goes through the Node host.
    proxy: { "/think": "http://localhost:5174" },
  },
  build: { outDir: resolve(here, "dist"), emptyOutDir: true },
});
