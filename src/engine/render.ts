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
import { BACK_PT_NOTCH, BASE_H, BASE_W, costLeft, hasLeftIcon, m15Layout, ptProtect, type FrameLayout, type Rect } from "./geometry";
import {
  centralSpan,
  coloredInk,
  combineMasks,
  darkTextBox,
  dropSpecks,
  eraseRegions,
  findSetSymbolLeft,
  hasRightIcon,
  inpaint,
  insideBoxSides,
  keepAttachedBelow,
  liftShadedBands,
  eraseBackPtNotch,
  symbolRowsLeft,
  maskRegions,
  ptBoxLeft,
  ptBoxTop,
  textBandCenter,
  textPolarity,
  typeBarEdges,
} from "./erase";
import { lamaInpaint } from "./lama";
import {
  abilityKinds,
  alignOnIcon,
  countLoyaltyAbilities,
  isTallPlaneswalker,
  measureBoxBottom,
  measureTallPlaneswalker,
  planeswalkerRows,
  PW,
  rowRects,
  splitAbilities,
} from "./planeswalker";
import { preloadSymbols } from "./symbols";
import { SYMBOL_EM, TABLE_ROW, chunkWidth, fitRows, fitText, lineText, type LayoutResult, type Measurer } from "./text";
import {
  findPlaque2003,
  findBoxHighlight,
  findStamp,
  findTokenBar,
  findTokenBarEnd,
  findTokenBoxBottom,
  plaqueRowSpan,
  smallCaps,
  stampShape,
  measureCentered,
  titleIsEmblemWord,
  titleIsLeftAligned,
  TOKEN,
  tokenLayout,
  tokenPtBox,
  type Plaque,
} from "./token";
import { printImage, type PrintRecord, type PtFace } from "./types";

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
  // o texto do Arena vem sem os custos (eles ficam à parte): aí não há o que conferir
  const loyalty = countLoyaltyAbilities(face.text_pt) || undefined;
  // com os custos no texto, cada estática tem lugar certo: antes dos escudos ou depois
  const kinds = abilityKinds(face.text_pt);
  const firstCost = kinds.indexOf(true);
  const lastCost = kinds.lastIndexOf(true);
  // estática entre duas habilidades de lealdade: a moldura não tem esse desenho
  if (loyalty && kinds.slice(firstCost, lastCost + 1).includes(false)) return false;
  const sides = loyalty ? { above: firstCost, below: kinds.length - 1 - lastCost } : undefined;
  // A moldura (alta ou normal) é medida na imagem. Sem medida, vale a contagem: 4
  // habilidades costumam vir na caixa alta, mas duas estáticas num bloco só cabem na
  // normal (Jace, Mago dos Espelhos): sem faixas na caixa alta, tenta a normal
  const measured = measureTallPlaneswalker(data);
  let tall = measured ?? isTallPlaneswalker(paragraphs.length);
  let rows = planeswalkerRows(data, paragraphs.length, loyalty, tall, sides);
  if (!rows && tall && measured === null) {
    tall = false;
    rows = planeswalkerRows(data, paragraphs.length, loyalty, tall, sides);
  }
  if (!rows) return false;
  // cada faixa leva os parágrafos dela (as estáticas de um bloco só vão juntas)
  let next = 0;
  const texts = rows.map((r) => paragraphs.slice(next, (next += r.paragraphs)).join("\n"));
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const tb = tall ? PW.type.tall : PW.type.normal;
  const setLeft = Math.min(Math.max(findSetSymbolLeft(data, Math.round((tb.y0 + 4) * fy), Math.round((tb.y1 - 4) * fy)) / fx, 560), 660);
  const cost = costLeft(print.mana_cost);
  const rects = rows.map(rowRects);
  // a última faixa apaga até logo acima do fio da caixa: o pé das letras da última linha
  // em inglês passa da medida padrão
  const boxBottom = measureBoxBottom(data);
  const lastErase = rects[rects.length - 1].erase;
  if (boxBottom !== null) lastErase.y1 = Math.max(lastErase.y1, Math.min(boxBottom - 2, PW.area.bottom + 12));
  const protect = [toImg(PW.loyaltyBox)];
  // nome e tipo ficam em barras opacas: preenchimento linha a linha, que segue o degradê da barra
  const barInks = eraseRegions(
    data,
    [
      { rect: toImg({ x0: 50, y0: PW.title.erase.y0, x1: cost - 6, y1: PW.title.erase.y1 }), threshold: 28, fill: "rows" },
      // sem o tipo em português, a linha de tipo em inglês fica
      { rect: toImg({ x0: 50, y0: tb.y0, x1: face.type_pt ? setLeft - 6 : 50, y1: tb.y1 }), threshold: 28, fill: "rows" },
    ],
    protect,
  );
  // a caixa de texto é translúcida, com a arte aparecendo por trás: rede neural (ver lama.ts)
  // As faixas de uma mesma caixa têm a mesma cor de letra. Medida faixa a faixa, uma
  // faixa com arte clara atrás (Liliana MIC, −3) virava "texto claro": o inglês ficava
  // e o português saía em branco por cima. Vale a cor da maioria (empate: escuro).
  const votes = rects.map((r) => textPolarity(data, roundRect(toImg(r.erase))));
  const boxPolarity = votes.filter((v) => v === "light").length > votes.length / 2 ? "light" : "dark";
  const masks = maskRegions(
    data,
    rects.map((r) => ({ rect: toImg(r.erase), threshold: 14, colorThreshold: 34, polarity: boxPolarity, tiles: false })),
    protect,
  );
  // abaixo da medida padrão, só o pé das letras de cima (não o canto da moldura)
  keepAttachedBelow(masks[masks.length - 1], PW.area.bottom * fy);
  const area = roundRect(toImg({ x0: PW.staticText.erase, y0: rows[0].y0, x1: PW.eraseRight, y1: lastErase.y1 }));
  // a prévia e o PDF desenham a mesma arte: guarda a caixa limpa para não rodar o modelo de novo
  const key = `${print.id}:${data.width}:${paragraphs.length}`;
  const cached = cleanBoxes.get(key);
  if (cached && cached.width === area.x1 - area.x0 && cached.height === area.y1 - area.y0) {
    for (let y = 0; y < cached.height; y++)
      data.data.set(cached.data.subarray(y * cached.width * 4, (y + 1) * cached.width * 4), ((area.y0 + y) * data.width + area.x0) * 4);
  } else {
    // máscara folgada: o LaMa espalha para dentro do buraco qualquer resto de borda das letras,
    // sem fios da imagem original entre dois pedaços do buraco
    const hole = combineMasks(data, masks, Math.round(fx * 3) + 1, Math.round(fx * 4));
    for (const r of protect.map(roundRect)) for (let y = r.y0; y < r.y1; y++) hole.fill(0, y * data.width + r.x0, y * data.width + r.x1);
    if (!(await lamaInpaint(data, area, hole, protect.map(roundRect)))) {
      for (const m of masks) if (m.mask.length) inpaint(data, m.rect, m.mask);
    } else {
      // o modelo às vezes inventa um pingo de tinta no meio do papel liso
      dropSpecks(data, area, hole, boxPolarity);
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
        text: texts[i],
        width: text.x1 - text.x0,
        height: text.y1 - text.y0,
        notch: under > 0 ? { width: text.x1 - PW.loyaltyBox.x0 + 6, height: under } : undefined,
      };
    }),
    m,
  );
  layouts.forEach((res, i) => {
    const text = rects[i].text;
    const box = alignOnIcon(text, res.height, rows[i].icon, text.y1 > PW.loyaltyBox.y0);
    drawLayout(ctx, res, box, k, inks[2 + i], symbols, m);
  });
  return true;
}

