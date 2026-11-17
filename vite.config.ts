import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * O pacote do ONNX Runtime referencia o próprio .wasm (28 MiB), e o Vite o
 * copiaria para os assets, que aceitam no máximo 25 MiB por arquivo. O worker
 * do preenchimento entrega o binário pronto (baixado em partes, ver
 * scripts/modelo.mjs), então essa cópia nunca é usada: sai do build.
 */
function dropOrtWasm(): Plugin {
  return {
    name: "proxinho:sem-wasm-do-ort",
    apply: "build",
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (/ort-wasm-simd-threaded.*\.wasm$/.test(name)) delete bundle[name];
    },
  };
}

// O plugin do Cloudflare roda o Worker (API + D1) dentro do próprio `vite dev`,
// no mesmo runtime (workerd) usado em produção.
export default defineConfig({
  plugins: [react(), cloudflare(), dropOrtWasm()],
  // Isolamento de origem (como em public/_headers): libera várias threads no
  // WebAssembly do preenchimento por rede neural (src/engine/lamaWorker.ts).
  server: { headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" } },
});
