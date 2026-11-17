/**
 * Motor de render do Proxinho: recebe uma impressão em inglês e o texto em
 * português e devolve um canvas com a carta reescrita.
 *
 * Etapas: baixar o PNG do Scryfall → apagar nome, tipo e regras em inglês →
 * ampliar para a resolução de impressão → escrever o português por cima.
 * A arte, a moldura, o custo de mana, o poder/resistência, o artista e o
 * copyright continuam os da carta original.
 */
import { bodyFont, loadCardFonts, titleFont } from "./fonts";
import { BACK_PT_NOTCH, BASE_H, BASE_W, costLeft, m15Layout, type Rect } from "./geometry";
import { combineMasks, eraseRegions, findSetSymbolLeft, hasRightIcon, inpaint, maskRegions } from "./erase";
import { lamaInpaint } from "./lama";
import { isTallPlaneswalker, planeswalkerRows, PW, rowRects, splitAbilities } from "./planeswalker";
import { preloadSymbols } from "./symbols";
import { SYMBOL_EM, fitRows, fitText, type LayoutResult, type Measurer } from "./text";
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
  /** cartas de duas faces: 0 = frente, 1 = verso */
  side?: 0 | 1;
  /** linha de tipo em inglês da carta (reconhece planeswalkers mesmo sem o tipo em PT) */
  typeLine?: string | null;
}

/** Cor do texto escrito: preto como o das cartas, ou claro nos versos escuros. */
const INK = { dark: "#0b0b0b", light: "#fbf8f1" } as const;

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
        const f = bodyFont();
        ctx.font = `${italic ? "italic " : ""}${size * f.scale * k}px ${f.family}`;
        w = ctx.measureText(value).width / k;
        memo.set(key, w);
      }
      return w;
    },
  };
}

