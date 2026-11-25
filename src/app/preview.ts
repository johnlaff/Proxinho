/**
 * Fila de renderização das prévias.
 *
 * A prévia usa a imagem "normal" do Scryfall (488×680, ~100 KB) em vez do PNG
 * de impressão (~1 MB): a folha aparece rápido e o PNG só é baixado na hora
 * de gerar o PDF. No máximo 4 cartas são montadas ao mesmo tempo para não
 * travar o navegador, e cada resultado fica em cache pela chave da imagem.
 *
 * As cartas que passam pela rede neural (artes sem borda e planeswalkers) vão numa fila à
 * parte, uma de cada vez: esperando o modelo, elas tomavam as quatro vagas e as cartas comuns
 * ficavam minutos sem prévia. Enquanto esperam, a prévia mostra o rascunho (`draftUrl`: a
 * carta em PT com o preenchimento simples), montado na fila comum, e o andamento
 * (`neuralProgress`). O rascunho vai à frente das prévias comuns, e a carta aberta na gaveta passa
 * na frente das duas filas (`hurry`): o rascunho dela começa na hora, sem esperar vaga. E a carta
 * acabada só começa a montar depois do próprio rascunho: as duas montagens disputavam a página, e
 * no celular o acabamento já rodava a parte 1 com a gaveta ainda em "Montando a prévia…".
 *
 * A prévia acabada também fica guardada no navegador (ver cardStore.ts): numa visita seguinte,
 * com a mesma carta, ela aparece sem montar nada nem baixar a rede neural.
 */
import { fontsVersion } from "../engine/fonts";
import { cardKey, savedCard, storeCard, type StoredCard } from "./cardStore";
import { prepareLama } from "../engine/lama";
import { renderCard, usesNeuralFill } from "../engine/render";
import type { PrintRecord } from "../engine/types";
import { flavorApplies, hasPtText, missKey, neuralMissKey, renderKey, selectedPrint, sideCount, type Entry, type Side } from "./model";

const MAX_PARALLEL = 4;
const noop = () => undefined;
const cache = new Map<string, Promise<string>>();
const drafts = new Map<string, Promise<string>>();
/** Prévias acabadas (as promessas de `cache` já resolvidas): o rascunho delas não precisa. */
const finished = new Set<string>();

/**
 * Uma fila com até `parallel` montagens ao mesmo tempo. `first` marca as que vão à frente das
 * comuns (os rascunhos e a carta aberta na gaveta, ver `hurry`), na ordem em que chegaram.
 */
type Lane = { parallel: number; running: number; queue: { key: string; run: () => void; first?: boolean }[] };
const lanes = { common: { parallel: MAX_PARALLEL, running: 0, queue: [] } as Lane, neural: { parallel: 1, running: 0, queue: [] } as Lane };

/**
 * Andamento da rede neural numa prévia: na fila, ou rodando com `done` de `total` quadros
 * (`total` 0 enquanto a carta ainda está sendo apagada, antes do primeiro quadro).
 */
export type NeuralProgress = { state: "queued" | "running"; done: number; total: number };
let progress: ReadonlyMap<string, NeuralProgress> = new Map();
const progressListeners = new Set<() => void>();

export function neuralProgress(key: string): NeuralProgress | undefined {
  return progress.get(key);
}

export function onNeuralProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function setProgress(key: string, next: NeuralProgress | null) {
  const copy = new Map(progress);
  if (next) copy.set(key, next);
  else copy.delete(key);
  progress = copy;
  for (const l of progressListeners) l();
}

/**
 * Faces em que o motor não reconheceu a moldura e devolveu a imagem original (ver
 * `outcomeOf`). Só a montagem descobre isso; a interface assina para refazer as etiquetas.
 */
let misses: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function engineMisses(): ReadonlySet<string> {
  return misses;
}