/**
 * Faixas cinza atrás das linhas da tabela de d20, alternadas a partir da primeira, como na
 * carta impressa (Cone of Cold, CLB): cada faixa cobre o parágrafo inteiro dela.
 */
function drawTableBands(
  ctx: CanvasRenderingContext2D,
  res: LayoutResult,
  top: number,
  k: number,
  shade: { x0: number; x1: number; color: string },
) {
  const paragraphs: { y0: number; y1: number; row: boolean }[] = [];
  let y = top;
  res.lines.forEach((line, i) => {
    if (i > 0 && line.first) y += res.paragraphGap;
    if (i === res.flavorStart && i > 0) y += res.paragraphGap * 1.4;
    if (line.first || !paragraphs.length) paragraphs.push({ y0: y, y1: y, row: !line.flavor && TABLE_ROW.test(lineText(line.chunks)) });
    y += res.lineHeight;
    paragraphs[paragraphs.length - 1].y1 = y;
  });
  ctx.save();
  ctx.fillStyle = shade.color;
  let n = 0;
  for (const p of paragraphs) {
    if (!p.row) {
      n = 0;
      continue;
    }
    if (n++ % 2 === 0) {
      const y0 = p.y0 - res.size * 0.05;
      const y1 = p.y1 + res.size * 0.1;
      ctx.fillRect(shade.x0 * k, y0 * k, (shade.x1 - shade.x0) * k, (y1 - y0) * k);
    }
  }
  ctx.restore();
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
  center = false,
  /** faixas da tabela de d20, medidas no original (ver `liftShadedBands`) */
  shade?: { x0: number; x1: number; color: string },
) {
  let y = box.y0 + (box.y1 - box.y0 - res.height) / 2;
  if (shade) drawTableBands(ctx, res, y, k, shade);
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
    if (center) {
      const width = line.chunks.reduce((w, c, ci) => w + chunkWidth(c, res.size, m) + (ci > 0 ? space : 0), 0);
      x += (box.x1 - box.x0 - width) / 2;
    }
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

/** Largura (escala-base) de um nome em versalete no corpo `size`. */
function smallCapsWidth(ctx: CanvasRenderingContext2D, name: string, size: number, k: number, serif = false): number {
  const t = serif ? { ...bodyFont(), weight: "bold", dx: 0 } : titleFont();
  return smallCaps(name).reduce((w, p) => {
    ctx.font = `${t.weight} ${(p.big ? size : size * 0.8) * t.scale * k}px ${t.family}`;
    return w + ctx.measureText(p.text).width / k;
  }, 0);
}

/** Nome de ficha: centralizado, em versalete (como nas fichas impressas). */
function drawSmallCaps(
  ctx: CanvasRenderingContext2D,
  name: string,
  centerY: number,
  x0: number,
  x1: number,
  size: number,
  k: number,
  color: string,
  serif = false,
) {
  // as fichas de 2003 usam uma serifa em negrito: a MPlantin em negrito chega perto
  const t = serif ? { ...bodyFont(), weight: "bold", dx: 0 } : titleFont();
  const parts = smallCaps(name);
  const fontAt = (big: boolean, s: number) => `${t.weight} ${(big ? s : s * 0.8) * t.scale * k}px ${t.family}`;
  const widthAt = (s: number) => smallCapsWidth(ctx, name, s, k, serif);
  let s = size;
  let w = widthAt(s);
  while (w * 0.82 > x1 - x0 && s > 18) w = widthAt((s -= 0.5));
  const sx = w > x1 - x0 ? (x1 - x0) / w : 1;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.translate(((x0 + x1) / 2 - (w * sx) / 2 + t.dx) * k, (centerY + s * t.scale * 0.36) * k);
  ctx.scale(sx, 1);
  let x = 0;
  for (const p of parts) {
    ctx.font = fontAt(p.big, s);
    ctx.fillText(p.text, x * k, 0);
    x += ctx.measureText(p.text).width / k;
  }
  ctx.restore();
}

/**
 * Título da ficha em PT. Nos emblemas até 2019 (e nas reimpressões deles em The List) o
 * título é "Emblem", não o nome do planeswalker: vale o que a largura do título em
 * inglês, medida na imagem (`span`), diz. Senão saía o nome do planeswalker por cima
 * de "Emblem" (emblema da Liliana, Necromante Insolente, ORI).
 */
function emblemTitle(
  ctx: CanvasRenderingContext2D,
  face: PtFace,
  span: { x0: number; x1: number } | null,
  fx: number,
  T: { x0: number; x1: number; size: number },
  k: number,
): string {
  const name = face.name_pt ?? face.name_en;
  const en = face.name_en ?? "";
  if (!span || !face.name_pt || !/ Emblem$/.test(en)) return name;
  // o título é centralizado: a metade mais curta (a outra pode pegar um pedaço claro da
  // barra, como no emblema do Wrenn e Seis, MH1) dá a largura
  const mid = ((T.x0 + T.x1) / 2) * fx;
  const measured = (2 * Math.min(mid - span.x0, span.x1 - mid)) / fx;
  const room = T.x1 - T.x0;
  const asWord = smallCapsWidth(ctx, "Emblem", T.size, k);
  const asName = smallCapsWidth(ctx, en.replace(/ Emblem$/, ""), T.size, k);
  return titleIsEmblemWord(measured, asWord, asName, room) ? "Emblema" : name;
}

/**
 * Ficha: nome em versalete no alto, linha de tipo de altura variável e caixa de
 * texto entre ela e o pé (ver token.ts). Devolve false se a moldura não bater.
 */
async function renderToken(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  data: ImageData;
  toImg: (r: Rect) => Rect;
  face: PtFace;
  frame: string | null;
  W: number;
  H: number;
}): Promise<boolean> {
  const { ctx, data, toImg, face } = p;
  const bar = findTokenBar(data);
  if (!bar) return false;
  // 2003: a placa do nome é repintada com a própria cor, sem o nome em inglês
  const plaque = p.frame === "2003" ? findPlaque2003(data) : null;
  if (p.frame === "2003" && !plaque) return false;
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const barEnd = findTokenBarEnd(data, bar);
  // só o miolo da barra: os fios de cima e de baixo contariam como "tinta" em toda coluna
  const inset = (bar.y1 - bar.y0) * 0.22;
  const setLeft =
    findSetSymbolLeft(data, Math.round((bar.y0 + inset) * fy), Math.round((bar.y1 - inset) * fy), Math.round(barEnd * fx)) / fx;
  const boxBottom = findTokenBoxBottom(data, bar);
  const layout = tokenLayout(bar, setLeft, boxBottom, p.frame, barEnd, findBoxHighlight(data, boxBottom));
  const text = face.text_pt ?? "";
  const ptBox = tokenPtBox(layout, face.pt);
  const stamp = layout.box ? findStamp(data, boxBottom) : null;
  const protect = [toImg(layout.symbol)];
  // a caixa de P/R e o selo ficam e não servem de fonte para o preenchimento (a cor da
  // caixa de P/R vazava como um brilho acima dela)
  const opaque = [...(ptBox ? [toImg(ptBox)] : []), ...(stamp ? stampShape(data, toImg(stamp)) : [])];
  // a caixa segue a cor das letras da linha de tipo: numa caixa translúcida meio clara,
  // meio escura, a contagem de pixels sozinha achava "texto claro" e escrevia em branco
  const typePolarity = textPolarity(data, roundRect(toImg(layout.type)));
  // o nome das fichas de 2003 é dourado: escreve o português na cor das letras apagadas
  if (plaque) paintPlaque(data, plaque);
  const titleRect = toImg(plaque ? { ...layout.title, x1: layout.title.x0 } : layout.title);
  const titleMask = plaque ? null : maskRegions(data, [{ rect: titleRect, threshold: 28, fill: "rows" }], protect)[0];
  // o nome fica no meio da barra: as pontas arredondadas dela, mais claras, também
  // viravam "letra" e saíam remendadas. Ficam protegidas (a máscara continua medida na
  // barra inteira: só na faixa das letras, a mediana de cada linha caía nelas). O começo
  // e o fim das letras vêm só do que contrasta muito: num nome comprido (emblema da
  // Chandra) a ponta clara da barra encostava na última letra e entrava junto
  const strong = plaque ? null : maskRegions(data, [{ rect: titleRect, threshold: 60, fill: "rows" }], protect)[0];
  const span = strong ? centralSpan(strong, 40 * fx) : null;
  const ends = span
    ? [
        { ...titleRect, x1: span.x0 - 8 * fx },
        { ...titleRect, x0: span.x1 + 8 * fx },
      ].filter((r) => r.x1 > r.x0)
    : [];
  // nas outras o nome é branco ou preto, salvo o dourado da placa preta de algumas
  // fichas incolores (Myr de C18): medido antes de apagar
  const nameColor = titleMask ? coloredInk(data, titleMask) : null;
  const boxRect = layout.box ? insideBoxSides(data, toImg(layout.box.erase), 30 * fx) : null;
  // texto de várias linhas centralizado no original (muitos emblemas) sai centralizado
  const centered = boxRect && text.trim() ? measureCentered(data, boxRect, [...protect, ...opaque], fx, typePolarity) : null;
  const [titleInk, typeInk, boxInk] = eraseRegions(
    data,
    [
      // nas barras o fundo muda de cima para baixo: preenche linha a linha
      { rect: titleRect, threshold: 28, fill: "rows" as const },
      { rect: toImg(face.type_pt ? layout.type : { ...layout.type, x1: layout.type.x0 }), threshold: 28, fill: "rows" as const },
      // a marca-d'água atrás do texto vai junto, inteira (só um pedaço dela ficava como mancha)
      ...(boxRect
        ? [
            {
              rect: boxRect,
              threshold: 14,
              colorThreshold: 34,
              polarity: typePolarity,
              stains: true,
              dividers: true,
            },
          ]
        : []),
    ],
    [...protect, ...ends],
    opaque,
  );
  // ficha sem caixa mas com texto em PT: não há onde escrever
  if (!layout.box && text.trim()) return false;
  p.sctx.putImageData(data, 0, 0);
  ctx.drawImage(p.src, 0, 0, p.W, p.H);

  const k = p.W / BASE_W;
  const T = layout.name;
  if (plaque) {
    const pad = 22;
    drawSmallCaps(
      ctx,
      face.name_pt ?? face.name_en,
      (plaque.y0 + plaque.y1) / 2 + 1,
      plaque.x0 + pad,
      plaque.x1 - pad,
      39,
      k,
      plaque.ink,
      true,
    );
  } else if (span && titleIsLeftAligned({ x0: span.x0 / fx, x1: span.x1 / fx }, T)) {
    // nome de carta na moldura de ficha (Secret Lair): na esquerda, sem versalete
    const x = Math.max(T.x0 - 10, span.x0 / fx);
    drawLine(ctx, face.name_pt ?? face.name_en, x, T.centerY, T.x1 - x, 35, k, nameColor ?? INK[titleInk]);
  } else drawSmallCaps(ctx, emblemTitle(ctx, face, span, fx, T, k), T.centerY, T.x0, T.x1, T.size, k, nameColor ?? INK[titleInk]);
  if (face.type_pt)
    drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.x1 - 4 - layout.type.x, TOKEN.typeSize, k, INK[typeInk]);
  if (layout.box && text.trim()) {
    const box = layout.box.text;
    const symbols = await preloadSymbols(text);
    const m = measurer(ctx, k);
    const under = ptBox ? box.y1 - ptBox.y0 : 0;
    const notch = ptBox && under > 0 ? { width: box.x1 - ptBox.x0 + 6, height: under } : undefined;
    const res = fitText(text, null, box.x1 - box.x0, box.y1 - box.y0, m, 34, 15, notch, face.ability_words);
    // uma linha só ("Vínculo com a vida") fica centralizada, como na maioria das fichas
    // impressas, salvo quando o original é alinhado à esquerda (Boo, AFR)
    drawLayout(ctx, res, box, k, boxInk, symbols, m, centered ?? res.lines.length === 1);
  }
  return true;
}

