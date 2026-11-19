/**
 * Preenchimento por rede neural (LaMa) para apagar texto sobre arte.
 *
 * O push-pull de `erase.ts` preenche os buracos com a média borrada da
 * vizinhança. Em fundo liso (o pergaminho das cartas comuns) isso some, mas nas
 * caixas translúcidas dos planeswalkers a arte aparece por trás do texto, e o
 * borrão fica visível como uma mancha. O LaMa (Suvorov et al., 2021, "Resolution-
 * robust Large Mask Inpainting with Fourier Convolutions") reconstrói a textura
 * em volta, e é o modelo de referência para remover texto e objetos.
 *
 * Roda no navegador com o ONNX Runtime Web, numa worker (lamaWorker.ts) para
 * não travar a página: na placa de vídeo (WebGPU) quando há, senão na CPU. O modelo é uma versão
 * quantizada de 37 MB (pesos int4/int8, licença Apache 2.0, 30 MB compactado), baixada só quando
 * aparece a primeira carta que precisa dele e guardada pelo navegador. Um vigia mede cada etapa
 * (ver `MODES` e `LIMITS`): travada ou com erro, a worker é trocada por uma mais simples; sem
 * modo que funcione, o modelo fica indisponível na página e quem chama decide (o planeswalker
 * volta para o push-pull; a arte sem borda sai na original). `lamaStatus` diz em que etapa está,
 * onde roda, quanto leva cada quadro e por que falhou, para a prévia mostrar o andamento.
 *
 * O modelo trabalha num quadro de 512 × 512. A caixa de texto (~600 px de
 * largura no PNG do Scryfall, ~400 px na imagem menor das prévias) é recortada
 * com uma margem de contexto, redimensionada para o quadro, e o resultado volta
 * ao tamanho original só nos buracos. Um quadro
 * só, em vez de vários sobrepostos, evita emendas de tom entre eles e corta o
 * tempo pela metade.
 */
import type { Rect } from "./geometry";
import type { Backend } from "./lamaFiles";

const SIZE = 512;

/**
 * Modos da worker, em ordem: a placa de vídeo (WebGPU; sem ela, a CPU), a CPU com várias threads
 * (quando a página está isolada) e a CPU com uma thread. Uma falha passa para o modo seguinte ao
 * que a worker de fato usou (ver `nextMode`): o erro da placa de vídeo vai para a CPU com várias
 * threads, e a thread do WebAssembly que não sobe (o Firefox do celular ficava em "Montando a
 * prévia…" com a arte sem borda da Konia, DSK 358) vai para a de uma thread.
 */
const MODES: { backend: Backend; threads: number }[] = [
  { backend: "webgpu", threads: 0 },
  { backend: "wasm", threads: 0 },
  { backend: "wasm", threads: 1 },
];

/** Onde a worker de fato rodou o modelo (a placa de vídeo pedida pode não existir). */
export type Active = { backend: Backend; threads: number };

/** O modo seguinte depois de uma falha no modo `mode`; `MODES.length` quando não há mais. */
export function nextMode(mode: number, active: Active | null): number {
  if (!active) return mode + 1;
  if (active.backend === "webgpu") return 1;
  return active.threads > 1 ? 2 : MODES.length;
}

/**
 * Limites do vigia, em ms: download sem um byte novo, do fim do download ao modelo pronto, e o
 * primeiro quadro em cada modo (na placa de vídeo leva de 1 a 5 s, com a compilação dos shaders
 * no primeiro; na CPU de um celular, de 15 a 60 s). Depois do primeiro, o limite de cada quadro é
 * `slower` vezes a média medida (no mínimo `floor`): um quadro lento que segue no ritmo não é
 * travamento, e um travado não espera os 4 minutos do primeiro.
 */
export const LIMITS = { stall: 60_000, prepare: 120_000, first: { webgpu: 90_000, wasm: 240_000 }, slower: 4, floor: 60_000 };

/** Limite do quadro que vai rodar, pela média `frameMs` dos anteriores (0 = nenhum ainda). */
export function runLimit(backend: Backend | null, frameMs: number): number {
  if (!frameMs) return LIMITS.first[backend ?? "wasm"];
  return Math.max(LIMITS.floor, LIMITS.slower * frameMs);
}

/** Etapa da rede neural, para a interface mostrar o andamento da prévia. */
export type LamaStatus = {
  stage: "idle" | "download" | "prepare" | "run" | "failed";
  /** bytes baixados e o total (0 quando o servidor não diz o tamanho) */
  loaded: number;
  total: number;
  /** onde o modelo roda, depois de pronto */
  backend: Backend | null;
  /** tempo médio de um quadro neste modo, em ms (0 enquanto nenhum terminou) */
  frameMs: number;
  /** quando o quadro atual começou (`Date.now()`), 0 fora da etapa "run" */
  since: number;
  /** por que a rede neural não rodou: as falhas de cada modo, em ordem ("" sem falha) */
  reason: string;
};