export function onEngineMiss(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Anota o resultado de uma montagem que tentou escrever o português. Com `reason` "neural", a
 * carta saiu na original porque a rede neural não rodou neste navegador (não é a moldura).
 */
export function noteRender(printId: string, side: Side, translated: boolean, reason?: "neural") {
  const key = missKey(printId, side);
  if (translated || misses.has(key)) return;
  misses = new Set([...misses, key, ...(reason === "neural" ? [neuralMissKey(printId, side)] : [])]);
  for (const l of listeners) l();
}

/** Quem espera as duas filas de prévias esvaziarem (ver `whenPreviewsIdle`). */
const idleWaiters: (() => void)[] = [];
/** Prévias procurando a guardada antes de entrar numa fila (ver `lookup`). */
let starting = 0;
const previewsBusy = () => starting > 0 || Object.values(lanes).some((l) => l.running > 0 || l.queue.length > 0);
function wakeIdle() {
  if (!previewsBusy()) for (const wake of idleWaiters.splice(0)) wake();
}

/**
 * Resolve quando nenhuma prévia está montando nem esperando: o PDF adiantado (ver
 * `warmPrints`) só usa o processador depois que as folhas ficam prontas.
 */
export function whenPreviewsIdle(): Promise<void> {
  if (!previewsBusy()) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

function schedule<T>(lane: Lane, key: string, job: () => Promise<T>, first = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      lane.running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          lane.running--;
          // (o rascunho da gaveta pode ter passado do limite: só entra outra com vaga)
          if (lane.running < lane.parallel) lane.queue.shift()?.run();
          wakeIdle();
        });
    };
    if (lane.running < lane.parallel || (urgent && key === `${urgent}:rascunho`)) run();
    else if (urgent && key === urgent) lane.queue.unshift({ key, run, first: true });
    else if (first) {
      const i = lane.queue.findIndex((j) => !j.first);
      lane.queue.splice(i < 0 ? lane.queue.length : i, 0, { key, run, first });
    } else lane.queue.push({ key, run });
  });
}

/** A carta aberta na gaveta: se ainda não entrou na fila (procurando a guardada), entra na frente. */
let urgent: string | null = null;

/**
 * A carta aberta na gaveta passa na frente das duas filas: o rascunho dela começa na hora, mesmo
 * com as vagas da fila comum tomadas, e a prévia vai para o começo da fila. Num deck longo, o
 * rascunho de uma carta do fim da lista esperava as prévias de todas as de antes, e a gaveta
 * ficava em "Montando a prévia…" com o acabamento já na parte 2 de 3; no celular, esperar as
 * quatro que já montavam ainda deixava o acabamento chegar antes.
 */
export function hurry(entry: Entry, side: Side = 0) {
  const key = renderKey(entry, fontsVersion(), side);
  urgent = key;
  for (const lane of Object.values(lanes)) {
    const d = lane.queue.findIndex((j) => j.key === `${key}:rascunho`);
    if (d >= 0) lane.queue.splice(d, 1)[0].run();
    const i = lane.queue.findIndex((j) => j.key === key);
    if (i > 0) lane.queue.unshift({ ...lane.queue.splice(i, 1)[0], first: true });
  }
}

/** Impressão "falsa" para desenhar a imagem oficial em PT sem reescrever nada. */
export function ptPrintRecord(entry: Entry): PrintRecord | null {
  const pt = entry.card.pt_print;
  if (!pt) return null;
  return {
    id: pt.id,
    oracle_id: entry.card.oracle_id,
    set_code: pt.set,
    set_name: pt.set.toUpperCase(),
    number: pt.number,
    released: null,
    artist: null,
    frame: null,
    effects: null,
    border: "black",
    layout: entry.card.layout,
    highres: pt.hires,
    promo: false,
    mana_cost: null,
    has_pt: false,
    two_sided: sideCount(entry) === 2,
    supported: false,
  };
}

/** Parâmetros de render de uma face de uma entrada (usado na prévia e no PDF). */
export function renderInput(entry: Entry, side: Side = 0) {
  const print = entry.choice.kind === "pt" ? ptPrintRecord(entry) : selectedPrint(entry);
  if (!print) return null;
  const translate = entry.choice.kind === "print" && hasPtText(entry.card);
  const face = translate ? (entry.card.faces[side] ?? null) : null;
  // o flavor da impressão do texto, ou o da versão do Arena desta arte (ver `flavor_pt`)
  const flavor = !face ? null : flavorApplies(entry.card, print) ? (face.flavor_pt ?? null) : (print.flavor_pt?.[side] ?? null);
  // (Aventura: a segunda face é o feitiço da página da esquerda, na mesma imagem)
  const adventure = face && print.layout === "adventure" ? (entry.card.faces[1] ?? null) : null;
  // (carta modal: a outra face, resumida na faixa de baixo, ver mdfc.ts)
  const otherFace = face && print.layout === "modal_dfc" ? (entry.card.faces[side === 1 ? 0 : 1] ?? null) : null;
  return {
    print,
    face,
    side,
    typeLine: entry.card.type_line,
    flavor,
    ...(adventure ? { adventure } : {}),
    ...(otherFace ? { otherFace } : {}),
  };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao montar a prévia."))), "image/jpeg", 0.88),
  );
}

/** Entrada da montagem de uma face (ver `renderInput`). */
export type CardInput = NonNullable<ReturnType<typeof renderInput>>;

