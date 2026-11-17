/**
 * Baixa o modelo de preenchimento (LaMa quantizado, Apache 2.0) e o divide em
 * partes menores que 25 MiB, o limite por arquivo dos assets do Cloudflare;
 * faz o mesmo com o runtime WebAssembly do ONNX. O navegador baixa as partes
 * e as junta (src/engine/lamaWorker.ts).
 *
 * O arquivo fica fora do repositório (public/modelos/ está no .gitignore) e é
 * conferido por SHA-256 numa revisão fixa do Hugging Face. Se o download
 * falhar, o build segue: o site usa o preenchimento simples.
 *
 * Uso: node scripts/modelo.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const URL_MODELO = "https://huggingface.co/othytenk/lama-int4-int8/resolve/b52ebb642126086fe3da1524a3b1d7629ae4c6a9/lama_int4_int8_r4.onnx";
const SHA256 = "4e3b78a253eb4abf21896811c928ffa91214b916e5d6ced24cecdd7999b4aaa1";
const PARTES = 2;
const DIR = join(import.meta.dirname, "..", "public", "modelos");
const nome = (i) => join(DIR, `lama-int4.onnx.${i}`);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function jaTem() {
  if (![...Array(PARTES).keys()].every((i) => existsSync(nome(i)))) return false;
  return sha(Buffer.concat([...Array(PARTES).keys()].map((i) => readFileSync(nome(i))))) === SHA256;
}

if (jaTem()) {
  console.log("modelo: já baixado e conferido");
} else {
  try {
    const res = await fetch(URL_MODELO);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha(buf) !== SHA256) throw new Error("SHA-256 não confere");
    mkdirSync(DIR, { recursive: true });
    const tam = Math.ceil(buf.length / PARTES);
    for (let i = 0; i < PARTES; i++) writeFileSync(nome(i), buf.subarray(i * tam, (i + 1) * tam));
    console.log(`modelo: ${(buf.length / 1e6).toFixed(1)} MB em ${PARTES} partes`);
  } catch (e) {
    console.warn(`modelo: não foi possível baixar (${e.message}); o site usará o preenchimento simples`);
  }
}

// Runtime do ONNX com WebGPU (29 MB): também passa do limite, então vai em partes,
// com a versão no nome (o cache é imutável).
const require = createRequire(import.meta.url);
const ortDir = join(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"), "..", "..");
const versao = JSON.parse(readFileSync(join(ortDir, "package.json"), "utf8")).version;
const wasm = readFileSync(join(ortDir, "dist", "ort-wasm-simd-threaded.jsep.wasm"));
mkdirSync(DIR, { recursive: true });
for (const f of readdirSync(DIR)) if (f.startsWith("ort-webgpu-") && !f.startsWith(`ort-webgpu-${versao}.`)) rmSync(join(DIR, f));
const meio = Math.ceil(wasm.length / 2);
writeFileSync(join(DIR, `ort-webgpu-${versao}.wasm.0`), wasm.subarray(0, meio));
writeFileSync(join(DIR, `ort-webgpu-${versao}.wasm.1`), wasm.subarray(meio));
console.log(`runtime: onnxruntime-web ${versao} em 2 partes`);
