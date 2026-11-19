/**
 * Baixa o modelo de preenchimento (LaMa quantizado, Apache 2.0), compacta em gzip e divide
 * em partes menores que 25 MiB, o limite por arquivo dos assets do Cloudflare; compacta
 * também os dois runtimes WebAssembly do ONNX (o da placa de vídeo e o só de CPU). O navegador
 * baixa as partes, junta e descompacta (src/engine/lamaWorker.ts).
 *
 * Os arquivos ficam fora do repositório (public/modelos/ está no .gitignore). O modelo é
 * conferido por SHA-256 numa revisão fixa do Hugging Face. Se o download falhar, o build
 * segue: o site usa o preenchimento simples.
 *
 * Uso: node scripts/modelo.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const URL_MODELO = "https://huggingface.co/othytenk/lama-int4-int8/resolve/b52ebb642126086fe3da1524a3b1d7629ae4c6a9/lama_int4_int8_r4.onnx";
const SHA256 = "4e3b78a253eb4abf21896811c928ffa91214b916e5d6ced24cecdd7999b4aaa1";
const PARTES = 2;
const DIR = join(import.meta.dirname, "..", "public", "modelos");
const nome = (i) => `lama-int4.onnx.gz.${i}`;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const gz = (buf) => gzipSync(buf, { level: 9 });

mkdirSync(DIR, { recursive: true });

function jaTem() {
  if (![...Array(PARTES).keys()].every((i) => existsSync(join(DIR, nome(i))))) return false;
  try {
    return sha(gunzipSync(Buffer.concat([...Array(PARTES).keys()].map((i) => readFileSync(join(DIR, nome(i))))))) === SHA256;
  } catch {
    return false;
  }
}

if (jaTem()) {
  console.log("modelo: já baixado e conferido");
} else {
  try {
    // (as partes sem compactar dos builds anteriores servem, se conferem)
    const antigas = [0, 1].map((i) => join(DIR, `lama-int4.onnx.${i}`));
    const local = antigas.every((f) => existsSync(f)) ? Buffer.concat(antigas.map((f) => readFileSync(f))) : null;
    let buf = local && sha(local) === SHA256 ? local : null;
    if (!buf) {
      const res = await fetch(URL_MODELO);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (sha(buf) !== SHA256) throw new Error("SHA-256 não confere");
    const comp = gz(buf);
    const tam = Math.ceil(comp.length / PARTES);
    for (let i = 0; i < PARTES; i++) writeFileSync(join(DIR, nome(i)), comp.subarray(i * tam, (i + 1) * tam));
    console.log(`modelo: ${(buf.length / 1e6).toFixed(1)} MB, ${(comp.length / 1e6).toFixed(1)} MB compactado, em ${PARTES} partes`);
  } catch (e) {
    console.warn(`modelo: não foi possível baixar (${e.message}); o site usará o preenchimento simples`);
  }
}

// Runtimes do ONNX, com a versão no nome (o cache é imutável): o da placa de vídeo (WebGPU, 29 MB,
// 7 MB compactado) e o só de CPU (15 MB, 4 MB compactado). O antigo, da WebGPU pelo JSEP, falhava
// numa soma da convolução de Fourier do LaMa e saiu (ver ADR 0013).
const require = createRequire(import.meta.url);
const ortDir = join(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"), "..", "..");
const versao = JSON.parse(readFileSync(join(ortDir, "package.json"), "utf8")).version;
const runtimes = {
  [`ort-webgpu-${versao}.wasm.gz`]: "ort-wasm-simd-threaded.asyncify.wasm",
  [`ort-cpu-${versao}.wasm.gz`]: "ort-wasm-simd-threaded.wasm",
};
for (const [destino, origem] of Object.entries(runtimes)) {
  if (existsSync(join(DIR, destino))) continue;
  writeFileSync(join(DIR, destino), gz(readFileSync(join(ortDir, "dist", origem))));
}
// o que não é deste build sai (partes antigas, runtimes de outra versão)
const atuais = new Set([...[...Array(PARTES).keys()].map(nome), ...Object.keys(runtimes)]);
for (const f of readdirSync(DIR)) if (!atuais.has(f)) rmSync(join(DIR, f));
console.log(`runtime: onnxruntime-web ${versao} (placa de vídeo e CPU), compactados`);