/** Escreve uma linha (nome ou tipo) e comprime na horizontal se não couber. */
function drawLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  maxWidth: number,
  size: number,
  k: number,
  color: string = INK.dark,
) {
  const t = titleFont();
  let s = size * t.scale;
  ctx.font = `${t.weight} ${s * k}px ${t.family}`;
  let w = ctx.measureText(text).width / k;
  // primeiro comprime até 82%; se ainda não couber, reduz o corpo
  while (w * 0.82 > maxWidth && s > 18) {
    s -= 0.5;
    ctx.font = `${t.weight} ${s * k}px ${t.family}`;
    w = ctx.measureText(text).width / k;
  }
  const sx = w > maxWidth ? maxWidth / w : 1;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.translate((x + t.dx) * k, (centerY + s * 0.06) * k);
  ctx.scale(sx, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Planeswalker: nome, tipo e uma faixa por habilidade (ver planeswalker.ts).
 * Devolve false quando a imagem não bate com o texto; aí a carta sai original.
 */
/** Caixas de planeswalker já limpas pela rede neural (por impressão), as mais recentes. */
const cleanBoxes = new Map<string, ImageData>();

/** Arredonda um retângulo para a grade de pixels. */
const roundRect = (r: Rect): Rect => ({ x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) });

async function renderPlaneswalker(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  data: ImageData;
  toImg: (r: Rect) => Rect;
  face: PtFace;
  print: PrintRecord;
  W: number;
  H: number;
}): Promise<boolean> {
  const { ctx, data, toImg, face, print } = p;
  const paragraphs = splitAbilities(face.text_pt);
  const rows = planeswalkerRows(data, paragraphs.length);
  if (!rows) return false;
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const tb = isTallPlaneswalker(paragraphs.length) ? PW.type.tall : PW.type.normal;
  const setLeft = Math.min(Math.max(findSetSymbolLeft(data, Math.round((tb.y0 + 4) * fy), Math.round((tb.y1 - 4) * fy)) / fx, 560), 660);
  const cost = costLeft(print.mana_cost);
  const rects = rows.map(rowRects);
  const protect = [toImg(PW.loyaltyBox)];
  // nome e tipo ficam em barras opacas: o preenchimento simples basta
  const barInks = eraseRegions(
    data,
    [
      { rect: toImg({ x0: 50, y0: PW.title.erase.y0, x1: cost - 6, y1: PW.title.erase.y1 }), threshold: 28 },
      // sem o tipo em português, a linha de tipo em inglês fica
      { rect: toImg({ x0: 50, y0: tb.y0, x1: face.type_pt ? setLeft - 6 : 50, y1: tb.y1 }), threshold: 28 },
    ],
    protect,
  );
  // a caixa de texto é translúcida, com a arte aparecendo por trás: rede neural (ver lama.ts)
  const masks = maskRegions(
    data,
    rects.map((r) => ({ rect: toImg(r.erase), threshold: 14, colorThreshold: 34 })),
    protect,
  );
  const area = roundRect(toImg({ x0: PW.staticText.erase, y0: rows[0].y0, x1: PW.eraseRight, y1: rows[rows.length - 1].y1 }));
  // a prévia e o PDF desenham a mesma arte: guarda a caixa limpa para não rodar o modelo de novo
  const key = `${print.id}:${data.width}:${paragraphs.length}`;
  const cached = cleanBoxes.get(key);
  if (cached && cached.width === area.x1 - area.x0 && cached.height === area.y1 - area.y0) {
    for (let y = 0; y < cached.height; y++)
      data.data.set(cached.data.subarray(y * cached.width * 4, (y + 1) * cached.width * 4), ((area.y0 + y) * data.width + area.x0) * 4);
  } else {
    // máscara folgada: o LaMa espalha para dentro do buraco qualquer resto de borda das letras
    const hole = combineMasks(data, masks, Math.round(fx * 3) + 1);
    for (const r of protect.map(roundRect)) for (let y = r.y0; y < r.y1; y++) hole.fill(0, y * data.width + r.x0, y * data.width + r.x1);
    if (!(await lamaInpaint(data, area, hole))) {
      for (const m of masks) if (m.mask.length) inpaint(data, m.rect, m.mask);
    } else {
      const box = new ImageData(area.x1 - area.x0, area.y1 - area.y0);
      for (let y = 0; y < box.height; y++)
        box.data.set(
          data.data.subarray(((area.y0 + y) * data.width + area.x0) * 4, ((area.y0 + y) * data.width + area.x1) * 4),
          y * box.width * 4,
        );
      cleanBoxes.set(key, box);
      if (cleanBoxes.size > 24) cleanBoxes.delete(cleanBoxes.keys().next().value!);
    }
  }
  const inks = [...barInks, ...masks.map((m) => m.polarity)];
  p.sctx.putImageData(data, 0, 0);
  ctx.drawImage(p.src, 0, 0, p.W, p.H);

  const k = p.W / BASE_W;
  drawLine(ctx, face.name_pt ?? face.name_en, 66, PW.title.centerY, cost - 12 - 66, 35, k, INK[inks[0]]);
  if (face.type_pt) drawLine(ctx, face.type_pt, 66, tb.centerY, setLeft - 10 - 66, 30, k, INK[inks[1]]);

  const symbols = await preloadSymbols(face.text_pt);
  const m = measurer(ctx, k);
  const layouts = fitRows(
    rects.map(({ text }, i) => {
      // a faixa de baixo desvia da caixa da lealdade inicial
      const under = text.y1 - PW.loyaltyBox.y0;
      return {
        text: paragraphs[i],
        width: text.x1 - text.x0,
        height: text.y1 - text.y0,
        notch: under > 0 ? { width: text.x1 - PW.loyaltyBox.x0 + 6, height: under } : undefined,
      };
    }),
    m,
  );
  layouts.forEach((res, i) => drawLayout(ctx, res, rects[i].text, k, inks[2 + i], symbols, m));
  return true;
}