/**
 * A prévia acabada de uma face: a imagem "normal" do Scryfall, reduzida, em JPEG. A mesma função
 * monta as cartas guardadas no servidor (src/montagem/pagina.ts), para a carta de lá ser igual à
 * que o site montaria.
 */
export async function renderPreview(input: CardInput, onNeural?: (p: { done: number; total: number }) => void) {
  const { canvas, translated, reason } = await renderCard({ ...input, imageVersion: "normal", scale: 0.56, onNeural });
  return { blob: await toBlob(canvas), translated, reason };
}

/**
 * A prévia já montada (ver cardStore.ts): a guardada no navegador numa visita anterior ou a montada
 * no servidor, procurada uma vez por chave.
 */
const lookups = new Map<string, Promise<{ id: string | null; card: StoredCard | null }>>();
function lookup(key: string, input: CardInput) {
  let p = lookups.get(key);
  if (!p) {
    p = cardKey("previa", input).then(async (id) => ({ id, card: await savedCard(id) }));
    lookups.set(key, p);
  }
  return p;
}

export function previewUrl(entry: Entry, side: Side = 0): Promise<string> {
  const key = renderKey(entry, fontsVersion(), side);
  let p = cache.get(key);
  if (!p) {
    const input = renderInput(entry, side);
    if (!input) return Promise.reject(new Error("Carta sem imagem disponível."));
    const neural = usesNeuralFill(input.print, input.face, side, input.typeLine);
    if (neural) setProgress(key, { state: "queued", done: 0, total: 0 });
    starting++;
    const started = () => {
      starting--;
      wakeIdle();
    };
    p = lookup(key, input).then(
      ({ id, card }) => {
        if (card) {
          started();
          if (input.face) noteRender(input.print.id, side, card.translated);
          return URL.createObjectURL(card.blob);
        }
        // o modelo começa a baixar já, junto com o apagamento da carta
        if (neural) prepareLama();
        const job = schedule(neural ? lanes.neural : lanes.common, key, async () => {
          if (neural) setProgress(key, { state: "running", done: 0, total: 0 });
          // o rascunho sai primeiro: a montagem da acabada disputava a página com ele (o modelo
          // continua baixando e preparando na worker enquanto isso)
          const draft = neural ? drafts.get(key) : undefined;
          if (draft) await draft.then(noop, noop);
          const { blob, translated, reason } = await renderPreview(
            input,
            neural ? ({ done, total }) => setProgress(key, { state: "running", done, total }) : undefined,
          );
          if (input.face) noteRender(input.print.id, side, translated, reason);
          // (sem a rede neural a carta saiu na original: noutra visita ela pode rodar)
          if (reason !== "neural") storeCard(id, { blob, translated });
          return URL.createObjectURL(blob);
        });
        started();
        return job;
      },
      (err: unknown) => {
        started();
        throw err;
      },
    );
    p.then(
      () => finished.add(key),
      () => cache.delete(key),
    ).finally(() => neural && setProgress(key, null));
    cache.set(key, p);
  }
  return p;
}

/**
 * Rascunho da prévia de uma carta que espera a rede neural: o português sobre o preenchimento
 * simples, em um ou dois segundos, para a carta não ficar em branco enquanto o acabamento roda.
 * `null` para as outras cartas e quando a prévia acabada já existe.
 */
export function draftUrl(entry: Entry, side: Side = 0): Promise<string> | null {
  const key = renderKey(entry, fontsVersion(), side);
  if (finished.has(key)) return null;
  let p = drafts.get(key);
  if (!p) {
    const input = renderInput(entry, side);
    if (!input || !usesNeuralFill(input.print, input.face, side, input.typeLine)) return null;
    p = lookup(key, input).then(({ card }) => {
      if (card) throw new Error("A prévia acabada está guardada no navegador.");
      // o rascunho vai à frente das prévias comuns: é o que a carta mais lenta mostra primeiro
      return schedule(
        lanes.common,
        `${key}:rascunho`,
        async () => {
          if (finished.has(key)) throw new Error("A prévia acabada já existe.");
          const { canvas } = await renderCard({ ...input, imageVersion: "normal", scale: 0.56, neural: false });
          return URL.createObjectURL(await toBlob(canvas));
        },
        true,
      );
    });
    p.catch(() => drafts.delete(key));
    drafts.set(key, p);
  }
  return p;
}

/** A prévia desta face espera pela rede neural (ver `usesNeuralFill`): a interface mostra o andamento. */
export function waitsForNeuralFill(entry: Entry, side: Side = 0): boolean {
  const input = renderInput(entry, side);
  return Boolean(input && usesNeuralFill(input.print, input.face, side, input.typeLine));
}
