/**
 * Worker que roda o LaMa fora da página (ver lama.ts). Tenta a placa de vídeo
 * (WebGPU, pelo runtime JSEP) e, se não houver, cai para a CPU (WebAssembly, com várias threads
 * quando a página está isolada). Quem cria a worker escolhe o modo na primeira mensagem: o vigia
 * de lama.ts troca de worker, já na CPU e com uma thread só, quando esta trava.
 *
 * Mensagens:
 * - `{ type: "run", id, image, mask, gpu, threads }` → `{ type: "done", id, output }` ou
 *   `{ type: "error", id, error }`. A primeira chamada carrega o runtime e o modelo com `gpu`
 *   (tenta a WebGPU) e `threads` (0 = automático).
 * - No caminho: `{ type: "progress", loaded, total }` durante o download (`total` 0 quando o
 *   servidor não diz o tamanho), `{ type: "loaded" }` com tudo baixado e `{ type: "ready" }`
 *   com o modelo pronto para rodar.
 */
import * as ort from "onnxruntime-web";
import { MODEL_PARTS, wasmParts } from "./lamaFiles";

const SIZE = 512;

/** Lê o corpo da resposta contando os bytes (o andamento do download). */
async function readBody(res: Response, tick: (n: number) => void): Promise<Uint8Array> {
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    tick(all.length);
    return all;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    tick(value.length);
  }
  return join(chunks);
}

function join(bufs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bufs) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** Baixa os grupos de partes ao mesmo tempo e devolve cada grupo já juntado. */
async function download(groups: string[][]): Promise<Uint8Array[]> {
  const responses = await Promise.all(
    groups.map((urls) =>
      Promise.all(
        urls.map(async (u) => {
          const res = await fetch(u);
          if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
          return res;
        }),
      ),
    ),
  );
  const sizes = responses.flat().map((r) => Number(r.headers.get("content-length")) || 0);
  const total = sizes.every((s) => s > 0) ? sizes.reduce((a, b) => a + b, 0) : 0;
  let loaded = 0;
  let last = 0;
  const tick = (n: number) => {
    loaded += n;
    const now = Date.now();
    if (now - last < 250) return;
    last = now;
    self.postMessage({ type: "progress", loaded, total });
  };
  self.postMessage({ type: "progress", loaded, total });
  return Promise.all(responses.map(async (parts) => join(await Promise.all(parts.map((r) => readBody(r, tick))))));
}

let ready: Promise<ort.InferenceSession> | null = null;

function load(gpu: boolean, threads: number): Promise<ort.InferenceSession> {
  ready ??= (async () => {
    const [wasm, model] = await download([wasmParts(ort.env.versions.web ?? ort.env.versions.common ?? ""), MODEL_PARTS]);
    self.postMessage({ type: "loaded" });
    ort.env.wasm.wasmBinary = wasm.buffer as ArrayBuffer;
    ort.env.wasm.numThreads = threads || (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1);
    // desfaz a quantização na carga: a inferência roda como o modelo original
    const extra = { session: { disable_quant_qdq: "1" } };
    const adapter = gpu ? (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu : undefined;
    if (adapter && (await adapter.requestAdapter().catch(() => null))) {
      try {
        return await ort.InferenceSession.create(model, { executionProviders: ["webgpu"], extra });
      } catch (e) {
        console.warn("Proxinho: WebGPU falhou, usando a CPU.", e);
      }
    }
    return ort.InferenceSession.create(model, { executionProviders: ["wasm"], extra });
  })();
  ready.then(
    () => self.postMessage({ type: "ready" }),
    () => (ready = null),
  );
  return ready;
}

type RunMessage = { type?: string; id: number; image: Float32Array; mask: Float32Array; gpu?: boolean; threads?: number };

async function onRun(ev: MessageEvent<RunMessage>) {
  if (ev.data?.type !== "run") return;
  const { id, image, mask, gpu = true, threads = 0 } = ev.data;
  try {
    const session = await load(gpu, threads);
    const out = await session.run({
      image: new ort.Tensor("float32", image, [1, 3, SIZE, SIZE]),
      mask: new ort.Tensor("float32", mask, [1, 1, SIZE, SIZE]),
    });
    const output = new Float32Array(out.output.data as Float32Array);
    self.postMessage({ type: "done", id, output }, { transfer: [output.buffer] });
  } catch (e) {
    self.postMessage({ type: "error", id, error: String(e) });
  }
}

// As threads do WebAssembly reabrem este mesmo arquivo (o ONNX vem embutido
// nele) com o nome "em-pthread": nelas quem atende as mensagens é o runtime.
if (!self.name?.startsWith("em-pthread")) self.addEventListener("message", onRun);