/** Escreve um texto já diagramado, centralizado na vertical dentro de `box`. */
function drawLayout(
  ctx: CanvasRenderingContext2D,
  res: LayoutResult,
  box: Rect,
  k: number,
  boxInk: "dark" | "light",
  symbols: Map<string, CanvasImageSource>,
  m: Measurer,
) {
  let y = box.y0 + (box.y1 - box.y0 - res.height) / 2;
  const space = m.text(" ", res.size, false);
  const ink = INK[boxInk];
  ctx.fillStyle = ink;
  ctx.textBaseline = "alphabetic";
  res.lines.forEach((line, i) => {
    if (i > 0 && line.first) y += res.paragraphGap;
    if (i === res.flavorStart && i > 0) {
      // fio separador do texto de ambientação
      const gy = y + res.paragraphGap * 0.7;
      const grad = ctx.createLinearGradient(box.x0 * k, 0, box.x1 * k, 0);
      const rule = boxInk === "light" ? "251,248,241" : "0,0,0";
      grad.addColorStop(0, `rgba(${rule},0)`);
      grad.addColorStop(0.12, `rgba(${rule},0.45)`);
      grad.addColorStop(0.88, `rgba(${rule},0.45)`);
      grad.addColorStop(1, `rgba(${rule},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect((box.x0 + 6) * k, gy * k, (box.x1 - box.x0 - 12) * k, Math.max(1, 1.6 * k));
      ctx.fillStyle = ink;
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
          const f = bodyFont();
          ctx.font = `${run.italic ? "italic " : ""}${res.size * f.scale * k}px ${f.family}`;
          ctx.fillText(run.value, x * k, baseline * k);
          x += m.text(run.value, res.size, run.italic);
        }
      }
    });
    y += res.lineHeight;
  });
}

/** Lembrete de poder/resistência do verso, em cinza, no canto da caixa de texto. */
function drawBackPt(ctx: CanvasRenderingContext2D, pt: string, centerY: number, k: number, ink: "dark" | "light") {
  const t = titleFont();
  ctx.save();
  ctx.font = `${t.weight} ${26 * t.scale * k}px ${t.family}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink === "light" ? "rgba(251,248,241,0.75)" : "rgba(11,11,11,0.62)";
  ctx.fillText(pt, 682 * k, centerY * k);
  ctx.restore();
}

export async function renderCard(opts: RenderOptions): Promise<RenderResult> {
  const { print, face } = opts;
  const side = opts.side ?? 0;
  const sideInfo = print.sides?.[side] ?? null;
  const scale = opts.scale ?? 1.6;
  // Planeswalker usa sempre o PNG, também na prévia: a rede neural limpa a caixa
  // melhor na imagem sem compressão JPEG, e a caixa limpa é reaproveitada no PDF.
  const pw = !print.sides && /planeswalker/i.test(face?.type_pt ?? opts.typeLine ?? "");
  const version = pw ? "png" : (opts.imageVersion ?? "png");
  const [img] = await Promise.all([
    opts.source ?? loadImage(scryfallImage(print.id, version, side === 1 ? "back" : "front")),
    loadCardFonts(),
  ]);

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

  const supported = print.sides ? Boolean(sideInfo?.supported) : print.supported;
  const canTranslate = Boolean(supported && face?.name_pt && face.text_pt !== null);
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
  const toImg = (r: Rect) => ({ x0: r.x0 * fx, y0: r.y0 * fy, x1: r.x1 * fx, y1: r.y1 * fy });

  if (pw) {
    const done = await renderPlaneswalker({ ctx, src, sctx, data, toImg, face, print, W, H });
    if (!done) ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: done };
  }

  const setLeft = findSetSymbolLeft(data, Math.round(594 * fy), Math.round(632 * fy)) / fx;
  const manaCost = sideInfo ? sideInfo.mana_cost : print.mana_cost;
  const hasPt = sideInfo ? sideInfo.has_pt : print.has_pt;
  // lembrete do verso ("4/4") na frente das cartas de transformar
  const backPt = print.layout === "transform" && side === 0 ? (print.sides?.[1]?.pt ?? null) : null;
  const rightIcon = Boolean(sideInfo && side === 1 && !manaCost && hasRightIcon(data));
  const layout = m15Layout(manaCost, hasPt, setLeft, {
    leftIcon: Boolean(sideInfo) && !rightIcon,
    rightIcon,
    indicator: sideInfo?.indicator,
    mdfcStrip: print.layout === "modal_dfc",
  });
  const [titleInk, typeInk, boxInk] = eraseRegions(
    data,
    layout.erase.map((e) => ({ rect: toImg(e.rect), threshold: e.threshold, colorThreshold: e.colorThreshold })),
    layout.protect.map(toImg),
  );
  sctx.putImageData(data, 0, 0);

  // 2. Amplia para a resolução de impressão.
  ctx.drawImage(src, 0, 0, W, H);

  // 3. Escreve o português (k = pixels de saída por unidade da escala-base).
  const k = W / BASE_W;
  drawLine(
    ctx,
    face.name_pt ?? face.name_en,
    layout.title.x,
    layout.title.centerY,
    layout.title.maxWidth,
    layout.title.size,
    k,
    INK[titleInk],
  );
  if (face.type_pt)
    drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.maxWidth, layout.type.size, k, INK[typeInk]);
  if (backPt) drawBackPt(ctx, backPt, layout.box.y1 - BACK_PT_NOTCH.height / 2, k, boxInk);

  const box = layout.box;
  const symbols = await preloadSymbols(face.text_pt, opts.flavor);
  const m = measurer(ctx, k);
  const res = fitText(face.text_pt, opts.flavor ?? null, box.x1 - box.x0, box.y1 - box.y0, m, 34, 15, backPt ? BACK_PT_NOTCH : undefined);
  drawLayout(ctx, res, box, k, boxInk, symbols, m);

  return { canvas: out, translated: true };
}