/** Centro medido das letras do nome e do tipo numa carta M15 comum (escala-base). */
const BAR_CENTER = { title: 81.5, type: 616 };

/** Desloca a faixa `i` (0 = nome, 1 = tipo) do layout se as letras estão fora do lugar padrão. */
function alignBar(data: ImageData, layout: FrameLayout, i: 0 | 1, search: Rect, expected: number, fx: number, fy: number) {
  const c = textBandCenter(data, { x0: search.x0 * fx, y0: search.y0 * fy, x1: search.x1 * fx, y1: search.y1 * fy });
  if (c === null) return;
  const dy = c / fy - expected;
  if (Math.abs(dy) < 4 || Math.abs(dy) > 15) return;
  const r = layout.erase[i].rect;
  layout.erase[i] = { ...layout.erase[i], rect: { ...r, y0: r.y0 + dy, y1: r.y1 + dy } };
  if (i === 0) layout.title = { ...layout.title, centerY: layout.title.centerY + dy };
  else layout.type = { ...layout.type, centerY: layout.type.centerY + dy };
}

/** Repinta o miolo da placa do nome (fichas de 2003) com a cor de fundo de cada linha. */
function paintPlaque(data: ImageData, pl: Plaque) {
  const fy = data.height / BASE_H;
  const y0 = Math.round(pl.y0 * fy);
  // spans antes de pintar: a busca do filete de cada linha lê a imagem original
  const spans = pl.rows.map((_, i) => plaqueRowSpan(data, pl, i));
  pl.rows.forEach(([r, g, b], i) => {
    const y = y0 + i;
    // as pontas arredondadas e o filete dourado ficam
    const [x0, x1] = spans[i];
    for (let x = x0; x < x1; x++) {
      const j = (y * data.width + x) * 4;
      data.data[j] = r;
      data.data[j + 1] = g;
      data.data[j + 2] = b;
    }
  });
}

