/**
 * Worker que roda o LaMa fora da página (ver lama.ts). Tenta a placa de vídeo
 * (WebGPU, pelo runtime JSEP) e, se não houver, cai para a CPU (WebAssembly, com várias threads
 * quando a página está isolada).
 *
 * Mensagens:
 * - `{ type: "run", id, image, mask }` → `{ id, output }` ou `{ id, error }`.
 *   A primeira chamada carrega o runtime e o modelo.
 */
import * as ort from "onnxruntime-web";
import { MODEL_PARTS, wasmParts } from "./lamaFiles";

const SIZE = 512;

async function fetchParts(urls: string[]): Promise<Uint8Array> {
  const bufs = await Promise.all(
    urls.map(async (u) => {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }),
  );
  const out = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bufs) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

let ready: Promise<ort.InferenceSession> | null = null;

function load(): Promise<ort.InferenceSession> {
  ready ??= (async () => {
    const [wasm, model] = await Promise.all([
      fetchParts(wasmParts(ort.env.versions.web ?? ort.env.versions.common ?? "")),
      fetchParts(MODEL_PARTS),
    ]);
    ort.env.wasm.wasmBinary = wasm.buffer as ArrayBuffer;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    // desfaz a quantização na carga: a inferência roda como o modelo original
    const extra = { session: { disable_quant_qdq: "1" } };
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter().catch(() => null))) {
      try {
        return await ort.InferenceSession.create(model, { executionProviders: ["webgpu"], extra });
      } catch (e) {
        console.warn("Proxinho: WebGPU falhou, usando a CPU.", e);
      }
    }
    return ort.InferenceSession.create(model, { executionProviders: ["wasm"], extra });
  })();
  ready.catch(() => (ready = null));
  return ready;
}

async function onRun(ev: MessageEvent<{ type?: string; id: number; image: Float32Array; mask: Float32Array }>) {
  if (ev.data?.type !== "run") return;
  const { id, image, mask } = ev.data;
  try {
    const session = await load();
    const out = await session.run({
      image: new ort.Tensor("float32", image, [1, 3, SIZE, SIZE]),
      mask: new ort.Tensor("float32", mask, [1, 1, SIZE, SIZE]),
    });
    const output = new Float32Array(out.output.data as Float32Array);
    self.postMessage({ id, output }, { transfer: [output.buffer] });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
}

// As threads do WebAssembly reabrem este mesmo arquivo (o ONNX vem embutido
// nele) com o nome "em-pthread": nelas quem atende as mensagens é o runtime.
if (!self.name?.startsWith("em-pthread")) self.addEventListener("message", onRun);
