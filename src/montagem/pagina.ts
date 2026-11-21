/**
 * Página do montador em lote (scripts/montagem/montar.mjs, ADR 0022): monta no Chromium do
 * servidor as mesmas cartas que o site montaria no aparelho da pessoa, com as mesmas funções
 * (`renderInput`, `renderPreview`, `renderPrint`) e a mesma chave das cartas guardadas
 * (`cardKey`). O montador chama `window.montagem` de fora, pelo Playwright.
 *
 * Fica fora do site: só entra no build de `vite.montagem.config.ts`.
 */
import { cardKey, serverCardPath } from "../app/cardStore";
import { entriesFrom, hasPtText, sideCount, type Entry, type Side } from "../app/model";
import { renderInput, renderPreview } from "../app/preview";
import { renderPrint } from "../app/printFaces";
import { fontsId, loadCardFonts } from "../engine/fonts";
import { usesNeuralFill } from "../engine/render";
import type { CardRecord, PrintRecord } from "../engine/types";

/** As duas imagens que o site guarda de cada face: a prévia da folha e a face do PDF. */
const KINDS = ["previa", "impressao:padrao"] as const;
export type Kind = (typeof KINDS)[number];

type Result = { card: CardRecord | null; prints: PrintRecord[] };

/** Uma face de uma arte, com a chave e o caminho no servidor de cada imagem. */
export type Job = {
  id: string;
  oracle: string;
  printId: string;
  side: Side;
  name: string;
  set: string;
  number: string;
  /** passa pela rede neural (planeswalker ou arte sem borda): bem mais lenta */
  neural: boolean;
  /** a arte que o site escolhe sozinho para a carta (`defaultChoice`) */
  first: boolean;
  keys: { kind: Kind; key: string | null; path: string | null }[];
};

const entries = new Map<string, Entry>();

function withPrint(entry: Entry, printId: string): Entry {
  return { ...entry, choice: { kind: "print", printId } };
}

/**
 * As faces a montar de cada carta: as artes em que o português é escrito (com texto oficial e
 * moldura suportada), todas ou só a que o site escolhe sozinho (`every` falso).
 */
async function plan(results: Result[], every = true): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const entry of entriesFrom(results)) {
    entries.set(entry.card.oracle_id, entry);
    if (!hasPtText(entry.card)) continue;
    const chosen = entry.choice.kind === "print" ? entry.choice.printId : null;
    for (const print of entry.prints) {
      const first = print.id === chosen;
      if (!every && !first) continue;
      const e = withPrint(entry, print.id);
      for (let s = 0; s < sideCount(e); s++) {
        const side = s as Side;
        const supported = print.sides ? Boolean(print.sides[side]?.supported) : print.supported;
        const input = renderInput(e, side);
        if (!supported || !input?.face) continue;
        const keys = [];
        for (const kind of KINDS) {
          const key = await cardKey(kind, input);
          keys.push({ kind, key, path: key ? serverCardPath(key) : null });
        }
        jobs.push({
          id: `${print.id}#${side}`,
          oracle: entry.card.oracle_id,
          printId: print.id,
          side,
          name: entry.card.name_en,
          set: print.set_code,
          number: print.number,
          neural: usesNeuralFill(input.print, input.face, side, input.typeLine),
          first,
          keys,
        });
      }
    }
  }
  return jobs;
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Monta as imagens de uma face (a prévia primeiro: nas cartas da rede neural a face do PDF usa a
 * caixa que ela limpou). Confere a chave de novo antes de devolver: a imagem só vai para o
 * servidor com a chave da entrada que de fato a desenhou.
 */
async function render(job: Job, kinds: Kind[] = [...KINDS]) {
  const entry = entries.get(job.oracle);
  if (!entry) throw new Error(`Carta fora do lote: ${job.name}`);
  const input = renderInput(withPrint(entry, job.printId), job.side);
  if (!input?.face) throw new Error(`Face sem texto: ${job.id}`);
  const out = [];
  for (const kind of kinds) {
    const key = await cardKey(kind, input);
    const want = job.keys.find((k) => k.kind === kind)?.key ?? null;
    if (key !== want) throw new Error(`Chave mudou entre o plano e a montagem: ${job.id} ${kind}`);
    const t0 = performance.now();
    const made = kind === "previa" ? await renderPreview(input) : await renderPrint(input, "padrao");
    out.push({
      kind,
      key,
      path: key ? serverCardPath(key) : null,
      translated: made.translated,
      reason: made.reason ?? null,
      ms: Math.round(performance.now() - t0),
      data: await base64(made.blob),
    });
  }
  return out;
}

/** Solta as cartas dos lotes já montados. */
function forget() {
  entries.clear();
}

async function ready() {
  await loadCardFonts();
  return { fonts: fontsId(), path: serverCardPath("0".repeat(64)) };
}

Object.assign(window, { montagem: { plan, render, forget, ready } });
document.body.dataset.ready = "1";
