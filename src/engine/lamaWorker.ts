/**
 * Worker que roda o LaMa fora da página (ver lama.ts). Quem cria a worker escolhe o modo:
 * `webgpu` usa a placa de vídeo pelo runtime WebGPU do ONNX Runtime Web, se o navegador tiver
 * uma (senão, a CPU); `wasm` usa a CPU pelo runtime só de CPU, menor, com várias threads quando a
 * página está isolada. O vigia de lama.ts troca de worker, num modo mais simples, quando esta
 * trava ou falha.
 *
 * O runtime antigo da placa de vídeo (o JSEP, do pacote principal) falhava na soma da convolução
 * de Fourier do LaMa ("Can't perform binary op on the given tensors"): no Chrome, toda carta caía
 * para a CPU, lenta, e no celular nem isso (ver ADR 0013). O runtime WebGPU dá o mesmo resultado
 * da CPU (diferença máxima de 0,03 tom em 255 na Konia sem borda, DSK 358).
 *
 * Mensagens:
 * - `{ type: "load", backend, threads }` só prepara (baixa e cria a sessão), para a primeira
 *   carta não esperar o download depois do apagamento.
 * - `{ type: "run", id, image, mask, backend, threads }` → `{ type: "done", id, output }` ou
 *   `{ type: "error", id, error }`. Quem carrega primeiro decide o modo (`threads` 0 = automático).
 * - No caminho: `{ type: "progress", loaded, total }` durante o download (`total` 0 quando o
 *   servidor não diz o tamanho), `{ type: "loaded" }` com tudo baixado e
 *   `{ type: "ready", backend, threads }` com o modelo pronto, dizendo onde ele roda.
 * - Falha na carga, sem quadro na fila: `{ type: "error", error }`.
 */
import type { InferenceSession, Tensor } from "onnxruntime-web";
import { MODEL_PARTS, brokenOutput, gunzip, runtimeParts, sessionOptions, type Backend } from "./lamaFiles";

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

/** Baixa os grupos de partes ao mesmo tempo e devolve cada grupo já juntado e descompactado. */
async function download(groups: string[][]): Promise<Uint8Array[]> {
  const responses = await Promise.all(
    groups.map((urls) =>
      Promise.all(
        urls.map(async (u) => {
          const res = await fetch(u);
          if (!res.ok) throw new Error(`download de ${u}: HTTP ${res.status}`);
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
  const joined = await Promise.all(responses.map(async (parts) => join(await Promise.all(parts.map((r) => readBody(r, tick))))));
  self.postMessage({ type: "loaded" });
  return Promise.all(joined.map(gunzip));
}

/**
 * Há placa de vídeo? Sem `navigator.gpu`, sem adaptador ou com o adaptador de software (o
 * SwiftShader, que leva minutos por quadro), a CPU.
 */
async function hasGpu(): Promise<boolean> {
  type Adapter = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } };
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = (await gpu.requestAdapter()) as Adapter | null;
    return Boolean(adapter && !adapter.isFallbackAdapter && !adapter.info?.isFallbackAdapter);
  } catch {
    return false;
  }
}

type Loaded = {
  session: InferenceSession;
  Tensor: typeof Tensor;
  backend: Backend;
  threads: number;
};

let ready: Promise<Loaded> | null = null;

function load(wanted: Backend, threads: number): Promise<Loaded> {
  if (ready) return ready;
  ready = (async () => {
    const backend: Backend = wanted === "webgpu" && (await hasGpu()) ? "webgpu" : "wasm";
    // cada runtime só baixa quando é usado (o JavaScript dele vem num pedaço à parte)
    const ort = backend === "webgpu" ? await import("onnxruntime-web/webgpu") : await import("onnxruntime-web/wasm");
    const version = ort.env.versions.web ?? ort.env.versions.common ?? "";
    const [wasm, model] = await download([runtimeParts(backend, version), MODEL_PARTS]);
    ort.env.wasm.wasmBinary = wasm.buffer as ArrayBuffer;
    ort.env.wasm.numThreads = threads || (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1);
    try {
      const session = await ort.InferenceSession.create(model, sessionOptions(backend));
      return { session, Tensor: ort.Tensor, backend, threads: ort.env.wasm.numThreads };
    } catch (e) {
      throw new Error(`preparar o modelo (${backend}): ${String(e)}`);
    }
  })();
  ready.then(
    (s) => self.postMessage({ type: "ready", backend: s.backend, threads: s.threads }),
    () => (ready = null),
  );
  return ready;
}

type Message = { type?: string; id?: number; image?: Float32Array; mask?: Float32Array; backend?: Backend; threads?: number };

async function onMessage(ev: MessageEvent<Message>) {
  const { type, id, image, mask, backend = "webgpu", threads = 0 } = ev.data ?? {};
  if (type === "load") {
    load(backend, threads).catch((e) => self.postMessage({ type: "error", error: String(e) }));
    return;
  }
  if (type !== "run" || !image || !mask) return;
  try {
    const { session, Tensor, backend: used } = await load(backend, threads);
    const out = await session.run({
      image: new Tensor("float32", image, [1, 3, SIZE, SIZE]),
      mask: new Tensor("float32", mask, [1, 1, SIZE, SIZE]),
    });
    const output = new Float32Array(out.output.data as Float32Array);
    if (brokenOutput(output)) throw new Error(`rodar o quadro (${used}): saída com NaN`);
    self.postMessage({ type: "done", id, output }, { transfer: [output.buffer] });
  } catch (e) {
    self.postMessage({ type: "error", id, error: String(e) });
  }
}

// As threads do WebAssembly reabrem o arquivo do runtime com o nome "em-pthread": nelas quem
// atende as mensagens é o runtime.
if (!self.name?.startsWith("em-pthread")) self.addEventListener("message", onMessage);
