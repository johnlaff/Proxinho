/**
 * Motor de render do Proxinho: recebe uma impressão em inglês e o texto em
 * português e devolve um canvas com a carta reescrita.
 *
 * Etapas: baixar o PNG do Scryfall → apagar nome, tipo e regras em inglês →
 * ampliar para a resolução de impressão → escrever o português por cima.
 * A arte, a moldura, o custo de mana, o poder/resistência, o artista e o
 * copyright continuam os da carta original.
 */
import { BODY_FONT, TITLE_FONT, loadCardFonts } from "./fonts";
import { BASE_H, BASE_W, m15Layout } from "./geometry";
import { eraseRegions, findSetSymbolLeft } from "./erase";
import { preloadSymbols } from "./symbols";
import { SYMBOL_EM, fitText, type Measurer } from "./text";
import { scryfallImage, type PrintRecord, type PtFace } from "./types";

export interface RenderOptions {
  print: PrintRecord;
  /** texto em português; `null` mantém a carta original */
  face: PtFace | null;
  /** texto de ambientação, só quando vem da mesma impressão */
  flavor?: string | null;
  /** pixels de saída por pixel da imagem-base (1 ≈ 300 dpi, 2 ≈ 600 dpi) */
  scale?: number;
  /** imagem já carregada (testes); senão baixa do Scryfall */
  source?: CanvasImageSource & { width: number; height: number };
  /** "png" (745×1040, para imprimir) ou "normal" (488×680, para a prévia) */
  imageVersion?: "png" | "normal";
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  /** true quando o texto foi reescrito em português */
  translated: boolean;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // o CDN do Scryfall libera CORS: o canvas não fica "sujo"
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(url);
        reject(new Error(`Não foi possível baixar a imagem da carta (${url}).`));
      };
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

function measurer(ctx: CanvasRenderingContext2D, k: number): Measurer {
  const memo = new Map<string, number>();
  return {
    text(value, size, italic) {
      const key = `${italic ? "i" : "r"}${size}|${value}`;
      let w = memo.get(key);
      if (w === undefined) {
        ctx.font = `${italic ? "italic " : ""}${size * k}px ${BODY_FONT}`;
        w = ctx.measureText(value).width / k;
        memo.set(key, w);
      }
      return w;
    },
  };
}

/** Escreve uma linha (nome ou tipo) e comprime na horizontal se não couber. */
function drawLine(ctx: CanvasRenderingContext2D, text: string, x: number, centerY: number, maxWidth: number, size: number, k: number) {
  let s = size;
  ctx.font = `600 ${s * k}px ${TITLE_FONT}`;
  let w = ctx.measureText(text).width / k;
  // primeiro comprime até 82%; se ainda não couber, reduz o corpo
  while (w * 0.82 > maxWidth && s > 18) {
    s -= 0.5;
    ctx.font = `600 ${s * k}px ${TITLE_FONT}`;
    w = ctx.measureText(text).width / k;
  }
  const sx = w > maxWidth ? maxWidth / w : 1;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0b0b0b";
  ctx.translate(x * k, (centerY + s * 0.06) * k);
  ctx.scale(sx, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export async function renderCard(opts: RenderOptions): Promise<RenderResult> {
  const { print, face } = opts;
  const scale = opts.scale ?? 1.6;
  const [img] = await Promise.all([opts.source ?? loadImage(scryfallImage(print.id, opts.imageVersion ?? "png")), loadCardFonts()]);

  const W = Math.round(BASE_W * scale);
  const H = Math.round(BASE_H * scale);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não liberou o canvas 2D.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Os cantos do PNG são transparentes: pinta da cor da borda para o corte reto.
  ctx.fillStyle = print.border === "white" ? "#f4f2ee" : "#0d0d0d";
  ctx.fillRect(0, 0, W, H);

  const canTranslate = Boolean(print.supported && face?.name_pt && face.text_pt !== null);
  if (!canTranslate || !face) {
    ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: false };
  }

  // 1. Apaga o inglês na resolução original (mais rápido e fiel à textura).
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Seu navegador não liberou o canvas 2D.");
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, src.width, src.height);
  const fx = src.width / BASE_W;
  const fy = src.height / BASE_H;
  const setLeft = findSetSymbolLeft(data, Math.round(594 * fy), Math.round(632 * fy)) / fx;
  const layout = m15Layout(print.mana_cost, print.has_pt, setLeft);
  const toImg = (r: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.x0 * fx, y0: r.y0 * fy, x1: r.x1 * fx, y1: r.y1 * fy });
  eraseRegions(
    data,
    layout.erase.map((e) => ({ rect: toImg(e.rect), threshold: e.threshold, colorThreshold: e.colorThreshold })),
    layout.protect.map(toImg),
  );
  sctx.putImageData(data, 0, 0);

  // 2. Amplia para a resolução de impressão.
  ctx.drawImage(src, 0, 0, W, H);

  // 3. Escreve o português (k = pixels de saída por unidade da escala-base).
  const k = W / BASE_W;
  drawLine(ctx, face.name_pt ?? face.name_en, layout.title.x, layout.title.centerY, layout.title.maxWidth, layout.title.size, k);
  if (face.type_pt) drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.maxWidth, layout.type.size, k);

  const box = layout.box;
  const symbols = await preloadSymbols(face.text_pt, opts.flavor);
  const m = measurer(ctx, k);
  const res = fitText(face.text_pt, opts.flavor ?? null, box.x1 - box.x0, box.y1 - box.y0, m);
  let y = box.y0 + (box.y1 - box.y0 - res.height) / 2;
  const space = m.text(" ", res.size, false);
  ctx.fillStyle = "#0b0b0b";
  ctx.textBaseline = "alphabetic";
  res.lines.forEach((line, i) => {
    if (i > 0 && line.first) y += res.paragraphGap;
    if (i === res.flavorStart && i > 0) {
      // fio separador do texto de ambientação
      const gy = y + res.paragraphGap * 0.7;
      const grad = ctx.createLinearGradient(box.x0 * k, 0, box.x1 * k, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.12, "rgba(0,0,0,0.45)");
      grad.addColorStop(0.88, "rgba(0,0,0,0.45)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect((box.x0 + 6) * k, gy * k, (box.x1 - box.x0 - 12) * k, Math.max(1, 1.6 * k));
      ctx.fillStyle = "#0b0b0b";
      y += res.paragraphGap * 1.4;
    }
    const baseline = y + res.lineHeight * 0.8;
    let x = box.x0;
    line.chunks.forEach((chunk, ci) => {
      if (ci > 0) x += space;
      for (const run of chunk) {
        if (run.kind === "symbol") {
          const sz = res.size * SYMBOL_EM;
          const icon = symbols.get(run.value);
          const top = baseline - sz * 0.86;
          if (icon) ctx.drawImage(icon, (x + res.size * 0.03) * k, top * k, sz * k, sz * k);
          x += res.size * (SYMBOL_EM + 0.06);
        } else {
          ctx.font = `${run.italic ? "italic " : ""}${res.size * k}px ${BODY_FONT}`;
          ctx.fillText(run.value, x * k, baseline * k);
          x += m.text(run.value, res.size, run.italic);
        }
      }
    });
    y += res.lineHeight;
  });

  return { canvas: out, translated: true };
}
