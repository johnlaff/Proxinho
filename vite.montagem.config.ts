import { defineConfig } from "vite";
import { drawingHash } from "./vite.config.ts";

/**
 * Build da página do montador em lote (scripts/montagem, ADR 0022), fora do site. Leva o mesmo
 * resumo do código que desenha (`__PROXINHO_BUILD__`) que o build do site do mesmo commit: as
 * chaves das cartas montadas são as mesmas que o site procura.
 */
export default defineConfig({
  define: { __PROXINHO_BUILD__: JSON.stringify(drawingHash()) },
  worker: { format: "es" },
  build: { outDir: ".montagem", emptyOutDir: true, rollupOptions: { input: "scripts/montagem/index.html" } },
  // as threads do WebAssembly da rede neural pedem o isolamento de origem, como no site
  preview: {
    port: 5198,
    strictPort: true,
    headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" },
  },
});
