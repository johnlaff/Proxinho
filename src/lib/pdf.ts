/**
 * Gera o PDF de impressão no navegador, em milímetros exatos.
 *
 * - Carta: 63 × 88 mm (tamanho oficial de Magic).
 * - Folha A4 (210 × 297 mm) ou Carta (215,9 × 279,4 mm), 3 × 3 cartas.
 * - Modo "sleeve": sem sangria, cartas encostadas, marcas de corte nas bordas.
 *   Opção de reduzir 0,5 mm para a folha entrar fácil na frente da carta.
 * - Modo "carta completa": sangria (2 mm na A4, 1 mm na Carta) para cortar
 *   sem filete branco, com marcas de corte no tamanho final. A sangria é
 *   pequena de propósito: impressoras caseiras não imprimem nos últimos ~4 mm.
 * - Régua de 5 cm na margem lateral de toda página, para conferir se a
 *   impressora não reduziu (as margens laterais são as mais folgadas).
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFImage, type PDFPage } from "pdf-lib";

export type Paper = "a4" | "letter";
export type PrintMode = "sleeve" | "full";

export interface PdfCard {
  /** imagem JPEG/PNG da carta já renderizada */
  image: Blob;
  /** verso das cartas de duas faces: sai logo depois da frente, em cada cópia */
  back?: Blob;
  quantity: number;
  /** cor da borda (para a sangria) */
  border: "black" | "white";
}

export interface PdfOptions {
  paper: Paper;
  mode: PrintMode;
  /** reduzir 0,5 mm em cada medida (só no modo sleeve) */
  shrink: boolean;
}

const MM = 72 / 25.4; // pontos por milímetro
const PAPERS: Record<Paper, [number, number]> = { a4: [210, 297], letter: [215.9, 279.4] };
export const CARD_W = 63;
export const CARD_H = 88;

export function bleedFor(opts: PdfOptions): number {
  if (opts.mode === "sleeve") return 0;
  return opts.paper === "letter" ? 1 : 2;
}

/** Calcula a grade: tamanho do card, da célula e a origem (mm). */
export function gridFor(opts: PdfOptions) {
  const [pw, ph] = PAPERS[opts.paper];
  const cw = opts.mode === "sleeve" && opts.shrink ? CARD_W - 0.5 : CARD_W;
  const ch = opts.mode === "sleeve" && opts.shrink ? CARD_H - 0.5 : CARD_H;
  const bleed = bleedFor(opts);
  const cellW = cw + 2 * bleed;
  const cellH = ch + 2 * bleed;
  const x0 = (pw - 3 * cellW) / 2;
  const y0 = (ph - 3 * cellH) / 2;
  return { pw, ph, cw, ch, bleed, cellW, cellH, x0, y0 };
}

function cropMarks(page: PDFPage, g: ReturnType<typeof gridFor>) {
  const len = 4;
  const gap = 1;
  const color = rgb(0.25, 0.25, 0.25);
  const thickness = 0.25;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < 3; i++) {
    xs.push(g.x0 + i * g.cellW + g.bleed, g.x0 + i * g.cellW + g.bleed + g.cw);
    ys.push(g.y0 + i * g.cellH + g.bleed, g.y0 + i * g.cellH + g.bleed + g.ch);
  }
  const top = g.y0;
  const bottom = g.y0 + 3 * g.cellH;
  const left = g.x0;
  const right = g.x0 + 3 * g.cellW;
  // pdf-lib usa origem embaixo à esquerda: convertemos y
  const Y = (mm: number) => (g.ph - mm) * MM;
  for (const x of new Set(xs.map((v) => +v.toFixed(3)))) {
    page.drawLine({ start: { x: x * MM, y: Y(top - gap) }, end: { x: x * MM, y: Y(top - gap - len) }, thickness, color });
    page.drawLine({ start: { x: x * MM, y: Y(bottom + gap) }, end: { x: x * MM, y: Y(bottom + gap + len) }, thickness, color });
  }
  for (const y of new Set(ys.map((v) => +v.toFixed(3)))) {
    page.drawLine({ start: { x: (left - gap) * MM, y: Y(y) }, end: { x: (left - gap - len) * MM, y: Y(y) }, thickness, color });
    page.drawLine({ start: { x: (right + gap) * MM, y: Y(y) }, end: { x: (right + gap + len) * MM, y: Y(y) }, thickness, color });
  }
}

