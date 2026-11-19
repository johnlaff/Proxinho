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
 * (`neuralProgress`). A carta aberta na gaveta passa na frente (`hurry`).
 */
import { fontsVersion } from "../engine/fonts";
import { prepareLama } from "../engine/lama";
import { renderCard, usesNeuralFill } from "../engine/render";
import type { PrintRecord } from "../engine/types";
import { flavorApplies, hasPtText, missKey, neuralMissKey, renderKey, selectedPrint, sideCount, type Entry, type Side } from "./model";

const MAX_PARALLEL = 4;
const cache = new Map<string, Promise<string>>();
const drafts = new Map<string, Promise<string>>();
/** Prévias acabadas (as promessas de `cache` já resolvidas): o rascunho delas não precisa. */
const finished = new Set<string>();

/** Uma fila com até `parallel` montagens ao mesmo tempo; `hurry` passa uma da fila na frente. */
type Lane = { parallel: number; running: number; queue: { key: string; run: () => void }[] };
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

function schedule<T>(lane: Lane, key: string, job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      lane.running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          lane.running--;
          lane.queue.shift()?.run();
        });
    };
    if (lane.running < lane.parallel) run();
    else lane.queue.push({ key, run });
  });
}

/** A prévia desta face passa na frente da fila da rede neural (a carta aberta na gaveta). */
export function hurry(entry: Entry, side: Side = 0) {
  const key = renderKey(entry, fontsVersion(), side);
  const q = lanes.neural.queue;
  const i = q.findIndex((j) => j.key === key);
  if (i > 0) q.unshift(...q.splice(i, 1));
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
  const flavor = flavorApplies(entry.card, print) ? (face?.flavor_pt ?? null) : null;
  return { print, face, side, typeLine: entry.card.type_line, flavor };
}

function toUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("Falha ao montar a prévia."))), "image/jpeg", 0.88),
  );
}

export function previewUrl(entry: Entry, side: Side = 0): Promise<string> {
  const key = renderKey(entry, fontsVersion(), side);
  let p = cache.get(key);
  if (!p) {
    const input = renderInput(entry, side);
    if (!input) return Promise.reject(new Error("Carta sem imagem disponível."));
    const neural = usesNeuralFill(input.print, input.face, side, input.typeLine);
    if (neural) {
      setProgress(key, { state: "queued", done: 0, total: 0 });
      // o modelo começa a baixar já, junto com o apagamento da carta
      prepareLama();
    }
    p = schedule(neural ? lanes.neural : lanes.common, key, async () => {
      if (neural) setProgress(key, { state: "running", done: 0, total: 0 });
      const { canvas, translated, reason } = await renderCard({
        ...input,
        imageVersion: "normal",
        scale: 0.56,
        onNeural: neural ? ({ done, total }) => setProgress(key, { state: "running", done, total }) : undefined,
      });
      if (input.face) noteRender(input.print.id, side, translated, reason);
      return toUrl(canvas);
    });
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
    p = schedule(lanes.common, `${key}:rascunho`, async () => {
      if (finished.has(key)) throw new Error("A prévia acabada já existe.");
      const { canvas } = await renderCard({ ...input, imageVersion: "normal", scale: 0.56, neural: false });
      return toUrl(canvas);
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