let status: LamaStatus = { stage: "idle", loaded: 0, total: 0, backend: null, frameMs: 0, since: 0, reason: "" };
const watchers = new Set<() => void>();

export function lamaStatus(): LamaStatus {
  return status;
}

export function onLamaStatus(listener: () => void): () => void {
  watchers.add(listener);
  return () => {
    watchers.delete(listener);
  };
}

function setStatus(next: Partial<LamaStatus>) {
  status = { ...status, ...next };
  for (const l of watchers) l();
}

/**
 * Quanto falta, em ms, para `left` quadros (o atual conta inteiro, menos o que já rodou dele), ou
 * `null` sem medida (antes do primeiro quadro terminar).
 */
export function etaMs(s: LamaStatus, left: number, now = Date.now()): number | null {
  if (!s.frameMs || left <= 0) return null;
  const elapsed = s.stage === "run" && s.since ? Math.min(now - s.since, s.frameMs) : 0;
  return Math.max(0, left * s.frameMs - elapsed);
}

type Job = { id: number; image: Float32Array; mask: Float32Array; done: (out: Float32Array | null) => void };
type Reply = {
  type?: string;
  id?: number;
  output?: Float32Array;
  error?: string;
  loaded?: number;
  total?: number;
  backend?: Backend;
  threads?: number;
};

/** Quadros esperando; o primeiro está na worker quando `busy`. Um de cada vez: o vigia mede um só. */
const jobs: Job[] = [];
let worker: Worker | null = null;
let mode = 0;
let ready = false;
let loading = false;
let busy = false;
let broken = false;
let active: Active | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
/** duração dos últimos quadros neste modo, para a média */
let times: number[] = [];
const reasons: string[] = [];

function arm(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(
    () => fail(`${status.stage === "run" ? "quadro" : status.stage === "prepare" ? "preparo" : "download"} sem resposta`),
    ms,
  );
}

/** A worker travou ou falhou: descarta e manda o mesmo quadro para o modo seguinte. */
function fail(reason: string) {
  clearTimeout(timer);
  worker?.terminate();
  worker = null;
  reasons.push(`${active?.backend ?? MODES[mode].backend}${active && active.backend === "wasm" ? ` ${active.threads}t` : ""}: ${reason}`);
  mode = nextMode(mode, active);
  ready = false;
  loading = false;
  busy = false;
  active = null;
  times = [];
  if (mode >= MODES.length) {
    // modelo indisponível (sem rede, navegador antigo, falta de memória): não tenta de novo nesta página
    broken = true;
    console.warn("Proxinho: preenchimento por rede neural indisponível.", reasons);
    setStatus({ stage: "failed", backend: null, frameMs: 0, since: 0, reason: reasons.join(" · ") });
    for (const job of jobs.splice(0)) job.done(null);
    return;
  }
  console.warn("Proxinho: a rede neural falhou; tentando num modo mais simples.", reason);
  setStatus({ backend: null, frameMs: 0, since: 0 });
  if (jobs.length) pump();
  else prepareLama();
}

function startFrame() {
  const since = Date.now();
  setStatus({ stage: "run", since });
  arm(runLimit(active?.backend ?? null, status.frameMs));
}

