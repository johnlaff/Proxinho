/**
 * Arquivos do preenchimento por rede neural, servidos como assets estáticos.
 * Os dois passam do limite de 25 MiB por arquivo do Cloudflare, então vão em
 * partes que o worker junta (gerados por scripts/modelo.mjs, fora do git).
 */
export const MODEL_PARTS = ["/modelos/lama-int4.onnx.0", "/modelos/lama-int4.onnx.1"];
/** O runtime leva a versão no nome: o cache é imutável e precisa mudar junto com o pacote. */
export const wasmParts = (version: string) => [0, 1].map((i) => `/modelos/ort-webgpu-${version}.wasm.${i}`);
