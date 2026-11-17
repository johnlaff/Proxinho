/** Monta as cartas em resolução de impressão e gera o PDF, tudo no navegador. */
import { renderCard } from "../engine/render";
import { buildPdf, type PdfCard, type PdfOptions } from "../lib/pdf";
import { sortEntries, type Entry } from "./model";
import { renderInput } from "./preview";

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
  const list = sortEntries(entries);
  const cards: PdfCard[] = [];
  let done = 0;
  onProgress({ phase: "cartas", done, total: list.length });
  // duas por vez: cada PNG tem ~1 MB e o apagamento usa bastante memória
  const work = [...list.entries()];
  const results: PdfCard[] = new Array(list.length);
  async function worker() {
    for (let next = work.shift(); next; next = work.shift()) {
      const [i, entry] = next;
      const input = renderInput(entry);
      if (!input) throw new Error(`Não há imagem para “${entry.card.name_pt ?? entry.card.name_en}”.`);
      const { canvas } = await renderCard({ ...input, imageVersion: "png", scale: SCALE[opts.quality] });
      results[i] = { image: await toBlob(canvas), quantity: entry.quantity, border: input.print.border === "white" ? "white" : "black" };
      onProgress({ phase: "cartas", done: ++done, total: list.length });
    }
  }
  await Promise.all([worker(), worker()]);
  cards.push(...results);
  const bytes = await buildPdf(cards, opts, (d, t) => onProgress({ phase: "pdf", done: d, total: t }));
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