function spawn(): Worker {
  const w = new Worker(new URL("./lamaWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (ev: MessageEvent<Reply>) => {
    if (w !== worker) return;
    const m = ev.data;
    if (m.type === "progress") {
      setStatus({ stage: "download", loaded: m.loaded ?? 0, total: m.total ?? 0 });
      arm(LIMITS.stall);
    } else if (m.type === "loaded") {
      setStatus({ stage: "prepare" });
      arm(LIMITS.prepare);
    } else if (m.type === "ready") {
      ready = true;
      active = { backend: m.backend ?? MODES[mode].backend, threads: m.threads ?? 1 };
      setStatus({ backend: active.backend });
      if (busy) startFrame();
      else {
        clearTimeout(timer);
        setStatus({ stage: "idle", since: 0 });
      }
    } else if (m.type === "error" && m.id === undefined) {
      fail(m.error ?? "erro ao preparar");
    } else if (m.id !== undefined && m.id === jobs[0]?.id) {
      if (m.error) return fail(m.error);
      clearTimeout(timer);
      busy = false;
      if (status.since) times = [...times, Date.now() - status.since].slice(-5);
      setStatus({ frameMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0, since: 0 });
      jobs.shift()!.done(m.output ?? null);
      pump();
    }
  };
  w.onerror = (ev: Event) => {
    if (w !== worker) return;
    ev.preventDefault();
    fail("a worker caiu");
  };
  return w;
}

/**
 * Começa a baixar e preparar o modelo antes do primeiro quadro (a prévia chama assim que uma
 * carta vai precisar dele): o download corre junto com o apagamento da carta.
 */
export function prepareLama() {
  if (broken || typeof Worker === "undefined" || ready || loading) return;
  worker ??= spawn();
  loading = true;
  worker.postMessage({ type: "load", ...MODES[mode] });
  if (!busy) {
    setStatus({ stage: "download" });
    arm(LIMITS.stall);
  }
}

function pump() {
  if (busy) return;
  const job = jobs[0];
  if (!job) {
    if (ready || !loading) {
      clearTimeout(timer);
      setStatus({ stage: "idle", since: 0 });
    }
    return;
  }
  worker ??= spawn();
  busy = true;
  loading = true;
  // (cópias, sem transferir: se a worker travar, o mesmo quadro vai para a seguinte)
  worker.postMessage({ type: "run", id: job.id, image: job.image, mask: job.mask, ...MODES[mode] });
  if (ready) startFrame();
  else if (status.stage !== "download" && status.stage !== "prepare") {
    setStatus({ stage: "download" });
    arm(LIMITS.stall);
  }
}

function infer(image: Float32Array, mask: Float32Array): Promise<Float32Array | null> {
  if (broken || typeof Worker === "undefined") return Promise.resolve(null);
  return new Promise((done) => {
    jobs.push({ id: ++seq, image, mask, done });
    pump();
  });
}

/** Recorte quadrado da imagem (canto e lado, em pixels). */
type Crop = { x: number; y: number; size: number };

/** Recorte quadrado em volta de `area`, com margem de contexto, dentro da imagem. */
export function cropAround(area: Rect, width: number, height: number, margin: number): Crop {
  const size = Math.min(Math.max(SIZE, area.x1 - area.x0 + 2 * margin, area.y1 - area.y0 + 2 * margin), width, height);
  const clampTo = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max - size);
  return {
    x: clampTo((area.x0 + area.x1) / 2 - size / 2, width),
    y: clampTo((area.y0 + area.y1) / 2 - size / 2, height),
    size,
  };
}

/**
 * Um quadro do modelo: recorta `crop` da imagem, reduz ou amplia para 512 × 512, roda o
 * modelo e devolve o resultado só nos buracos de `mask` dentro de `fill`. Devolve `false`
 * se o modelo não estiver disponível.
 */