/** Impressões desenhadas na moldura de ficha (emblemas e cada face das fichas de duas faces também). */
const TOKEN_LAYOUTS = new Set(["token", "emblem", "double_faced_token"]);

export async function renderCard(opts: RenderOptions): Promise<RenderResult> {
  const { print, face } = opts;
  const side = opts.side ?? 0;
  const sideInfo = print.sides?.[side] ?? null;
  const scale = opts.scale ?? 1.6;
  // Planeswalker usa sempre o PNG, também na prévia: a rede neural limpa a caixa
  // melhor na imagem sem compressão JPEG, e a caixa limpa é reaproveitada no PDF.
  const pw = !print.sides && /planeswalker/i.test(face?.type_pt ?? opts.typeLine ?? "");
  const version = pw ? "png" : (opts.imageVersion ?? "png");
  const [img] = await Promise.all([opts.source ?? loadImage(printImage(print, version, side)), loadCardFonts()]);

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

  if (TOKEN_LAYOUTS.has(print.layout ?? "")) {
    const done = await renderToken({ ctx, src, sctx, data, toImg, face, frame: print.frame, W, H });
    if (!done) ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: done };
  }

  if (pw) {
    const done = await renderPlaneswalker({ ctx, src, sctx, data, toImg, face, print, W, H });
    if (!done) ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: done };
  }

  // Algumas artes estendidas têm a caixa de texto mais curta e a linha de tipo mais
  // baixa: mede o fio de cima da barra e desloca tipo e caixa juntos.
  const bar = typeBarEdges(data);
  const barTop = bar?.top ?? null;
  // (o primeiro fio achado varia de 573 a 591 na padrão e de 630 a 633 na baixa; o
  // desenho da moldura baixa é sempre o mesmo, 44 abaixo)
  const typeShift = barTop !== null && barTop >= 615 && barTop <= 660 ? 44 : 0;
  const symbolInfo = { colored: -1, lim: 0 };
  const setLeft =
    findSetSymbolLeft(data, Math.round((594 + typeShift) * fy), Math.round((632 + typeShift) * fy), undefined, 100, symbolInfo) / fx;
  const manaCost = sideInfo ? sideInfo.mana_cost : print.mana_cost;
  const hasPt = sideInfo ? sideInfo.has_pt : print.has_pt;
  // lembrete do verso ("4/4") na frente das cartas de transformar
  const backPt = print.layout === "transform" && side === 0 ? (print.sides?.[1]?.pt ?? null) : null;
  const rightIcon = Boolean(sideInfo && side === 1 && !manaCost && hasRightIcon(data));
  const layout = m15Layout(manaCost, hasPt, setLeft, {
    leftIcon: hasLeftIcon(print.effects, Boolean(sideInfo), rightIcon),
    rightIcon,
    indicator: sideInfo?.indicator,
    mdfcStrip: print.layout === "modal_dfc",
    typeShift,
  });
  // caixa escura: arte atrás de uma caixa translúcida, não o papel da M15 (ver darkTextBox)
  if (darkTextBox(data, toImg(layout.box))) {
    ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: false };
  }
  // Algumas digitalizações e molduras (arte estendida) trazem o nome ou o tipo uns
  // pixels acima ou abaixo da medida padrão: mede onde as letras estão e acompanha,
  // para apagar tudo e escrever o português no mesmo lugar.
  alignBar(data, layout, 0, { x0: 70, y0: 45, x1: 420, y1: 120 }, BAR_CENTER.title, fx, fy);
  // (a busca das letras do tipo fica entre os fios da barra, sem o contorno dela: o
  // contorno contava como "letra" e escondia o tipo mais baixo das molduras escuras de BRO)
  const typeSearch =
    bar && !typeShift
      ? { x0: 70, y0: Math.max(585, bar.top + 6), x1: 420, y1: Math.min(645, bar.bottom - 1) }
      : { x0: 70, y0: 585 + typeShift, x1: 420, y1: 645 + typeShift };
  alignBar(data, layout, 1, typeSearch, BAR_CENTER.type + typeShift, fx, fy);
  // a barra pode ir mais fundo que a medida (molduras escuras de BRO): o apagamento do
  // tipo desce até logo acima do fio de baixo dela, sem entrar na caixa
  if (bar) {
    const r = layout.erase[1].rect;
    const limit = 645 + typeShift;
    if (bar.bottom - 3 > r.y1) layout.erase[1] = { ...layout.erase[1], rect: { ...r, y1: Math.min(limit, bar.bottom - 3) } };
  }
  // Símbolo colorido que avança na diagonal sobre o fim do tipo (a adaga de MKM): coluna
  // nenhuma separa o fim do "Detective" da ponta dela, e as últimas letras ficavam em
  // inglês. Linha a linha a adaga começa depois delas: o apagamento do tipo vai até lá, e
  // a adaga de cada linha fica protegida.
  const symbolGuard: Rect[] = [];
  if (symbolInfo.colored > (setLeft + 8) * fx) {
    const sy0 = Math.round((594 + typeShift) * fy);
    const sy1 = Math.round((632 + typeShift) * fy);
    const lefts = symbolRowsLeft(data, sy0, sy1, symbolInfo.colored, symbolInfo.lim, data.width * 0.955);
    const known = lefts.filter((v): v is number => v !== null).map((v) => v / fx);
    const reach = known.length ? Math.max(...known) : setLeft;
    // (só um símbolo de verdade: presente na maior parte das linhas e não muito além)
    if (known.length >= lefts.length * 0.6 && reach > setLeft + 8 && reach < setLeft + 70) {
      const r = layout.erase[1].rect;
      layout.erase[1] = { ...layout.erase[1], rect: { ...r, x1: reach - 2 } };
      lefts.forEach((v, i) => {
        const x = v ?? setLeft * fx;
        symbolGuard.push({ x0: x - 2 * fx, y0: sy0 + i, x1: data.width, y1: sy0 + i + 1 });
      });
      // acima e abaixo das linhas medidas, o símbolo inteiro fica
      symbolGuard.push({ x0: (setLeft - 2) * fx, y0: r.y0 * fy, x1: data.width, y1: sy0 });
      symbolGuard.push({ x0: (setLeft - 2) * fx, y0: sy1, x1: data.width, y1: r.y1 * fy });
    }
  }
  // terreno básico sem texto: o símbolo de mana grande na caixa é desenho, não texto
  const keepBox = /Básic/.test(face.type_pt ?? "") && !(face.text_pt ?? "").trim();
  // a caixa (com marca-d'água) termina no fio interno dela, que muda de lugar entre molduras
  const boxRect = (r: Rect) => (keepBox ? { x0: 0, y0: 0, x1: 0, y1: 0 } : insideBoxSides(data, toImg(r), 30 * fx, true));
  const boxErase = layout.erase.find((e) => e.stains);
  const measuredBox = boxErase ? boxRect(boxErase.rect) : null;
  const found = findStamp(data, 948, 26, 30);
  // nas cartas a última linha de texto desce até perto do selo: a folga de cima fica
  // só no aro dele, para o pé das letras não ficar protegido (sobrava um tracejado)
  const stamp = found ? { ...found, y0: found.y0 + 3 } : null;
  // (seguindo o contorno da cúpula: nos cantos do retângulo cai o pé das letras)
  const stampGuard = stamp ? stampShape(data, toImg(stamp)) : [];
  // Tabela de d20: as faixas cinza saem inteiras no apagamento e voltam atrás das linhas
  // da tabela em português. A caixa de P/R é medida numa cópia com as faixas clareadas:
  // a faixa que passa atrás dela fazia o topo dela parecer mais alto, e a proteção
  // guardava o pé das letras ao lado (Iron Mastiff, CLB)
  const table = measuredBox && !keepBox && (face.text_pt ?? "").split("\n").some((l) => TABLE_ROW.test(l));
  const lifted = table
    ? ({ width: data.width, height: data.height, data: new Uint8ClampedArray(data.data), colorSpace: data.colorSpace } as ImageData)
    : null;
  const bands = lifted && measuredBox ? liftShadedBands(lifted, measuredBox) : null;
  const ptSource = bands && lifted ? lifted : data;
  // a proteção do P/R começa logo acima da caixa medida: com a medida fixa, o pé das
  // letras da última linha (ou um traço do flavor) ficava de fora do apagamento
  if (hasPt && layout.protect[0]) {
    const top = ptBoxTop(ptSource, 610 * fx, 670 * fx, 905 * fy, 950 * fy, 890 * fy);
    if (top !== null) {
      const left = ptBoxLeft(ptSource, top + 22 * fy, 545 * fx, 610 * fx, 890 * fy);
      layout.protect.splice(0, 1, ...ptProtect(top / fy, left === null ? null : left / fx));
    }
  }
  // o texto centrado no original (alguns feitiços curtos) sai centrado: medido antes de
  // apagar; na dúvida, à esquerda
  const boxGuard = [...stampGuard, ...layout.protect.map(toImg)];
  const centered =
    measuredBox && !keepBox && (face.text_pt ?? "").trim() ? measureCentered(data, measuredBox, boxGuard, fx) === true : false;
  const [titleInk, typeInk, boxInk] = eraseRegions(
    data,
    // (abaixo da medida fixa, só o pé das letras: a medida do terço da esquerda pode
    // passar do fio de baixo nas outras partes da caixa)
    layout.erase.map((e) => ({
      rect: e.stains && measuredBox ? measuredBox : toImg(e.rect),
      threshold: e.threshold,
      colorThreshold: e.colorThreshold,
      fill: e.fill,
      stains: e.stains,
      attachedBelow: e.stains ? toImg(e.rect).y1 : undefined,
      force:
        e.stains && bands
          ? bands.bands.map((b) => ({ x0: bands.x0 - 3 * fx, y0: b.y0 - 3 * fy, x1: bands.x1 + 3 * fx, y1: b.y1 + 3 * fy }))
          : undefined,
    })),
    [],
    // o selo de promoção (oval holográfico), a aba das cartas de duas faces e a caixa de
    // P/R sobem para dentro da caixa de texto: ficam, e a cor deles não entra no
    // preenchimento ao lado (a caixa de P/R dourada deixava um brilho dourado acima dela)
    [...stampGuard, ...layout.protect.map(toImg), ...symbolGuard],
  );
  // o lembrete do verso pode passar do lado da caixa, no canto que avança para a moldura (SOI)
  if (backPt && measuredBox && !keepBox) {
    const y1 = layout.box.y1;
    eraseBackPtNotch(data, toImg({ x0: 600, y0: y1 - BACK_PT_NOTCH.height - 14, x1: 716, y1 }), measuredBox.x1);
  }
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
  const res = fitText(
    face.text_pt,
    opts.flavor ?? null,
    box.x1 - box.x0,
    box.y1 - box.y0,
    m,
    34,
    15,
    backPt ? BACK_PT_NOTCH : undefined,
    face.ability_words,
  );
  const shade = bands ? { x0: bands.x0 / fx, x1: bands.x1 / fx, color: `rgb(${bands.color.join(",")})` } : undefined;
  drawLayout(ctx, res, box, k, boxInk, symbols, m, centered, shade);

  return { canvas: out, translated: true };
}
