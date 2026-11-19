/** Monta as cartas em resolução de impressão e gera o PDF, tudo no navegador. */
import { renderCard } from "../engine/render";
import { buildPdf, type PdfCard, type PdfOptions } from "../lib/pdf";
import { sideCount, sortEntries, type Entry, type Side } from "./model";
import { noteRender, renderInput } from "./preview";

export type Quality = "padrao" | "alta";
/** pixels de saída por pixel do PNG (745 px ≈ 300 dpi em 63 mm) */
const SCALE: Record<Quality, number> = { padrao: 1, alta: 1.6 };

export interface ExportProgress {
  phase: "cartas" | "pdf";
  done: number;
  total: number;
}

/** Nome do arquivo com a data de hoje, por exemplo "proxinho-2026-11-17.pdf". */
export function pdfFileName(now = new Date()): string {
  return `proxinho-${now.toISOString().slice(0, 10)}.pdf`;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao montar uma carta."))), "image/jpeg", 0.92),
  );
}

export async function exportPdf(
  entries: Entry[],
  opts: PdfOptions & { quality: Quality },
  onProgress: (p: ExportProgress) => void,
): Promise<Blob> {
  // cada face de uma carta de duas faces é uma imagem (frente e verso lado a lado)
  const list = sortEntries(entries).flatMap((entry) =>
    Array.from({ length: sideCount(entry) }, (_, side) => ({ entry, side: side as Side })),
  );
  const cards: PdfCard[] = [];
  let done = 0;
  onProgress({ phase: "cartas", done, total: list.length });
  // duas por vez: cada PNG tem ~1 MB e o apagamento usa bastante memória
  const work = [...list.entries()];
  const results: Blob[] = new Array(list.length);
  const borders: PdfCard["border"][] = new Array(list.length);
  async function worker() {
    for (let next = work.shift(); next; next = work.shift()) {
      const [i, { entry, side }] = next;
      const input = renderInput(entry, side);
      if (!input) throw new Error(`Não há imagem para “${entry.card.name_pt ?? entry.card.name_en}”.`);
      const { canvas, translated } = await renderCard({ ...input, imageVersion: "png", scale: SCALE[opts.quality] });
      if (input.face) noteRender(input.print.id, side, translated);
      results[i] = await toBlob(canvas);
      borders[i] = input.print.border === "white" ? "white" : "black";
      onProgress({ phase: "cartas", done: ++done, total: list.length });
    }
  }
  await Promise.all([worker(), worker()]);
  list.forEach(({ entry, side }, i) => {
    if (side === 1) cards[cards.length - 1].back = results[i];
    else cards.push({ image: results[i], quantity: entry.quantity, border: borders[i] });
  });
  const bytes = await buildPdf(cards, opts, (d, t) => onProgress({ phase: "pdf", done: d, total: t }));
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