async function runFrame(img: ImageData, crop: Crop, mask: Uint8Array, hide: Rect[], fill: Rect): Promise<boolean> {
  const W = img.width;
  const s = SIZE / crop.size; // < 1 reduz (PNG), > 1 amplia (imagem menor das prévias)
  const n = SIZE * SIZE;
  const image = new Float32Array(3 * n);
  const holes = new Float32Array(n);
  // o que fica escondido do modelo, sem ser preenchido: a caixa da lealdade, preta, no
  // canto da caixa de texto. Vista pelo modelo, ela virava fonte do preenchimento e a
  // letra apagada logo acima saía como uma mancha marrom (Tezzeret, AER)
  const hidden = (x: number, y: number) => hide.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  // buraco no quadro: qualquer pixel de buraco da imagem que caia dentro dele
  const span = (d: number) => [Math.floor(d / s), Math.max(Math.floor(d / s), Math.ceil((d + 1) / s) - 1)];
  for (let y = 0; y < SIZE; y++) {
    const [ya, yb] = span(y);
    for (let x = 0; x < SIZE; x++) {
      const [xa, xb] = span(x);
      let hole = 0;
      for (let yy = ya; yy <= yb && !hole; yy++)
        for (let xx = xa; xx <= xb && !hole; xx++) {
          const px = crop.x + Math.min(xx, crop.size - 1);
          const py = crop.y + Math.min(yy, crop.size - 1);
          hole = mask[py * W + px] || (hidden(px, py) ? 1 : 0);
        }
      holes[y * SIZE + x] = hole;
    }
  }
  // amostragem bilinear da imagem original; o buraco vai zerado, como no treino do modelo
  const sample = (fx: number, fy: number, c: number) => {
    const x0 = Math.min(Math.max(0, Math.floor(fx)), W - 1);
    const y0 = Math.min(Math.max(0, Math.floor(fy)), img.height - 1);
    const x1 = Math.min(x0 + 1, W - 1);
    const y1 = Math.min(y0 + 1, img.height - 1);
    const tx = Math.min(Math.max(fx - x0, 0), 1);
    const ty = Math.min(Math.max(fy - y0, 0), 1);
    const d = img.data;
    const a = d[(y0 * W + x0) * 4 + c] * (1 - tx) + d[(y0 * W + x1) * 4 + c] * tx;
    const b = d[(y1 * W + x0) * 4 + c] * (1 - tx) + d[(y1 * W + x1) * 4 + c] * tx;
    return a * (1 - ty) + b * ty;
  };
  let any = false;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const k = y * SIZE + x;
      if (holes[k]) {
        any = true;
        continue;
      }
      const fx = crop.x + (x + 0.5) / s - 0.5;
      const fy = crop.y + (y + 0.5) / s - 0.5;
      for (let c = 0; c < 3; c++) image[c * n + k] = sample(fx, fy, c) / 255;
    }
  }
  if (!any) return true;
  const out = await infer(image, holes);
  if (!out) return false;
  // volta ao tamanho original só nos buracos (bilinear sobre a saída do modelo)
  const at = (x: number, y: number, c: number) => out[c * n + y * SIZE + x];
  for (let y = Math.max(fill.y0, crop.y); y < Math.min(fill.y1, crop.y + crop.size); y++) {
    for (let x = Math.max(fill.x0, crop.x); x < Math.min(fill.x1, crop.x + crop.size); x++) {
      const p = y * W + x;
      if (!mask[p]) continue;
      const fx = Math.min(Math.max((x - crop.x + 0.5) * s - 0.5, 0), SIZE - 1);
      const fy = Math.min(Math.max((y - crop.y + 0.5) * s - 0.5, 0), SIZE - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, SIZE - 1);
      const y1 = Math.min(y0 + 1, SIZE - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      for (let c = 0; c < 3; c++) {
        const a = at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx;
        const b = at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx;
        img.data[p * 4 + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  return true;
}

/**
 * Quadros de 512 px na resolução da própria imagem que cobrem `area`, da esquerda para a
 * direita e de cima para baixo: cada um preenche um pedaço (`fill`) e fica com pelo menos
 * `margin` px de contexto de cada lado dele, salvo na beira da imagem.
 */
export function nativeTiles(area: Rect, width: number, height: number, margin: number): { crop: Crop; fill: Rect }[] {
  const size = Math.min(SIZE, width, height);
  const room = size - 2 * margin;
  const nx = Math.max(1, Math.ceil((area.x1 - area.x0) / room));
  const ny = Math.max(1, Math.ceil((area.y1 - area.y0) / room));
  const out: { crop: Crop; fill: Rect }[] = [];
  const cut = (a: number, b: number, n: number, i: number) => Math.round(a + ((b - a) * i) / n);
  const clampTo = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max - size);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [x0, x1] = [cut(area.x0, area.x1, nx, i), cut(area.x0, area.x1, nx, i + 1)];
      const [y0, y1] = [cut(area.y0, area.y1, ny, j), cut(area.y0, area.y1, ny, j + 1)];
      const crop = { x: clampTo((x0 + x1) / 2 - size / 2, width), y: clampTo((y0 + y1) / 2 - size / 2, height), size };
      out.push({ crop, fill: { x0, y0, x1, y1 } });
    }
  return out;
}

/**
 * Preenche, dentro de `area`, os pixels marcados em `mask` (máscara da imagem
 * inteira). Devolve `false` se o modelo não estiver disponível; nesse caso a
 * imagem fica intacta e quem chama usa o preenchimento simples.
 *
 * Com `native`, o modelo roda na resolução da própria imagem, em quadros de 512 px que se
 * seguem (cada um vê o que o anterior já preencheu), em vez de um quadro só reduzido.
 * Reduzida, a arte fina atrás da caixa sem borda (a gravura e a retícula da impressão do
 * Shivan Dragon da Secret Lair) perdia o desenho e o remendo saía em manchas borradas.
 */
export async function lamaInpaint(
  img: ImageData,
  area: Rect,
  mask: Uint8Array,
  hide: Rect[] = [],
  native = false,
  onFrame?: () => void,
): Promise<boolean> {
  const W = img.width;
  const single = cropAround(area, W, img.height, Math.round(W * 0.03));
  if (!native || single.size <= SIZE) {
    const ok = await runFrame(img, single, mask, hide, area);
    if (ok) onFrame?.();
    return ok;
  }
  // a máscara muda a cada quadro: o que um já preencheu é contexto para o seguinte
  const work = Uint8Array.from(mask);
  for (const { crop, fill } of nativeTiles(area, W, img.height, Math.round(W * 0.043))) {
    if (!(await runFrame(img, crop, work, hide, fill))) return false;
    onFrame?.();
    for (let y = fill.y0; y < fill.y1; y++) work.fill(0, y * W + fill.x0, y * W + fill.x1);
  }
  return true;
}

/** Quantos quadros do modelo `lamaInpaint` roda para `area` (a prévia mostra "parte X de Y"). */
export function frameCount(area: Rect, width: number, height: number, native = false): number {
  const single = cropAround(area, width, height, Math.round(width * 0.03));
  if (!native || single.size <= SIZE) return 1;
  return nativeTiles(area, width, height, Math.round(width * 0.043)).length;
}
