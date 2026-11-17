/**
 * Fila de renderização das prévias.
 *
 * A prévia usa a imagem "normal" do Scryfall (488×680, ~100 KB) em vez do PNG
 * de impressão (~1 MB): a folha aparece rápido e o PNG só é baixado na hora
 * de gerar o PDF. No máximo 4 cartas são montadas ao mesmo tempo para não
 * travar o navegador, e cada resultado fica em cache pela chave da imagem.
 */
import { fontsVersion } from "../engine/fonts";
import { renderCard } from "../engine/render";
import type { PrintRecord } from "../engine/types";
import { frontFace, hasPtText, renderKey, selectedPrint, type Entry } from "./model";

const MAX_PARALLEL = 4;
const cache = new Map<string, Promise<string>>();
const queue: (() => void)[] = [];
let running = 0;

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
    two_sided: false,
    supported: false,
  };
}

/** Parâmetros de render de uma entrada (usado na prévia e no PDF). */
export function renderInput(entry: Entry) {
  const print = entry.choice.kind === "pt" ? ptPrintRecord(entry) : selectedPrint(entry);
  if (!print) return null;
  const translate = entry.choice.kind === "print" && hasPtText(entry.card);
  const face = translate ? frontFace(entry.card) : null;
  const tp = entry.card.text_print;
  const sameAsText = Boolean(tp && print.set_code.toLowerCase() === tp.set.toLowerCase() && print.number === tp.number);
  return { print, face, flavor: sameAsText ? (face?.flavor_pt ?? null) : null };
}

function toUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("Falha ao montar a prévia."))), "image/jpeg", 0.88),
  );
}

export function previewUrl(entry: Entry): Promise<string> {
  const key = renderKey(entry, fontsVersion());
  let p = cache.get(key);
  if (!p) {
    const input = renderInput(entry);
    if (!input) return Promise.reject(new Error("Carta sem imagem disponível."));
    p = schedule(async () => {
      const { canvas } = await renderCard({ ...input, imageVersion: "normal", scale: 0.56 });
      return toUrl(canvas);
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
