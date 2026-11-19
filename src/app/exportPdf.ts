/**
 * Gera o PDF no navegador: as cartas em resolução de impressão (as que o PDF adiantado já montou
 * vêm prontas, ver printFaces.ts) e a paginação.
 */
import { buildPdf, type PdfCard, type PdfOptions } from "../lib/pdf";
import type { Entry } from "./model";
import { exportParallel, printFace, printList, stopWarm, type PrintFace, type Quality } from "./printFaces";

export type { Quality } from "./printFaces";

export interface ExportProgress {
  phase: "cartas" | "pdf";
  done: number;
  total: number;
  /** a carta esperando a rede neural agora (quadros prontos de `total`), se houver */
  neural?: { name: string; done: number; total: number };
}

/** Nome do arquivo com a data de hoje, por exemplo "proxinho-2026-11-17.pdf". */
export function pdfFileName(now = new Date()): string {
  return `proxinho-${now.toISOString().slice(0, 10)}.pdf`;
}

export async function exportPdf(
  entries: Entry[],
  opts: PdfOptions & { quality: Quality },
  onProgress: (p: ExportProgress) => void,
): Promise<Blob> {
  // o que falta é montado aqui, com mais cartas ao mesmo tempo que o adiantado
  stopWarm();
  const list = printList(entries);
  let done = 0;
  onProgress({ phase: "cartas", done, total: list.length });
  const work = [...list.entries()];
  const results: PrintFace[] = new Array(list.length);
  async function worker() {
    for (let next = work.shift(); next; next = work.shift()) {
      const [i, { entry, side }] = next;
      const name = entry.card.name_pt ?? entry.card.name_en;
      results[i] = await printFace(
        entry,
        side,
        opts.quality,
        (p) => p.done < p.total && onProgress({ phase: "cartas", done, total: list.length, neural: { name, ...p } }),
      );
      onProgress({ phase: "cartas", done: ++done, total: list.length });
    }
  }
  await Promise.all(Array.from({ length: exportParallel() }, worker));
  const cards: PdfCard[] = [];
  list.forEach(({ entry, side }, i) => {
    if (side === 1) cards[cards.length - 1].back = results[i].image;
    else cards.push({ image: results[i].image, quantity: entry.quantity, border: results[i].border });
  });
  const bytes = await buildPdf(cards, opts, (d, t) => onProgress({ phase: "pdf", done: d, total: t }));
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
