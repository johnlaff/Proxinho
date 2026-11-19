/**
 * Arquivos do preenchimento por rede neural, servidos como assets estáticos (gerados por
 * scripts/modelo.mjs, fora do git). Vão compactados em gzip: o servidor manda os bytes como
 * estão e a worker descompacta (a placa de vídeo baixa 37 MB em vez de 66; a CPU, 34 em vez
 * de 52). O modelo compactado ainda passa do limite de 25 MiB por arquivo do Cloudflare, então
 * vai em duas partes que a worker junta.
 */
export const MODEL_PARTS = ["/modelos/lama-int4.onnx.gz.0", "/modelos/lama-int4.onnx.gz.1"];

/**
 * Onde o modelo roda: na placa de vídeo (WebGPU, pelo runtime próprio dela no ONNX Runtime
 * Web) ou na CPU (WebAssembly, pelo runtime só de CPU, com metade do tamanho).
 */
export type Backend = "webgpu" | "wasm";

/** O runtime leva a versão no nome: o cache é imutável e precisa mudar junto com o pacote. */
export const runtimeParts = (backend: Backend, version: string) => [
  `/modelos/ort-${backend === "webgpu" ? "webgpu" : "cpu"}-${version}.wasm.gz`,
];

/**
 * Descompacta o gzip. Um servidor que mande o arquivo com `Content-Encoding: gzip` faz o
 * navegador descompactar sozinho: sem a assinatura do gzip no começo, os bytes já vieram prontos.
 */
export async function gunzip(buf: Uint8Array): Promise<Uint8Array> {
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
  const stream = new Blob([buf as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Saída com NaN ou infinito: a placa de vídeo calculou errado (vale como falha). */
export function brokenOutput(out: Float32Array): boolean {
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) return true;
  return false;
}
