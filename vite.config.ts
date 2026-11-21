import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { drawingHash } from "./scripts/codigo.ts";

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
export default defineConfig(({ command }) => ({
  plugins: [react(), cloudflare(), dropOrtWasm()],
  // o resumo do código que desenha (scripts/codigo.ts), na chave das cartas guardadas; só no build:
  // no `dev` o código muda sem mudar o resumo, e nada é guardado
  define: command === "build" ? { __PROXINHO_BUILD__: JSON.stringify(drawingHash()) } : {},
  // Worker como módulo, com pedaços à parte: cada runtime do ONNX (placa de vídeo e CPU) vira um
  // arquivo próprio, baixado só quando é usado. E as threads do WebAssembly abrem esse arquivo
  // ("em-pthread"): no formato iife o runtime ficava embutido na worker, só iniciava quando
  // importado, e a thread nunca subia (a preparação do modelo travava).
  worker: { format: "es" },
  // Isolamento de origem (como em public/_headers): libera várias threads no
  // WebAssembly do preenchimento por rede neural (src/engine/lamaWorker.ts).
  server: { headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" } },
}));
