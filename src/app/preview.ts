/**
 * Fila de renderização das prévias.
 *
 * A prévia usa a imagem "normal" do Scryfall (488×680, ~100 KB) em vez do PNG
 * de impressão (~1 MB): a folha aparece rápido e o PNG só é baixado na hora
 * de gerar o PDF. No máximo 4 cartas são montadas ao mesmo tempo para não
 * travar o navegador, e cada resultado fica em cache pela chave da imagem.
 */
import { fontsVersion } from "../engine/fonts";
import { renderCard, usesNeuralFill } from "../engine/render";
import type { PrintRecord } from "../engine/types";
import { flavorApplies, hasPtText, missKey, renderKey, selectedPrint, sideCount, type Entry, type Side } from "./model";

const MAX_PARALLEL = 4;
const cache = new Map<string, Promise<string>>();
const queue: (() => void)[] = [];
let running = 0;

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

/** Anota o resultado de uma montagem que tentou escrever o português. */
export function noteRender(printId: string, side: Side, translated: boolean) {
  const key = missKey(printId, side);
  if (translated || misses.has(key)) return;
  misses = new Set([...misses, key]);
  for (const l of listeners) l();
}

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) run();
    else queue.push(run);
  });
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
    p = schedule(async () => {
      const { canvas, translated } = await renderCard({ ...input, imageVersion: "normal", scale: 0.56 });
      if (input.face) noteRender(input.print.id, side, translated);
      return toUrl(canvas);
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** A prévia desta face espera pela rede neural (ver `usesNeuralFill`): a interface mostra o andamento. */
export function waitsForNeuralFill(entry: Entry, side: Side = 0): boolean {
  const input = renderInput(entry, side);
  return Boolean(input && usesNeuralFill(input.print, input.face, side, input.typeLine));
}