function ruler(
  page: PDFPage,
  g: ReturnType<typeof gridFor>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  pageNo: number,
  total: number,
) {
  // Régua vertical na margem esquerda; textos girados nas margens laterais.
  const x = Math.max(3, g.x0 - 7);
  const top = g.y0 + 10;
  const color = rgb(0.2, 0.2, 0.2);
  const Y = (mm: number) => (g.ph - mm) * MM;
  page.drawLine({ start: { x: x * MM, y: Y(top) }, end: { x: x * MM, y: Y(top + 50) }, thickness: 0.5, color });
  for (let i = 0; i <= 50; i += 5) {
    const w = i % 10 === 0 ? 2 : 1;
    page.drawLine({ start: { x: x * MM, y: Y(top + i) }, end: { x: (x + w) * MM, y: Y(top + i) }, thickness: 0.4, color });
  }
  page.drawText("Esta régua deve medir 5 cm. Se medir menos, imprima em tamanho real (100%).", {
    x: (x - 1.2) * MM,
    y: Y(top + 55),
    size: 6,
    font,
    color,
    rotate: degrees(90),
  });
  const note = `Proxinho · página ${pageNo} de ${total} · conteúdo de fã não oficial, não aprovado pela Wizards of the Coast · uso pessoal, venda proibida`;
  const rx = Math.min(g.pw - 3, g.x0 + 3 * g.cellW + 5);
  page.drawText(note, { x: rx * MM, y: Y(g.y0 + 3 * g.cellH), size: 5.5, font, color: rgb(0.4, 0.4, 0.4), rotate: degrees(90) });
}

export async function buildPdf(
  cards: PdfCard[],
  opts: PdfOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Proxies em português · Proxinho");
  doc.setCreator("Proxinho");
  doc.setProducer("Proxinho (pdf-lib)");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const g = gridFor(opts);
  const slots: { img: PDFImage; border: PdfCard["border"] }[] = [];
  let i = 0;
  const embed = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return blob.type === "image/png" ? doc.embedPng(bytes) : doc.embedJpg(bytes);
  };
  for (const card of cards) {
    const img = await embed(card.image);
    const back = card.back ? await embed(card.back) : null;
    for (let q = 0; q < card.quantity; q++) {
      slots.push({ img, border: card.border });
      if (back) slots.push({ img: back, border: card.border });
    }
    onProgress?.(++i, cards.length);
  }
  const perPage = 9;
  const total = Math.max(1, Math.ceil(slots.length / perPage));
  for (let p = 0; p < total; p++) {
    const page = doc.addPage([g.pw * MM, g.ph * MM]);
    const Y = (mm: number) => (g.ph - mm) * MM;
    slots.slice(p * perPage, (p + 1) * perPage).forEach((slot, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cx = g.x0 + col * g.cellW;
      const cy = g.y0 + row * g.cellH;
      if (g.bleed > 0) {
        // sangria: pinta a célula inteira da cor da borda da carta
        page.drawRectangle({
          x: cx * MM,
          y: Y(cy + g.cellH),
          width: g.cellW * MM,
          height: g.cellH * MM,
          color: slot.border === "white" ? rgb(0.96, 0.95, 0.93) : rgb(0.05, 0.05, 0.05),
        });
      }
      page.drawImage(slot.img, { x: (cx + g.bleed) * MM, y: Y(cy + g.bleed + g.ch), width: g.cw * MM, height: g.ch * MM });
    });
    cropMarks(page, g);
    ruler(page, g, font, p + 1, total);
  }
  return doc.save();
}
