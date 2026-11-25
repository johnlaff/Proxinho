/**
 * Motor de render do Proxinho: recebe uma impressão em inglês e o texto em
 * português e devolve um canvas com a carta reescrita.
 *
 * Etapas: baixar o PNG do Scryfall → apagar nome, tipo e regras em inglês →
 * ampliar para a resolução de impressão → escrever o português por cima.
 * A arte, a moldura, o custo de mana, o poder/resistência, o artista e o
 * copyright continuam os da carta original.
 */
import {
  SUBTITLE,
  borderlessBox,
  borderlessPtBox,
  borderlessStamp,
  boxDividers,
  glassBarLetters,
  letterBandCenter,
  lightBorderlessBox,
  screenNoise,
  subtitleLetters,
  whiteTextMask,
} from "./borderless";
import { adventureBook, adventureLayout, pageShade, shadePage, type SplitLayout } from "./adventure";
import {
  CLASS,
  classBars,
  classColumn,
  classLabel,
  classPlan,
  classRule,
  classText,
  cutStrip,
  pasteStrip,
  restoreBevel,
} from "./classCard";
import { bodyFont, loadCardFonts, oldNameFont, titleFont, type TitleFont } from "./fonts";
import {
  BACK_PT_NOTCH,
  BASE_H,
  BASE_W,
  beside,
  costLeft,
  hasLeftIcon,
  m15Layout,
  MDFC_STRIP,
  mdfcCostLeft,
  ptProtect,
  TYPE_BAR_END_2003,
  WATERMARK_2003,
  type FrameLayout,
  type Rect,
} from "./geometry";
import {
  barCapGuard,
  centralSpan,
  coloredInk,
  combineMasks,
  dropSpecks,
  eraseRegions,
  findSetSymbolLeft,
  hasLessonIcon,
  hasRightIcon,
  inpaint,
  insideBoxSides,
  keepAttachedBelow,
  liftShadedBands,
  eraseBackPtNotch,
  symbolRowsFrom,
  symbolRowsLeft,
  maskRegions,
  notM15Frame,
  type RegionMask,
  ptBoxLeft,
  ptBoxTop,
  regrain,
  tameInvented,
  textBandCenter,
  textMask,
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
  moveBands,
  planeswalkerBounds,
  planeswalkerRows,
  PW,
  PW_PLAN,
  type PwRow,
  rowRects,
  splitAbilities,
} from "./planeswalker";
import {
  DIVIDER_SPAN,
  SAGA,
  dividerProfile,
  drawDivider,
  sagaArtLeft,
  sagaBands,
  sagaBoxes,
  sagaDividers,
  sagaNumerals,
  sagaPlan,
  sagaText,
  sagaTopFrame,
  TOP_CURVE_CLEAR,
  topAligned,
} from "./saga";
import {
  STATION,
  applyShade,
  cutPiece,
  clipMasks,
  disk,
  holdPixels,
  inkOnly,
  mirrorSides,
  pastePiece,
  restoreFrame,
  ptCore,
  ptShape,
  shadeProfile,
  shadeRatio,
  stationBadges,
  stationBands,
  stationBottom,
  stationPlan,
  stationPt,
  stationText,
  type Piece,
  withoutFrame,
  type StationText,
} from "./station";
import { mdfcHint, type MdfcHint } from "./mdfc";
import { OLD, oldCostLeft, oldLetters, oldTypeEnds } from "./old";
import { prepareFrame, prepareLayout } from "./prepare";
import { ROOM, roomCostLeft, roomFrame } from "./room";
import { SPLIT, splitBoxes, splitCostLeft, splitFrame } from "./split";
import { AFTERMATH, aftermathBox, aftermathCostLeft, aftermathFrame } from "./aftermath";
import { preloadSymbols } from "./symbols";
import {
  SYMBOL_EM,
  TABLE_ROW,
  chunkWidth,
  fitRows,
  fitText,
  lineText,
  rowsAt,
  type LayoutResult,
  type Measurer,
  type TextRow,
} from "./text";
import {
  findPlaque2003,
  findBoxHighlight,
  findCardStamp,
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
  /** cartas de Aventura e de Preparar: a mágica da outra caixa (a segunda face da carta) */
  adventure?: PtFace | null;
  /** cartas modais de duas faces: a outra face, resumida na faixa de baixo (ver mdfc.ts) */
  otherFace?: PtFace | null;
  /** cartas divididas (as Salas de Duskmourn, ver room.ts): a metade da direita; a da esquerda é `face` */
  split?: PtFace | null;
  /** linha de tipo em inglês da carta (reconhece planeswalkers mesmo sem o tipo em PT) */
  typeLine?: string | null;
  /**
   * `false` monta o rascunho: sem a rede neural, com o preenchimento simples onde ela iria. A
   * prévia mostra o rascunho na hora e troca pela carta acabada quando a rede neural termina.
   */
  neural?: boolean;
  /** andamento da rede neural nesta carta: quadros prontos e o total previsto */
  onNeural?: (p: { done: number; total: number }) => void;
}

/** Cor do texto escrito: preto como o das cartas, ou claro nos versos escuros. */
const INK = { dark: "#0b0b0b", light: "#fbf8f1" } as const;

export interface RenderResult {
  canvas: HTMLCanvasElement;
  /** true quando o texto foi reescrito em português */
  translated: boolean;
  /** "neural": saiu a original porque a rede neural não rodou neste navegador */
  reason?: "neural";
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
  t: TitleFont = titleFont(),
) {
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
  ctx.textBaseline = t.baseline;
  ctx.fillStyle = color;
  ctx.translate((x + t.dx) * k, (centerY + s * t.rise) * k);
  ctx.scale(sx, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** O nome em PT na aba das cartas com nome de crossover: itálico, branco, centrado. */
function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, baseline: number, k: number) {
  const f = bodyFont();
  let s = SUBTITLE.size;
  ctx.font = `italic ${s * f.scale * k}px ${f.family}`;
  let w = ctx.measureText(text).width / k;
  while (w * 0.85 > SUBTITLE.maxWidth && s > 15) {
    s -= 0.5;
    ctx.font = `italic ${s * f.scale * k}px ${f.family}`;
    w = ctx.measureText(text).width / k;
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK.light;
  ctx.translate(SUBTITLE.centerX * k, baseline * k);
  ctx.scale(w > SUBTITLE.maxWidth ? SUBTITLE.maxWidth / w : 1, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Caixas já limpas pela rede neural (por impressão), as mais recentes, até `CLEAN_BYTES`. */
const cleanBoxes = new Map<string, ImageData>();
/**
 * Memória das caixas limpas: a prévia e o PDF desenham a mesma arte, e o PDF não deve rodar o
 * modelo de novo. Com o limite de 24 caixas, um pedido com mais de oito artes sem borda (três
 * caixas cada) rodava tudo de novo no PDF; 96 MB cobrem umas 40 cartas.
 */
const CLEAN_BYTES = 96e6;
/** Caixas que a rede neural está limpando agora: a segunda montagem espera a primeira (prévia e PDF). */
const cleaning = new Map<string, Promise<void>>();

function rememberBox(key: string, box: ImageData) {
  cleanBoxes.delete(key);
  cleanBoxes.set(key, box);
  let bytes = 0;
  for (const b of cleanBoxes.values()) bytes += b.data.length;
  for (const [k, b] of cleanBoxes) {
    if (bytes <= CLEAN_BYTES || cleanBoxes.size <= 1) break;
    cleanBoxes.delete(k);
    bytes -= b.data.length;
  }
}

/** Arredonda um retângulo para a grade de pixels. */
const roundRect = (r: Rect): Rect => ({ x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) });

/**
 * Rede neural de uma montagem: `enabled` falso no rascunho (preenchimento simples onde ela iria),
 * e `tick` conta os quadros prontos para o andamento da prévia.
 */
type Neural = { enabled: boolean; tick: (frames?: number) => void };

/**
 * Apaga as letras de uma caixa translúcida (a arte aparece por trás) com a rede neural (ver
 * lama.ts): planeswalkers e moldura sem borda. `area` é o retângulo preenchido (escala da
 * imagem, inteiro); `protect` fica como está e escondido do modelo. Cada caixa é um quadro do
 * modelo (ver `lamaInpaint`). `art` diz que há arte atrás da caixa (sem borda): a cor que o
 * modelo inventa volta à da vizinhança e o grão da arte volta ao remendo (`tameInvented`,
 * `regrain`). `keep` fica como está, sem sair do buraco nem do que o modelo vê. `grow` e `gap` são a folga da máscara e os
 * vãos entre pedaços dela que entram no buraco (ver `combineMasks`). A prévia e o PDF desenham a mesma arte: a
 * caixa limpa fica guardada por `key` para não rodar o modelo de novo (e, se as duas pedem ao
 * mesmo tempo, a segunda espera a primeira). Sem o modelo, volta
 * para o preenchimento simples, salvo com `simple: false`: aí devolve `false` e a imagem fica
 * como está (na arte sem borda o preenchimento simples deixa um borrão; a carta sai na original).
 * No rascunho (`neural.enabled` falso), sempre o preenchimento simples.
 */
async function lamaBox(
  data: ImageData,
  masks: RegionMask[],
  area: Rect,
  protect: Rect[],
  polarity: "dark" | "light",
  key: string,
  {
    art = false,
    grow,
    gap,
    simple = true,
    neural,
    keep = [],
  }: { art?: boolean; grow?: number; gap?: number; simple?: boolean; neural?: Neural; keep?: Rect[] } = {},
): Promise<boolean> {
  const fx = data.width / BASE_W;
  const quick = () => {
    for (const m of masks) if (m.mask.length) inpaint(data, m.rect, m.mask);
  };
  if (neural && !neural.enabled) {
    quick();
    return true;
  }
  await cleaning.get(key);
  const cached = cleanBoxes.get(key);
  if (cached && cached.width === area.x1 - area.x0 && cached.height === area.y1 - area.y0) {
    for (let y = 0; y < cached.height; y++)
      data.data.set(cached.data.subarray(y * cached.width * 4, (y + 1) * cached.width * 4), ((area.y0 + y) * data.width + area.x0) * 4);
    neural?.tick();
    return true;
  }
  let release = () => {};
  cleaning.set(key, new Promise<void>((r) => (release = r)));
  try {
    // máscara folgada: o LaMa espalha para dentro do buraco qualquer resto de borda das letras,
    // sem fios da imagem original entre dois pedaços do buraco
    const hole = combineMasks(data, masks, grow ?? Math.round(fx * 3) + 1, gap ?? Math.round(fx * 4));
    for (const r of [...protect, ...keep].map(roundRect))
      for (let y = r.y0; y < r.y1; y++) hole.fill(0, y * data.width + r.x0, y * data.width + r.x1);
    if (!(await lamaInpaint(data, area, hole, protect.map(roundRect), () => neural?.tick()))) {
      if (!simple) return false;
      quick();
      return true;
    }
    // na arte calma atrás da caixa sem borda o modelo às vezes inventa cor que não há em volta
    if (art) tameInvented(data, area, hole, protect.map(roundRect));
    // o modelo às vezes inventa um pingo de tinta no meio do papel liso
    dropSpecks(data, area, hole, polarity);
    if (art) regrain(data, area, hole);
    const box = new ImageData(area.x1 - area.x0, area.y1 - area.y0);
    for (let y = 0; y < box.height; y++)
      box.data.set(
        data.data.subarray(((area.y0 + y) * data.width + area.x0) * 4, ((area.y0 + y) * data.width + area.x1) * 4),
        y * box.width * 4,
      );
    rememberBox(key, box);
    return true;
  } finally {
    cleaning.delete(key);
    release();
  }
}

/**
 * Planeswalker: nome, tipo e uma faixa por habilidade (ver planeswalker.ts).
 * Devolve false quando a imagem não bate com o texto; aí a carta sai original.
 */
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
  neural: Neural;
  plan: (frames: number) => void;
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
  const measuredRows = rows;
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
  const titleBar = toImg({ x0: 50, y0: PW.title.erase.y0, x1: cost - 6, y1: PW.title.erase.y1 });
  const typeBar = toImg({ x0: 50, y0: tb.y0, x1: face.type_pt ? setLeft - 6 : 50, y1: tb.y1 });
  const barInks = eraseRegions(
    data,
    [
      { rect: titleBar, threshold: 28, fill: "rows" },
      // sem o tipo em português, a linha de tipo em inglês fica
      { rect: typeBar, threshold: 28, fill: "rows" },
    ],
    protect,
    [],
    // a ponta arredondada das barras fica como está (ver barCapGuard)
    [
      ...barCapGuard(data, titleBar, "left"),
      ...barCapGuard(data, typeBar, "left"),
      ...(print.mana_cost ? [] : barCapGuard(data, titleBar, "right")),
    ],
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
  p.plan(1);
  await lamaBox(data, masks, area, protect, boxPolarity, `${print.id}:${data.width}:${paragraphs.length}`, { neural: p.neural });
  const inks = [...barInks, ...masks.map((m) => m.polarity)];

  const k = p.W / BASE_W;
  const symbols = await preloadSymbols(face.text_pt);
  const m = measurer(ctx, k);
  const spec = (rs: PwRow[]): TextRow[] =>
    rs.map((r, i) => {
      const { text } = rowRects(r);
      // a faixa de baixo desvia da caixa da lealdade inicial
      const under = text.y1 - PW.loyaltyBox.y0;
      return {
        text: texts[i],
        width: text.x1 - text.x0,
        height: text.y1 - text.y0,
        notch: under > 0 ? { width: text.x1 - PW.loyaltyBox.x0 + 6, height: under } : undefined,
      };
    });
  let layouts = fitRows(spec(rows), m);
  // com as divisas em outro lugar, o texto em PT cabe num corpo maior: elas mudam de lugar na
  // imagem já sem o texto, antes de ela ir para o canvas
  const planned = planRows(rows, spec, m, layouts);
  if (planned) {
    moveBands(
      data,
      rows[0].y0,
      rows[rows.length - 1].y1,
      measuredRows.slice(1).map((r) => r.y0),
      planned.rows.slice(1).map((r) => r.y0),
      [PW.loyaltyBox],
    );
    rows = planned.rows;
    layouts = planned.layouts;
  }
  p.sctx.putImageData(data, 0, 0);
  ctx.drawImage(p.src, 0, 0, p.W, p.H);

  drawLine(ctx, face.name_pt ?? face.name_en, 66, PW.title.centerY, cost - 12 - 66, 35, k, INK[inks[0]]);
  if (face.type_pt) drawLine(ctx, face.type_pt, 66, tb.centerY, setLeft - 10 - 66, 30, k, INK[inks[1]]);

  layouts.forEach((res, i) => {
    const text = rowRects(rows![i]).text;
    const box = alignOnIcon(text, res.height, rows![i].icon, text.y1 > PW.loyaltyBox.y0);
    drawLayout(ctx, res, box, k, inks[2 + i], symbols, m);
  });
  return true;
}

/**
 * As faixas do planeswalker com as divisas em outro lugar, quando o texto em PT cabe assim num
 * corpo pelo menos 1 px maior que com as divisas do inglês (`fit`): com elas, a habilidade que
 * mais cresceu na tradução encolhia a letra de todas, com espaço sobrando nas outras (Will Kenrith,
 * BBD 1; Kaito Shizuki, NEO 226). Procura do maior corpo para baixo: as divisas que
 * `planeswalkerBounds` acha para cada faixa ter o texto com folga, conferidas diagramando de novo.
 * Texto que não cabia nem no menor corpo também ganha as divisas novas, se couber com elas.
 */
function planRows(
  rows: PwRow[],
  spec: (rs: PwRow[]) => TextRow[],
  m: Measurer,
  fit: LayoutResult[],
): { rows: PwRow[]; layouts: LayoutResult[] } | null {
  const base = spec(rows);
  const overflow = fit.some((l, i) => l.height > base[i].height);
  const floor = overflow ? 15 : (fit[0]?.size ?? 32) + 1;
  for (let size = 32; size >= floor; size -= 0.5) {
    const need = rowsAt(base, m, size).map((l) => l.height + 6 + 2 * PW_PLAN.pad);
    const bounds = planeswalkerBounds(rows, need);
    if (!bounds) continue;
    const next = rows.map((r, i) => ({ ...r, y0: i ? bounds[i - 1] : r.y0, y1: i < rows.length - 1 ? bounds[i] : r.y1 }));
    const rowsSpec = spec(next);
    const res = rowsAt(rowsSpec, m, size);
    if (res.every((l, i) => l.height <= rowsSpec[i].height)) return { rows: next, layouts: res };
  }
  return null;
}

/**
 * Saga (ver saga.ts): nome no alto como na carta comum, barra de tipo no pé e a coluna de
 * texto à esquerda da arte, com uma faixa por capítulo entre os fios medidos na imagem. O
 * papel da coluna é opaco (com a marca-d'água de algumas, como em Dominaria): o apagamento
 * é o da caixa comum, faixa por faixa, sem a tira dos marcadores. Cada capítulo vai na faixa
 * dele, centrado nos seus marcadores, todos no mesmo corpo, como na carta impressa; a faixa do
 * alto leva o que vem antes dos capítulos (o lembrete oficial, que o pipeline tira das Sagas
 * impressas em PT, e o "Adiantar leitura"; sem nada para o alto, o fio de cima sai). O português é mais
 * comprido e cada capítulo muda de tamanho de um jeito: os fios mudam de lugar, entre os
 * marcadores, para o texto caber no maior corpo possível (ver `sagaPlan`), e são redesenhados
 * com a sombra medida no original. Sem achar os números dos marcadores, os fios ficam onde
 * estão. Devolve `false` (a carta sai na original) quando a moldura ou o número de faixas não
 * batem, ou quando o texto não cabe nem no menor corpo.
 */
async function renderSaga(p: {
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
  const parts = sagaText(face.text_pt);
  if (!parts) return false;
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const artLeft = sagaArtLeft(data);
  const bar = typeBarEdges(data, 850, 960);
  if (artLeft === null || !bar || bar.top < SAGA.type.y0 || bar.top > SAGA.type.y1) return false;
  // uma faixa por grupo de capítulos, mais a do alto
  const dividers = sagaDividers(data, artLeft);
  if (dividers.length !== parts.chapters.length) return false;
  const bands = sagaBands(dividers, artLeft);
  // os números dos marcadores de cada capítulo, conferidos com o grupo ("I, II" são dois)
  const numerals = sagaNumerals(data, dividers[0], SAGA.column.y1);
  const edges = [...dividers, SAGA.column.y1];
  const markers = parts.chapters.map((c, i) => {
    const inBand = numerals.filter((y) => y > edges[i] && y < edges[i + 1]);
    return inBand.length === c.numerals.split(", ").length ? { first: inBand[0], last: inBand[inBand.length - 1] } : null;
  });
  const found = markers.every((x): x is { first: number; last: number } => x !== null) ? markers : null;

  // a barra de tipo é a da carta comum, mais abaixo (o fio de baixo fica em ~639 na comum)
  const typeShift = bar.bottom - 639;
  const symbolInfo: { colored: number; lim: number; tight?: boolean } = { colored: -1, lim: 0 };
  const setLeft =
    findSetSymbolLeft(data, Math.round((594 + typeShift) * fy), Math.round((632 + typeShift) * fy), undefined, 100, symbolInfo) / fx;
  const layout = m15Layout(print.mana_cost, false, setLeft, { typeShift, leftIcon: hasLeftIcon(print.effects, false, false) });
  alignBar(data, layout, 0, { x0: 70, y0: 45, x1: 420, y1: 120 }, BAR_CENTER.title, fx, fy);
  alignBar(data, layout, 1, { x0: 70, y0: bar.top + 6, x1: 420, y1: bar.bottom - 1 }, BAR_CENTER.type + typeShift, fx, fy);
  const r = layout.erase[1].rect;
  if (bar.bottom - 3 > r.y1) layout.erase[1] = { ...layout.erase[1], rect: { ...r, y1: bar.bottom - 3 } };

  // o texto: a faixa do alto só entra quando tem texto; as linhas de palavra de habilidade (o
  // nome do capítulo nas Invocações de Final Fantasy) saem em itálico
  const k = p.W / BASE_W;
  const m = measurer(ctx, k);
  const italic = new Set(face.ability_words ?? []);
  const hasTop = parts.top.length > 0;
  const rows = [
    ...(hasTop
      ? [{ band: 0, text: parts.top.map((t) => t.text).join("\n"), italic: parts.top.flatMap((t, i) => (italic.has(t.line) ? [i] : [])) }]
      : []),
    ...parts.chapters.map((c, i) => ({ band: i + 1, text: c.text, italic: italic.has(c.line) ? [0] : [] })),
  ];
  const width = (row: { band: number }) => artLeft - 10 - (row.band === 0 ? SAGA.text.topX0 : SAGA.text.chapterX0);
  let plan: number[] | null = null;
  let layouts: LayoutResult[] = [];
  if (found) {
    for (let size = SAGA_MAX_SIZE; size >= SAGA_MIN_SIZE && !plan; size -= 0.5) {
      layouts = rowsAt(
        rows.map((row) => ({ text: row.text, width: width(row), height: Infinity, italic: row.italic })),
        m,
        size,
      );
      plan = sagaPlan(
        layouts.map((l) => l.height),
        hasTop,
        found,
        dividers[0] - TOP_CURVE_CLEAR,
      );
    }
  }
  // sem os números, ou sem lugar para os fios: as faixas ficam como estão
  const boxes = plan ? sagaBoxes(plan, hasTop, artLeft) : rows.map((row) => bands[row.band].text);
  if (!plan) {
    layouts = fitRows(
      rows.map((row, i) => ({ text: row.text, width: boxes[i].x1 - boxes[i].x0, height: boxes[i].y1 - boxes[i].y0, italic: row.italic })),
      m,
      SAGA_MAX_SIZE,
      SAGA_MIN_SIZE,
    );
    // nem no menor corpo coube: melhor a original que texto por cima do fio
    if (layouts.some((l, i) => l.height > boxes[i].y1 - boxes[i].y0)) return false;
  }

  const capGuard = [
    ...layout.erase.slice(0, 2).flatMap((e) => barCapGuard(data, toImg(e.rect), "left")),
    ...(print.mana_cost ? [] : barCapGuard(data, toImg(layout.erase[0].rect), "right")),
  ];
  const orig = plan ? new ImageData(new Uint8ClampedArray(data.data), data.width, data.height) : null;
  // os fios que mudam de lugar saem junto: a faixa de cada um entra inteira na máscara, com
  // papel em cima e embaixo para o preenchimento
  const lineX0 = SAGA.chapterX0 - 2;
  const lineX1 = artLeft - 4;
  // (sem texto no alto, o fio de cima sai e os outros vêm depois dele no plano)
  const next = (i: number) => (plan ? (hasTop ? plan[i] : i ? plan[i - 1] : null) : dividers[i]);
  const moved = dividers.filter((d, i) => next(i) !== d);
  const drawn = dividers.map((_, i) => next(i)).filter((y, i): y is number => y !== null && y !== dividers[i]);
  // a curva da tira dos marcadores, no pé da faixa do alto, é moldura (ver sagaTopFrame)
  const topFrame = sagaTopFrame(data, bands[0].erase.y0 * fy, dividers[0], artLeft);
  const inks = eraseRegions(
    data,
    [
      ...layout.erase.slice(0, 2).map((e) => ({ rect: toImg(e.rect), threshold: e.threshold, fill: e.fill })),
      // sem crescer a mancha: a marca-d'água de algumas coleções (o redemoinho de Dominaria,
      // o brasão de Benália) atravessa as faixas, e cada faixa levava o pedaço dela; o resto
      // ficava cortado. As letras saem e a marca-d'água fica inteira
      ...bands.map((b) => ({ rect: roundRect(toImg(b.erase)), threshold: 14, colorThreshold: 34 })),
      ...moved.map((d) => ({
        rect: roundRect(toImg({ x0: lineX0, y0: d - DIVIDER_SPAN.above - 10, x1: lineX1, y1: d + DIVIDER_SPAN.below + 8 })),
        threshold: 255,
        force: [roundRect(toImg({ x0: lineX0, y0: d - DIVIDER_SPAN.above - 1, x1: lineX1, y1: d + DIVIDER_SPAN.below + 1 }))],
      })),
    ],
    [],
    topFrame,
    capGuard,
  );
  if (plan && orig) {
    // a sombra do fio, medida num fio entre capítulos (o de cima pode ter o texto do alto colado)
    const ref = Math.round(dividers[dividers.length > 1 ? 1 : 0] * fy);
    const profile = dividerProfile(orig, data, ref, lineX0 * fx, lineX1 * fx);
    for (const y of drawn) drawDivider(data, Math.round(y * fy), profile, lineX0 * fx, lineX1 * fx);
  }
  p.sctx.putImageData(data, 0, 0);
  ctx.drawImage(p.src, 0, 0, p.W, p.H);

  drawLine(
    ctx,
    face.name_pt ?? face.name_en,
    layout.title.x,
    layout.title.centerY,
    layout.title.maxWidth,
    layout.title.size,
    k,
    INK[inks[0]],
  );
  if (face.type_pt)
    drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.maxWidth, layout.type.size, k, INK[inks[1]]);
  const symbols = await preloadSymbols(face.text_pt);
  layouts.forEach((res, i) => {
    const row = rows[i];
    // na faixa de capítulo o texto fica na altura dos marcadores, se couber
    const mk = found && row.band > 0 ? found[row.band - 1] : null;
    // (e o do alto fica encostado em cima, ver topAligned)
    const box = mk
      ? alignOnIcon(boxes[i], res.height, (mk.first + mk.last) / 2, false)
      : row.band === 0
        ? topAligned(boxes[i], res.height)
        : boxes[i];
    drawLayout(ctx, res, box, k, inks[2 + row.band], symbols, m);
  });
  return true;
}

/**
 * Classe (ver classCard.ts): nome no alto e barra de tipo no pé como na Saga, e a coluna de
 * texto à direita da arte. O lembrete oficial (que o pipeline tira das Classes impressas em PT)
 * vai na caixa do alto, acima do fio fino, que fica. As barras de nível são recortadas da
 * imagem com o custo (o "Level N" sai antes), a coluna é apagada e as barras voltam onde o texto
 * em PT pede: todas as habilidades no mesmo corpo, o maior que cabe, e a folga dividida por
 * igual, como na carta impressa em PT. Devolve `false` (a carta sai na original) quando a
 * moldura, o fio ou o número de barras não batem, ou quando o texto não cabe nem no menor corpo.
 */
async function renderClass(p: {
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
  const parts = classText(face.text_pt);
  if (!parts) return false;
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const col = classColumn(data);
  const bar = typeBarEdges(data, 850, 960);
  if (!col || !bar || bar.top < CLASS.type.y0 || bar.top > CLASS.type.y1) return false;
  const rule = classRule(data, col);
  const lines = classBars(data, col);
  if (rule === null || lines.length !== parts.levels.length) return false;

  // a barra de tipo é a da carta comum, mais abaixo (como na Saga)
  const typeShift = bar.bottom - 639;
  const symbolInfo: { colored: number; lim: number; tight?: boolean } = { colored: -1, lim: 0 };
  const setLeft =
    findSetSymbolLeft(data, Math.round((594 + typeShift) * fy), Math.round((632 + typeShift) * fy), undefined, 100, symbolInfo) / fx;
  const layout = m15Layout(print.mana_cost, false, setLeft, { typeShift, leftIcon: hasLeftIcon(print.effects, false, false) });
  alignBar(data, layout, 0, { x0: 70, y0: 45, x1: 420, y1: 120 }, BAR_CENTER.title, fx, fy);
  alignBar(data, layout, 1, { x0: 70, y0: bar.top + 6, x1: 420, y1: bar.bottom - 1 }, BAR_CENTER.type + typeShift, fx, fy);
  const r = layout.erase[1].rect;
  if (bar.bottom - 3 > r.y1) layout.erase[1] = { ...layout.erase[1], rect: { ...r, y1: bar.bottom - 3 } };

  // o texto: as habilidades no mesmo corpo, o maior em que a folga entre elas e as barras cabe
  const k = p.W / BASE_W;
  const m = measurer(ctx, k);
  const italic = new Set(face.ability_words ?? []);
  const x0 = col.left + CLASS.text.left;
  const x1 = col.bevel - CLASS.text.right;
  const top = rule + 4;
  const bottom = Math.min(CLASS.bottom, bar.top - 3);
  const rows = parts.sections.map((s) => ({
    text: s.text,
    width: x1 - x0,
    height: Infinity,
    italic: s.lines.flatMap((l, j) => (italic.has(l) ? [j] : [])),
  }));
  let plan: ReturnType<typeof classPlan> = null;
  let layouts: LayoutResult[] = [];
  for (let size = CLASS_MAX_SIZE; size >= CLASS_MIN_SIZE && !plan; size -= 0.5) {
    layouts = rowsAt(rows, m, size);
    plan = classPlan(
      layouts.map((l) => l.height),
      top,
      bottom,
    );
  }
  if (!plan) return false;
  // o lembrete na caixa do alto, no corpo das habilidades ou menor (o português pede três linhas)
  const reminderBox = { x0, y0: CLASS.reminder.y0 + 2, x1, y1: rule - 3 };
  const [reminder] = fitRows(
    [{ text: parts.reminder, width: x1 - x0, height: reminderBox.y1 - reminderBox.y0 }],
    m,
    layouts[0].size,
    CLASS_MIN_SIZE - 3,
  );
  if (reminder.height > reminderBox.y1 - reminderBox.y0) return false;

  const capGuard = [
    ...layout.erase.slice(0, 2).flatMap((e) => barCapGuard(data, toImg(e.rect), "left")),
    ...(print.mana_cost ? [] : barCapGuard(data, toImg(layout.erase[0].rect), "right")),
  ];
  // 1. o "Level N" sai das barras (o degradê muda de linha a linha), e as barras são recortadas
  // com o custo, do fio da esquerda até o da direita (a linha preta passa pelo bisel)
  const labels = lines.map((y) => classLabel(data, col, y));
  eraseRegions(
    data,
    labels.map((l) => ({ rect: roundRect(toImg(l.rect)), threshold: 28, fill: "rows" as const })),
    [],
  );
  const stripX0 = Math.round((col.left + 2) * fx);
  const stripX1 = Math.round(col.right * fx);
  const strips = lines.map((y) =>
    cutStrip(data, Math.round((y - CLASS.bar.above) * fy), Math.round((y + CLASS.bar.below) * fy), stripX0, stripX1),
  );

  // 2. a coluna: o lembrete e as habilidades saem como letras no papel; as barras, inteiras
  const old = lines.map((y) => ({ y0: y - CLASS.bar.above, y1: y + CLASS.bar.below }));
  const edges = [top, ...old.flatMap((o) => [o.y0, o.y1]), bottom];
  const paper = (y0: number, y1: number) => ({
    rect: roundRect(toImg({ x0: col.left + 2, y0, x1: col.bevel - 1, y1 })),
    threshold: 14,
    colorThreshold: 34,
  });
  const inks = eraseRegions(
    data,
    [
      ...layout.erase.slice(0, 2).map((e) => ({ rect: toImg(e.rect), threshold: e.threshold, fill: e.fill })),
      paper(CLASS.reminder.y0 - 1, rule - 1),
      ...edges.flatMap((y, i) => (i % 2 === 0 && i + 1 < edges.length ? [paper(y, edges[i + 1])] : [])),
      ...old.map((o) => ({
        rect: roundRect(toImg({ x0: col.left + 1, y0: o.y0 - 10, x1: col.bevel - 1, y1: o.y1 + 8 })),
        threshold: 255,
        force: [roundRect(toImg({ x0: col.left + 1, y0: o.y0, x1: col.bevel - 1, y1: o.y1 }))],
      })),
    ],
    [],
    [],
    capGuard,
  );
  const bevelX0 = Math.round((col.bevel - 1) * fx);
  for (const o of old) restoreBevel(data, Math.round(o.y0 * fy), Math.round(o.y1 * fy), bevelX0, stripX1, Math.round((o.y0 - 4) * fy));
  // 3. as barras voltam onde o texto em PT pede
  plan.bars.forEach((y, i) => pasteStrip(data, strips[i], Math.round((y - CLASS.bar.above) * fy)));
  p.sctx.putImageData(data, 0, 0);
  ctx.drawImage(p.src, 0, 0, p.W, p.H);

  drawLine(
    ctx,
    face.name_pt ?? face.name_en,
    layout.title.x,
    layout.title.centerY,
    layout.title.maxWidth,
    layout.title.size,
    k,
    INK[inks[0]],
  );
  if (face.type_pt)
    drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.maxWidth, layout.type.size, k, INK[inks[1]]);
  const symbols = await preloadSymbols(face.text_pt);
  drawLayout(ctx, reminder, reminderBox, k, "dark", symbols, m);
  layouts.forEach((res, i) => drawLayout(ctx, res, { x0, y0: plan.tops[i], x1, y1: plan.tops[i] + res.height }, k, "dark", symbols, m));
  plan.bars.forEach((y, i) => drawLevel(ctx, parts.levels[i], labels[i].right, y + labels[i].center - lines[i], k));
  return true;
}

/**
 * Caixa das naves e planetas com Posicionar (ver station.ts), depois de o nome e o tipo serem
 * medidos como na carta comum (`layout`, com o símbolo da coleção protegido em `symbolGuard`).
 * As faixas dos níveis mudam de lugar para o português: o escurecimento delas sai, as letras,
 * os selos e a caixa de P/R saem com a rede neural (a moldura dos lados é refeita na vertical),
 * as faixas escurecem de novo onde o texto pede e selos e P/R voltam no meio delas. Devolve
 * "original" quando a moldura não bate com o texto ou o texto não cabe, e "neural" quando a
 * rede neural não roda (o preenchimento simples deixaria um borrão sobre a arte).
 */
async function renderStation(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  data: ImageData;
  toImg: (r: Rect) => Rect;
  face: PtFace;
  print: PrintRecord;
  W: number;
  H: number;
  neural: Neural;
  plan: (frames: number) => void;
  layout: FrameLayout;
  symbolGuard: Rect[];
  parts: StationText;
  manaCost: string | null;
}): Promise<"ok" | "original" | "neural"> {
  const { ctx, data, toImg, face, print, layout, parts } = p;
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const bottom = stationBottom(data);
  if (bottom === null || Math.abs(bottom - STATION.box.y1) > 8) return "original";
  const top = STATION.box.y0;
  const centers = stationBadges(data, top, bottom);
  if (centers.length !== parts.levels.length) return "original";
  const oldTops = stationBands(centers, bottom, top);
  if (!oldTops) return "original";
  const pt = stationPt(data, centers[centers.length - 1]);
  if (print.has_pt && !pt) return "original";

  // o texto: tudo no mesmo corpo, o maior em que a folga em volta de cada texto cabe
  const k = p.W / BASE_W;
  const m = measurer(ctx, k);
  const italic = new Set(face.ability_words ?? []);
  const { main: mainX, level: levelX, right } = STATION.text;
  const lastRight = pt ? pt.x0 - 8 : right;
  let line = 0;
  const rows = [parts.main, ...parts.levels.map((l) => l.text)].map((text, i) => {
    const count = text.split("\n").length;
    const lines = Array.from({ length: count }, (_, j) => line + j);
    line += count;
    const x0 = i === 0 ? mainX : levelX;
    const x1 = i === parts.levels.length ? lastRight : right;
    return { text, width: x1 - x0, height: Infinity, italic: lines.flatMap((l, j) => (italic.has(l) ? [j] : [])) };
  });
  // (o selo da coleção sobe para dentro da caixa: a última linha que passa por cima dele acaba
  // acima do aro, como no inglês, e não encostada nele, The Eternity Elevator)
  const stampFound = findCardStamp(data);
  const below = (res: LayoutResult) => {
    const last = res.lines[res.lines.length - 1];
    if (!stampFound || !last) return 0;
    const space = m.text(" ", res.size, false);
    const x0 = levelX + (last.indent ?? 0);
    const x1 = x0 + last.chunks.reduce((w, c, i) => w + chunkWidth(c, res.size, m) + (i ? space : 0), 0);
    return x1 <= stampFound.x0 || x0 >= stampFound.x1 ? 0 : bottom - (stampFound.y0 - STATION.stampClear);
  };
  let plan: ReturnType<typeof stationPlan> = null;
  let layouts: LayoutResult[] = [];
  for (let size = STATION_MAX_SIZE; size >= STATION_MIN_SIZE && !plan; size -= 0.5) {
    layouts = rowsAt(rows, m, size);
    plan = stationPlan(
      layouts[0].height,
      layouts.slice(1).map((l) => l.height),
      top,
      bottom,
      below(layouts[layouts.length - 1]),
    );
  }
  if (!plan) return "original";
  const newTops = plan.bands.map((b) => b.top);
  const middle = (tops: number[], i: number) => (tops[i] + (tops[i + 1] ?? bottom)) / 2;

  // a letra da caixa é escura (a moldura não tem caixa escura nas naves de borda preta)
  const boxRect = roundRect(toImg({ x0: STATION.band.x0, y0: top, x1: STATION.band.x1, y1: bottom }));
  if (textPolarity(data, boxRect) !== "dark") return "original";

  // 1. o nome e o tipo, como na carta comum
  const capGuard = [
    ...layout.erase.slice(0, 2).flatMap((e) => barCapGuard(data, toImg(e.rect), "left")),
    ...(p.manaCost ? [] : barCapGuard(data, toImg(layout.erase[0].rect), "right")),
  ];
  const inks = eraseRegions(
    data,
    layout.erase.slice(0, 2).map((e) => ({ rect: toImg(e.rect), threshold: e.threshold, fill: e.fill })),
    [],
    p.symbolGuard,
    capGuard,
  );

  // 2. selos e P/R recortados da imagem original; a máscara das letras, também antes de mexer
  const r = STATION.badge.r;
  const badgeRect = (c: number) => ({ x0: STATION.badge.cx - r - 2, y0: c - r - 2, x1: STATION.badge.cx + r + 2, y1: c + r + 2 });
  const badgeShapes = centers.map((c) => disk(STATION.badge.cx * fx, c * fy, (r - 0.5) * fx));
  const badges: Piece[] = centers.map((c, i) => cutPiece(data, toImg(badgeRect(c)), badgeShapes[i]));
  const ptCut = pt
    ? withoutFrame(data, toImg(pt), ptShape(pt, fx, fy), ptCore(pt, fx, fy), Math.round(STATION.pt.frame * fx), STATION.pt.near)
    : null;
  const ptPiece = pt ? cutPiece(data, toImg(pt), ptCut!) : null;
  // (o selo da coleção seguindo o contorno, como na carta comum: o ponto final da última linha
  // em inglês fica logo acima dele)
  const skip = stampFound ? stampShape(data, toImg({ ...stampFound, y0: stampFound.y0 + 3 })) : [];
  // (e uma faixa de papel logo acima dele fica fora do buraco, à vista da rede neural: o selo
  // semeava a máscara, o buraco descia até ele e virava um buraco só com o selo escondido, e
  // a rede neural puxava o escuro da borda preta para cima, uma mancha acima do selo,
  // Sledge-Class Seedship)
  const above = Math.round(STATION.stampGap * fy);
  const stampGuard = skip.map((q) => ({ x0: q.x0, y0: q.y0 - above, x1: q.x1, y1: q.y0 }));
  const bounds = [top, ...oldTops, bottom];
  const masks = maskRegions(
    data,
    bounds.slice(0, -1).map((y, i) => ({
      rect: toImg({ x0: STATION.band.x0 + 1, y0: y + (i ? 3 : 0), x1: STATION.band.x1 - 1, y1: bounds[i + 1] - 3 }),
      threshold: 14,
      colorThreshold: 34,
      polarity: "dark" as const,
      tiles: false,
    })),
    [...skip, ...stampGuard],
    [...skip, ...stampGuard],
  ).map((m) => inkOnly(data, m, Math.round(STATION.ink.area * fx * fy), Math.round(STATION.ink.pad * fx)));
  // o buraco também leva o miolo da caixa embaixo dos selos e da caixa de P/R, e os limites das
  // faixas antigas (a emenda do escurecimento tirado)
  const full = (rect: Rect, inside: (x: number, y: number) => boolean = () => true): RegionMask => {
    const rr = roundRect(rect);
    const w = rr.x1 - rr.x0;
    const mask = new Uint8Array(w * (rr.y1 - rr.y0));
    for (let y = rr.y0; y < rr.y1; y++)
      for (let x = rr.x0; x < rr.x1; x++) if (inside(x + 0.5, y + 0.5)) mask[(y - rr.y0) * w + x - rr.x0] = 1;
    return { rect: rr, mask, polarity: "dark" };
  };
  const extra = [
    ...centers.map((c) => {
      const d = disk(STATION.badge.cx * fx, c * fy, (r + 2) * fx);
      return full(toImg({ x0: STATION.band.x0, y0: c - r - 3, x1: STATION.badge.cx + r + 3, y1: c + r + 3 }), (x, y) => d(x, y) > 0);
    }),
    ...(pt ? [full(toImg({ x0: pt.x0 - 2, y0: pt.y0 - 2, x1: STATION.frame.right, y1: pt.y1 + 2 }))] : []),
    ...oldTops.map((t) => full(toImg({ x0: STATION.band.x0, y0: t - 4, x1: STATION.band.x1, y1: t + 4 }))),
  ];

  // 3. a moldura dos lados onde estavam os selos e a caixa de P/R, refeita na vertical, só onde
  // estava o recorte (a arte de algumas molduras desce pelo lado e não é vertical: refeita num
  // retângulo, ela virava um bloco escuro ao lado do P/R, Entropic Battlecruiser)
  const [lx0, lx1] = STATION.frame.left;
  centers.forEach((c, i) => {
    const b = roundRect(toImg(badgeRect(c)));
    restoreFrame(data, b.y0, b.y1, Math.round(lx0 * fx), Math.round(lx1 * fx), badgeShapes[i]);
  });
  if (pt) {
    const b = roundRect(toImg(pt));
    restoreFrame(data, b.y0 - 2, b.y1 + 2, Math.round(STATION.frame.right * fx), b.x1 + 2, ptCut!);
  }

  // 4. o escurecimento das faixas sai (a razão de cada uma sobre a de cima, medida no limite)
  const y0 = Math.round(top * fy);
  const y1 = Math.round(bottom * fy);
  const bx0 = Math.round(STATION.band.x0 * fx);
  const bx1 = Math.round(STATION.band.x1 * fx);
  const ratios = oldTops.map((t) => shadeRatio(data, Math.round(t * fy), Math.round(90 * fx), Math.round(580 * fx)));
  const rel = (tops: number[]) => tops.map((t) => Math.round(t * fy) - y0);
  // (a faixa de papel acima do selo volta como era no fim: o alto do aro branco dele passa de 255
  // sem o escurecimento e voltava cinza)
  const restoreGuard = holdPixels(data, stampGuard);
  applyShade(data, y0, y1, bx0, bx1, shadeProfile(y1 - y0, rel(oldTops), ratios), true, skip);

  // 5. a rede neural apaga as letras, os selos e a caixa de P/R
  p.plan(2);
  // (com a caixa espelhada para os lados: o buraco dos selos e do P/R encosta na beira dela)
  const xr = Math.round(STATION.frame.right * fx);
  const pad = Math.round(32 * fx);
  const mirrored = mirrorSides(data, [...masks, ...extra], boxRect.y0, boxRect.y1, bx0, xr, pad);
  const area = { ...boxRect, x0: bx0 - pad, x1: xr + pad };
  // (em dois quadros, cada metade na resolução da imagem: num quadro só, a caixa inteira reduzida
  // aos 512 px do modelo, as palavras densas do lembrete em inglês viravam um borrão cinza no
  // lugar delas, Lumen-Class Frigate, EOE 25; a segunda metade vê a primeira já limpa)
  const mid = Math.round((area.x0 + area.x1) / 2);
  let clean = true;
  for (const [x0, tag] of [
    [area.x0, "a"],
    [mid, "b"],
  ] as const) {
    clean &&= await lamaBox(
      mirrored.img,
      clipMasks(mirrored.masks, x0, area.x1),
      { ...area, x0, x1: tag === "a" ? mid : area.x1 },
      skip,
      "dark",
      `${print.id}:${data.width}:estacionar:${tag}`,
      { art: true, simple: false, neural: p.neural, keep: stampGuard },
    );
  }
  if (!clean) return "neural";
  for (let y = boxRect.y0; y < boxRect.y1; y++)
    data.data.set(mirrored.img.data.subarray((y * data.width + bx0) * 4, (y * data.width + xr) * 4), (y * data.width + bx0) * 4);
  // (o pingo de tinta que o modelo inventa na emenda das duas metades fica na beira de cada uma,
  // e a limpeza de cada metade não o tira: a caixa inteira passa por ela de novo, Dawnsire)
  // (sem o selo da coleção, como na rede neural: o contorno escuro dele passava por pingo e o
  // alto do aro saía como um bloco claro, The Eternity Elevator)
  const hole = combineMasks(data, [...masks, ...extra], Math.round(fx * 3) + 1, Math.round(fx * 4));
  for (const r of [...skip, ...stampGuard].map(roundRect))
    for (let y = r.y0; y < r.y1; y++) hole.fill(0, y * data.width + r.x0, y * data.width + r.x1);
  dropSpecks(data, { x0: bx0, y0: boxRect.y0, x1: xr, y1: boxRect.y1 }, hole, "dark");

  // 6. as faixas escurecem de novo onde o texto pede, e selos e P/R voltam no meio delas
  applyShade(data, y0, y1, bx0, bx1, shadeProfile(y1 - y0, rel(newTops), ratios), false, skip);
  restoreGuard();
  badges.forEach((b, i) => pastePiece(data, b, Math.round((middle(newTops, i) - centers[i]) * fy)));
  if (ptPiece) pastePiece(data, ptPiece, Math.round((middle(newTops, newTops.length - 1) - centers[centers.length - 1]) * fy));
  p.sctx.putImageData(data, 0, 0);
  ctx.drawImage(p.src, 0, 0, p.W, p.H);

  drawLine(
    ctx,
    face.name_pt ?? face.name_en,
    layout.title.x,
    layout.title.centerY,
    layout.title.maxWidth,
    layout.title.size,
    k,
    INK[inks[0]],
  );
  if (face.type_pt)
    drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.maxWidth, layout.type.size, k, INK[inks[1]]);
  const symbols = await preloadSymbols(face.text_pt);
  drawLayout(ctx, layouts[0], { x0: mainX, y0: plan.mainTop, x1: right, y1: plan.mainTop + layouts[0].height }, k, "dark", symbols, m);
  layouts.slice(1).forEach((res, i) => {
    const x1 = i === parts.levels.length - 1 ? lastRight : right;
    const t = plan.bands[i].textTop;
    drawLayout(ctx, res, { x0: levelX, y0: t, x1, y1: t + res.height }, k, "dark", symbols, m);
  });
  return "ok";
}

/** Maior corpo do texto das naves com Posicionar (as artes estendidas, sem a explicação, ficam em ~30). */
const STATION_MAX_SIZE = 30;
/** Menor corpo: abaixo disso, a carta sai na original. */
const STATION_MIN_SIZE = 18;

/** Maior corpo do texto da Classe (o inglês fica em ~30). */
const CLASS_MAX_SIZE = 30;
/** Menor corpo do texto da Classe: abaixo disso, a carta sai na original. */
const CLASS_MIN_SIZE = 18;
/** Corpo do rótulo das barras de nível ("Nível 2"), na Beleren como o "Level 2". */
const LEVEL_SIZE = 26;

/** O rótulo da barra de nível, alinhado à direita onde acabava o "Level N". */
function drawLevel(ctx: CanvasRenderingContext2D, text: string, right: number, centerY: number, k: number) {
  const t = titleFont();
  const s = LEVEL_SIZE * t.scale;
  ctx.save();
  ctx.font = `${t.weight} ${s * k}px ${t.family}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK.dark;
  ctx.fillText(text, right * k, (centerY + s * 0.06) * k);
  ctx.restore();
}

/** Maior corpo do texto da Saga (o inglês fica em ~30). */
const SAGA_MAX_SIZE = 30;
/** Menor corpo do texto da Saga: abaixo disso, a carta sai na original. */
const SAGA_MIN_SIZE = 18;

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
  /** o fio antes do flavor (a moldura antiga não tem: só o espaço, ADR 0031) */
  rule = true,
) {
  let y = box.y0 + (box.y1 - box.y0 - res.height) / 2;
  if (shade) drawTableBands(ctx, res, y, k, shade);
  const space = m.text(" ", res.size, false);
  const ink = INK[boxInk];
  ctx.fillStyle = ink;
  ctx.textBaseline = "alphabetic";
  res.lines.forEach((line, i) => {
    if (i > 0 && line.first) y += res.paragraphGap;
    if (i === res.flavorStart && i > 0 && rule) {
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
    } else if (i === res.flavorStart && i > 0) y += res.paragraphGap * 1.4;
    const baseline = y + res.lineHeight * 0.8;
    let x = box.x0 + (center ? 0 : (line.indent ?? 0));
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

/**
 * A faixa de baixo das cartas modais (ver mdfc.ts): a palavra em Beleren à esquerda e, nos
 * terrenos, a habilidade de mana em MPlantin, encostada no fim da faixa. A palavra fica no corpo
 * da carta; a habilidade diminui (e depois aperta) até caber depois dela, como na impressão em
 * PT ("Terreno ⓣ: Adicione ⓦ ou ⓑ.", Glasswing Grace, MH3 254). Sem habilidade, a palavra vai
 * até perto do custo (`end`), apertada se precisar ("Mágica Instantânea", Hagra Mauling, ZNR).
 */
/**
 * O símbolo de mana como na faixa clara das modais: o desenho na cor `rgb` e o disco quase
 * transparente (`MDFC_STRIP.disc`), com `px` de lado. Na faixa clara a carta impressa traz
 * "{T}: Add {G}." com o desenho preto e só um halo do disco (na escura, com os discos
 * coloridos). Cada pixel vira desenho na proporção em que escurece o disco (a cor mais comum do
 * símbolo): a borda suavizada entre o disco e o desenho fica suave.
 */
function faintDisc(icon: CanvasImageSource, px: number, rgb: [number, number, number]): HTMLCanvasElement {
  const n = Math.max(1, Math.round(px));
  const out = document.createElement("canvas");
  out.width = n;
  out.height = n;
  const c = out.getContext("2d")!;
  c.drawImage(icon, 0, 0, n, n);
  const img = c.getImageData(0, 0, n, n);
  const d = img.data;
  const lum = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // o disco: a mediana dos pixels opacos e claros
  const light: number[] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && lum(i) > 90) light.push(i);
  light.sort((a, b) => lum(a) - lum(b));
  const ref = light.length ? light[light.length >> 1] : -1;
  const disc = ref < 0 ? [255, 255, 255] : [d[ref], d[ref + 1], d[ref + 2]];
  const discLum = ref < 0 ? 255 : lum(ref);
  const halo = MDFC_STRIP.disc;
  for (let i = 0; i < d.length; i += 4) {
    const t = Math.min(1, Math.max(0, 1 - lum(i) / discLum));
    const a = t + halo * (1 - t);
    for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.round((rgb[ch] * t + disc[ch] * halo * (1 - t)) / a);
    d[i + 3] = Math.round(d[i + 3] * a);
  }
  c.putImageData(img, 0, 0);
  return out;
}

function drawMdfcHint(
  ctx: CanvasRenderingContext2D,
  hint: MdfcHint,
  end: number,
  k: number,
  ink: "dark" | "light",
  symbols: Map<string, CanvasImageSource>,
) {
  const color = INK[ink];
  const S = MDFC_STRIP;
  const t = titleFont();
  ctx.font = `${t.weight} ${S.wordSize * t.scale * k}px ${t.family}`;
  const natural = ctx.measureText(hint.word).width / k;
  if (!hint.mana) {
    drawLine(ctx, hint.word, S.wordX, S.wordCenterY, end - 4 - S.wordX, S.wordSize, k, color, t);
    return;
  }
  const f = bodyFont();
  const runs = hint.mana.split(/(\{[^}]+\})/).filter(Boolean);
  const widthAt = (size: number) => {
    ctx.font = `${size * f.scale * k}px ${f.family}`;
    return runs.reduce((w, r) => w + (r.startsWith("{") ? (S.symbol * size) / S.manaSize + 2 : ctx.measureText(r).width / k), 0);
  };
  // a palavra no corpo dela, com pelo menos 10 px até a habilidade
  const wordWidth = Math.min(natural, S.right - S.wordX - 10 - widthAt(15) * 0.85);
  drawLine(ctx, hint.word, S.wordX, S.wordCenterY, wordWidth, S.wordSize, k, color, t);
  const room = S.right - (S.wordX + wordWidth + 10);
  let size = S.manaSize;
  while (size > 15 && widthAt(size) > room) size -= 0.5;
  const width = widthAt(size);
  const sx = width > room ? room / width : 1;
  const sym = (S.symbol * size) / S.manaSize;
  // (linha de base no pé das maiúsculas da carta, ≈ 953,5; o símbolo centrado na faixa)
  const baseline = S.centerY + size * 0.39;
  ctx.save();
  ctx.translate((S.right - width * sx) * k, 0);
  ctx.scale(sx, 1);
  ctx.font = `${size * f.scale * k}px ${f.family}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  let x = 0;
  for (const r of runs) {
    if (r.startsWith("{")) {
      const icon = symbols.get(r.slice(1, -1));
      const glyph = icon && ink === "dark" ? faintDisc(icon, sym * k, [11, 11, 11]) : icon;
      if (glyph) ctx.drawImage(glyph, (x + 1) * k, (S.centerY - sym / 2) * k, sym * k, sym * k);
      x += sym + 2;
    } else {
      ctx.fillText(r, x * k, baseline * k);
      x += ctx.measureText(r).width / k;
    }
  }
  ctx.restore();
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
/**
 * Uma linha da moldura antiga: letras brancas com a sombra preta 2 px abaixo e à direita, com a
 * primeira letra (o desenho dela, sem o recuo da fonte) em `x`; comprime como `drawLine`.
 */
function drawOldLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  maxWidth: number,
  size: number,
  k: number,
  t: TitleFont,
) {
  let s = size * t.scale;
  const measure = () => {
    ctx.font = `${t.weight} ${s * k}px ${t.family}`;
    const m = ctx.measureText(text);
    return { left: m.actualBoundingBoxLeft / k, width: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / k };
  };
  let m = measure();
  while (m.width * 0.82 > maxWidth && s > 18) {
    s -= 0.5;
    m = measure();
  }
  const sx = m.width > maxWidth ? maxWidth / m.width : 1;
  for (const [d, color] of [
    [OLD.shadow, OLD.shadowInk],
    [0, OLD.ink],
  ] as const) {
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color;
    ctx.translate((x + d) * k, (baseline + d) * k);
    ctx.scale(sx, 1);
    ctx.fillText(text, m.left * k, 0);
    ctx.restore();
  }
}

/**
 * Moldura antiga (ADR 0031): o nome e o tipo são letras brancas com sombra direto sobre a
 * moldura texturizada, e saem pela rede neural, num quadro só; a caixa de texto, de papel,
 * sai pelo apagamento de sempre. Devolve "neural" quando a rede neural não rodou e `false`
 * quando a imagem não tem as letras onde a moldura as põe (a carta sai na original).
 */
async function renderOld(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  sctx: CanvasRenderingContext2D;
  data: ImageData;
  toImg: (r: Rect) => Rect;
  face: PtFace;
  print: PrintRecord;
  flavor: string | null;
  side: number;
  W: number;
  H: number;
  neural: Neural;
  plan: (frames: number) => void;
}): Promise<"ok" | "neural" | false> {
  const { ctx, src, sctx, data, toImg, face, print, W, H, neural } = p;
  const fx = data.width / BASE_W;
  const fy = data.height / BASE_H;
  const cost = oldCostLeft(print.mana_cost);
  const nameRect = roundRect(toImg({ x0: OLD.name.x0, y0: OLD.name.y0, x1: cost - 4, y1: OLD.name.y1 }));
  const typeRect = roundRect(toImg({ x0: OLD.type.x0, y0: OLD.type.y0, x1: OLD.type.x1, y1: OLD.type.y1 }));
  const name = oldLetters(data, nameRect);
  const type = oldLetters(data, typeRect);
  // sem letras perto do começo das duas linhas, não é a moldura que o motor conhece
  const startsNear = (l: typeof name) => l.blocks.length > 0 && Math.abs(l.blocks[0].x0 / fx - OLD.name.x) <= 12;
  if (!startsNear(name) || !startsNear(type)) return false;
  const ends = oldTypeEnds(data, type);
  // as letras do tipo vão até o fim do texto em inglês: o símbolo da coleção fica fora da máscara
  const typeMask = { ...type, mask: type.mask.slice() };
  const tw = typeRect.x1 - typeRect.x0;
  const cut = Math.min(tw, ends.textEnd + Math.round(4 * fx) - typeRect.x0);
  for (let y = 0; y < typeRect.y1 - typeRect.y0; y++) typeMask.mask.fill(0, y * tw + Math.max(0, cut), (y + 1) * tw);
  // o custo de mana e o símbolo da coleção ficam escondidos da rede neural (a cor deles não vaza)
  const hide = [
    roundRect(toImg({ x0: cost - 2, y0: OLD.name.y0, x1: 700, y1: OLD.name.y1 })),
    ...(ends.symbol !== null ? [{ x0: ends.symbol - Math.round(2 * fx), y0: typeRect.y0, x1: typeRect.x1, y1: typeRect.y1 }] : []),
  ];
  // a caixa: o bisel de dentro, medido na imagem; o texto em inglês sai pelo apagamento de sempre
  const outer = OLD.box;
  const boxRect = insideBoxSides(data, toImg(outer), 16 * fx, false);
  const boxBase = { x0: boxRect.x0 / fx, y0: boxRect.y0 / fy, x1: boxRect.x1 / fx, y1: boxRect.y1 / fy };
  const hasText = Boolean((face.text_pt ?? "").trim() || p.flavor);
  const centered = hasText ? measureCentered(data, roundRect(boxRect), [], fx) === true : false;
  const inks = eraseRegions(
    data,
    [{ rect: roundRect(boxRect), threshold: 14, colorThreshold: 34, stains: true, attachedBelow: roundRect(boxRect).y1 }],
    [],
  );
  p.plan(1);
  const area = { x0: nameRect.x0, y0: nameRect.y0, x1: typeRect.x1, y1: typeRect.y1 };
  const clean = await lamaBox(
    data,
    [
      { rect: nameRect, mask: name.mask, polarity: "light" },
      { rect: typeRect, mask: typeMask.mask, polarity: "light" },
    ],
    area,
    hide,
    "light",
    `${print.id}:${data.width}:${p.side}:antiga`,
    { art: true, grow: Math.round(fx * 1), gap: 0, simple: false, neural },
  );
  if (!clean) return "neural";
  sctx.putImageData(data, 0, 0);
  ctx.drawImage(src, 0, 0, W, H);

  const k = W / BASE_W;
  // a linha de base medida no inglês, se estiver perto da da moldura (as retrô ficam 2 px abaixo)
  const near = (v: number | null, expected: number) => (v !== null && Math.abs(v / fy - expected) <= 5 ? v / fy : expected);
  const nameBase = near(name.baseline, OLD.name.baseline);
  const typeBase = near(type.baseline, OLD.type.baseline);
  const typeEnd = ends.symbol !== null ? ends.symbol / fx - 12 : OLD.typeEnd;
  drawOldLine(ctx, face.name_pt ?? face.name_en, OLD.name.x, nameBase, cost - 12 - OLD.name.x, OLD.name.size, k, oldNameFont());
  if (face.type_pt) {
    const body = bodyFont();
    const t: TitleFont = { family: body.family, weight: "400", scale: body.scale, dx: 0, baseline: "alphabetic", rise: 0 };
    drawOldLine(ctx, face.type_pt, OLD.type.x, typeBase, typeEnd - OLD.type.x, OLD.type.size, k, t);
  }
  if (!hasText) return "ok";
  const pad = OLD.boxPad;
  const box = { x0: boxBase.x0 + pad.x0, y0: boxBase.y0 + pad.y0, x1: boxBase.x1 - pad.x1, y1: boxBase.y1 - pad.y1 };
  const symbols = await preloadSymbols(face.text_pt, p.flavor);
  const m = measurer(ctx, k);
  const res = fitText(face.text_pt, p.flavor, box.x1 - box.x0, box.y1 - box.y0, m, 34, 15, undefined, face.ability_words);
  drawLayout(ctx, res, box, k, inks[0] ?? "dark", symbols, m, centered, undefined, false);
  return "ok";
}

/**
 * Salas de Duskmourn (ADR 0033): a carta dividida impressa deitada (ver room.ts). O motor gira a
 * imagem e, na carta deitada, apaga as duas barras dos nomes e as duas caixas pelo apagamento de
 * sempre, e as letras brancas da linha de tipo e da faixa do lembrete pela rede neural (as duas
 * são translúcidas, com a arte por trás), em dois quadros, um de cada metade: num quadro só, a
 * faixa de 900 px seria reduzida aos 512 do modelo. Escreve o português na carta deitada e a põe
 * de pé de novo. Devolve "neural" quando a rede neural não rodou e `false` quando a imagem não tem
 * a moldura das Salas ou falta o lembrete em PT (sem ele, a faixa ficaria em inglês).
 */
async function renderRoom(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  halves: [PtFace, PtFace];
  print: PrintRecord;
  W: number;
  H: number;
  neural: Neural;
  plan: (frames: number) => void;
}): Promise<"ok" | "neural" | false> {
  const { ctx, src, halves, print, W, H, neural } = p;
  const reminder = halves[0].reminder_pt ?? halves[1].reminder_pt ?? null;
  const type = halves[0].type_pt;
  if (!reminder || !type) return false;
  // a carta deitada: girada 90° no sentido horário, o pé da carta de pé fica à esquerda
  const rot = document.createElement("canvas");
  rot.width = src.height;
  rot.height = src.width;
  const rctx = rot.getContext("2d", { willReadFrequently: true });
  if (!rctx) throw new Error("Seu navegador não liberou o canvas 2D.");
  rctx.translate(rot.width, 0);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(src, 0, 0);
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  const data = rctx.getImageData(0, 0, rot.width, rot.height);
  if (!roomFrame(data)) return false;
  const fx = rot.width / ROOM.width;
  const fy = rot.height / ROOM.height;
  const toImg = (r: Rect) => roundRect({ x0: r.x0 * fx, y0: r.y0 * fy, x1: r.x1 * fx, y1: r.y1 * fy });

  // 1. as barras dos nomes (até o custo de cada metade, que fica) e as caixas
  const costs = halves.map((h, i) => roomCostLeft(h.mana_cost, i as 0 | 1));
  const { nameY } = ROOM;
  const nameRects = ROOM.names.map((n, i) => toImg({ x0: n.x0, y0: nameY.y0, x1: costs[i] - 6, y1: nameY.y1 }));
  const costGuard = ROOM.names.map((n, i) => toImg({ x0: costs[i] - 4, y0: nameY.y0 - 2, x1: n.x1 + 4, y1: nameY.y1 + 1 }));
  const inks = eraseRegions(
    data,
    [
      ...nameRects.map((rect) => ({ rect, threshold: 28, fill: "rows" as const })),
      ...ROOM.boxes.map((b) => ({ rect: toImg(b), threshold: 14, colorThreshold: 34, stains: true })),
    ],
    costGuard,
    costGuard,
    // (a ponta arredondada da esquerda de cada barra fica como está, ver barCapGuard)
    nameRects.flatMap((r) => barCapGuard(data, r, "left")),
  );

  // 2. a linha de tipo e a faixa do lembrete: só as letras brancas, refeitas pela rede neural
  // (o símbolo da coleção fica escondido dela)
  const typeRect = toImg(ROOM.type);
  const stripRect = toImg(ROOM.strip);
  const masks: RegionMask[] = [
    { rect: typeRect, mask: whiteTextMask(data, typeRect), polarity: "light" },
    { rect: stripRect, mask: whiteTextMask(data, stripRect), polarity: "light" },
  ];
  p.plan(2);
  const area = toImg(ROOM.lama);
  const mid = Math.round(ROOM.lama.mid * fx);
  for (const [x0, x1, tag] of [
    [area.x0, mid, "a"],
    [mid, area.x1, "b"],
  ] as const) {
    const clean = await lamaBox(
      data,
      clipMasks(masks, x0, area.x1),
      { ...area, x0, x1 },
      [toImg(ROOM.symbol)],
      "light",
      `${print.id}:${data.width}:sala:${tag}`,
      { art: true, simple: false, neural },
    );
    if (!clean) return "neural";
  }
  rctx.putImageData(data, 0, 0);

  // 3. o português, escrito na carta deitada e posta de pé de novo
  const k = H / ROOM.width;
  ctx.save();
  ctx.translate(0, H);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(rot, 0, 0, H, W);
  halves.forEach((h, i) => {
    const n = ROOM.names[i];
    drawLine(ctx, h.name_pt ?? h.name_en, n.x, nameY.center, costs[i] - 10 - n.x, ROOM.nameSize, k);
  });
  const t = ROOM.type;
  drawLine(ctx, type, t.x, t.center, t.end - t.x, t.size, k, INK.light);
  const m = measurer(ctx, k);
  const s = ROOM.strip;
  const strip = { x0: s.textX0, y0: s.textY0, x1: s.textX1, y1: s.textY1 };
  const stripText = fitText(reminder, null, strip.x1 - strip.x0, strip.y1 - strip.y0, m, ROOM.stripMax, ROOM.stripMin);
  drawLayout(ctx, stripText, strip, k, "light", new Map(), m, true);
  const pad = ROOM.boxPad;
  for (const [i, h] of halves.entries()) {
    const b = ROOM.boxes[i];
    const box = { x0: b.x0 + pad.x0, y0: b.y0 + pad.y0, x1: b.x1 - pad.x1, y1: b.y1 - pad.y1 };
    const symbols = await preloadSymbols(h.text_pt, h.flavor_pt);
    const res = fitText(
      h.text_pt,
      h.flavor_pt,
      box.x1 - box.x0,
      box.y1 - box.y0,
      m,
      ROOM.maxSize,
      ROOM.minSize,
      undefined,
      h.ability_words,
    );
    drawLayout(ctx, res, box, k, inks[2 + i] ?? "dark", symbols, m);
  }
  ctx.restore();
  return "ok";
}

/**
 * Carta dividida de 2015 (ver split.ts): girada para a carta deitada, cada metade é uma carta
 * pequena da M15. Os nomes e os tipos saem linha a linha, como na M15 (o custo e o símbolo da
 * coleção ficam), as caixas pelo apagamento de sempre (a marca-d'água vai junto, inteira) e o
 * português é escrito na carta deitada, posta de pé de novo.
 */
async function renderSplit(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  halves: [PtFace, PtFace];
  W: number;
  H: number;
}): Promise<boolean> {
  const { ctx, src, halves, W, H } = p;
  if (halves.some((h) => !h.type_pt)) return false;
  const rot = document.createElement("canvas");
  rot.width = src.height;
  rot.height = src.width;
  const rctx = rot.getContext("2d", { willReadFrequently: true });
  if (!rctx) throw new Error("Seu navegador não liberou o canvas 2D.");
  rctx.translate(rot.width, 0);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(src, 0, 0);
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  const data = rctx.getImageData(0, 0, rot.width, rot.height);
  if (!splitFrame(data)) return false;
  const fx = rot.width / SPLIT.width;
  const fy = rot.height / SPLIT.height;
  const toImg = (r: Rect) => roundRect({ x0: r.x0 * fx, y0: r.y0 * fy, x1: r.x1 * fx, y1: r.y1 * fy });

  const costs = halves.map((h, i) => splitCostLeft(h.mana_cost, i as 0 | 1));
  const { nameY, typeY } = SPLIT;
  const nameRects = SPLIT.names.map((n, i) => toImg({ x0: n.x0, y0: nameY.y0, x1: costs[i] - 6, y1: nameY.y1 }));
  const costGuard = SPLIT.names.map((n, i) => toImg({ x0: costs[i] - 4, y0: nameY.y0 - 2, x1: n.x1 + 4, y1: nameY.y1 + 1 }));
  const typeRects = SPLIT.types.map((t) => toImg({ x0: t.x0, y0: typeY.y0, x1: t.x1, y1: typeY.y1 }));
  const boxes = splitBoxes(data);
  const boxRects = boxes.map(toImg);
  // texto curto centralizado no original (Boom // Bust, TSR) sai centralizado
  const centered = boxRects.map((r, i) => (halves[i].text_pt?.trim() ? measureCentered(data, r, [], fx) === true : false));
  const inks = eraseRegions(
    data,
    [
      ...nameRects.map((rect) => ({ rect, threshold: 28, fill: "rows" as const })),
      ...typeRects.map((rect) => ({ rect, threshold: 28, fill: "rows" as const })),
      ...boxRects.map((rect) => ({ rect, threshold: 14, colorThreshold: 34, stains: true, dividers: true })),
    ],
    costGuard,
    costGuard,
    // (a ponta arredondada da esquerda de cada barra fica como está, ver barCapGuard)
    [...nameRects, ...typeRects].flatMap((r) => barCapGuard(data, r, "left")),
  );
  rctx.putImageData(data, 0, 0);

  const k = H / SPLIT.width;
  ctx.save();
  ctx.translate(0, H);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(rot, 0, 0, H, W);
  const m = measurer(ctx, k);
  const pad = SPLIT.boxPad;
  for (const [i, h] of halves.entries()) {
    const n = SPLIT.names[i];
    drawLine(ctx, h.name_pt ?? h.name_en, n.x, nameY.center, costs[i] - 10 - n.x, SPLIT.nameSize, k, INK[inks[i] ?? "dark"]);
    const t = SPLIT.types[i];
    drawLine(ctx, h.type_pt ?? "", t.x, typeY.center, t.x1 - t.x, SPLIT.typeSize, k, INK[inks[2 + i] ?? "dark"]);
    const b = boxes[i];
    const box = { x0: b.x0 + pad.x0, y0: b.y0 + pad.y0, x1: b.x1 - pad.x1, y1: b.y1 - pad.y1 };
    const symbols = await preloadSymbols(h.text_pt, h.flavor_pt);
    const res = fitText(
      h.text_pt,
      h.flavor_pt,
      box.x1 - box.x0,
      box.y1 - box.y0,
      m,
      SPLIT.maxSize,
      SPLIT.minSize,
      undefined,
      h.ability_words,
    );
    drawLayout(ctx, res, box, k, inks[4 + i] ?? "dark", symbols, m, centered[i]);
  }
  ctx.restore();
  return true;
}

/**
 * Consequência (ADR 0035): a metade de cima é apagada e escrita na carta de pé, a de baixo na
 * carta girada 90° no sentido anti-horário, onde ela fica de pé. Sem as barras e as caixas das duas
 * metades na imagem, a carta sai na original.
 */
async function renderAftermath(p: {
  ctx: CanvasRenderingContext2D;
  src: HTMLCanvasElement;
  halves: [PtFace, PtFace];
  W: number;
  H: number;
}): Promise<boolean> {
  const { ctx, src, halves, W, H } = p;
  if (halves.some((h) => !h.type_pt)) return false;
  const canvas2d = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const c2 = c.getContext("2d", { willReadFrequently: true });
    if (!c2) throw new Error("Seu navegador não liberou o canvas 2D.");
    return [c, c2] as const;
  };
  const [up, uctx] = canvas2d(src.width, src.height);
  uctx.drawImage(src, 0, 0);
  const [turned, tctx] = canvas2d(src.height, src.width);
  const turn = (from: HTMLCanvasElement) => {
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.translate(0, turned.height);
    tctx.rotate(-Math.PI / 2);
    tctx.drawImage(from, 0, 0);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  turn(src);
  const upData = uctx.getImageData(0, 0, up.width, up.height);
  const frame = aftermathFrame(upData, tctx.getImageData(0, 0, turned.width, turned.height));
  if (!frame) return false;
  const pad = AFTERMATH.boxPad;

  // a metade de cima, na carta de pé (como a M15: o custo e o símbolo da coleção no lugar de sempre)
  const fx = up.width / BASE_W;
  const fy = up.height / BASE_H;
  const toUp = (r: Rect) => roundRect({ x0: r.x0 * fx, y0: r.y0 * fy, x1: r.x1 * fx, y1: r.y1 * fy });
  const T = AFTERMATH.top;
  const cost = costLeft(halves[0].mana_cost);
  const tn = frame.top.name;
  const tt = frame.top.type;
  const inset = (tt.y1 - tt.y0) * 0.22;
  const setLeft = Math.min(
    Math.max(findSetSymbolLeft(upData, Math.round((tt.y0 + inset) * fy), Math.round((tt.y1 - inset) * fy)) / fx, 560),
    660,
  );
  const topName = { x0: T.name.x0, y0: tn.y0 + 1, x1: cost - 6, y1: tn.y1 - 1 };
  const topGuard = { x0: cost - 4, y0: tn.y0 - 1, x1: BASE_W, y1: tn.y1 + 1 };
  const topType = { x0: T.type.x0, y0: tt.y0 + 1, x1: setLeft - 6, y1: tt.y1 - 1 };
  const topBox = aftermathBox(upData, "top");
  const topCentered = halves[0].text_pt?.trim() ? measureCentered(upData, toUp(topBox), [], fx) === true : false;
  const topRects = [toUp(topName), toUp(topType)];
  const topInks = eraseRegions(
    upData,
    [
      ...topRects.map((rect) => ({ rect, threshold: 28, fill: "rows" as const })),
      { rect: toUp(topBox), threshold: 14, colorThreshold: 34, stains: true, dividers: true },
    ],
    [toUp(topGuard)],
    [toUp(topGuard)],
    topRects.flatMap((r) => barCapGuard(upData, r, "left")),
  );
  uctx.putImageData(upData, 0, 0);

  // a metade de baixo, na carta girada (feita da de pé já apagada)
  turn(up);
  const tData = tctx.getImageData(0, 0, turned.width, turned.height);
  const gx = turned.width / BASE_H;
  const gy = turned.height / BASE_W;
  const toTurned = (r: Rect) => roundRect({ x0: r.x0 * gx, y0: r.y0 * gy, x1: r.x1 * gx, y1: r.y1 * gy });
  const B = AFTERMATH.bottom;
  const bCost = aftermathCostLeft(halves[1].mana_cost);
  const bn = frame.bottom.name;
  const bt = frame.bottom.type;
  const bottomName = { x0: B.name.x0, y0: bn.y0 + 1, x1: bCost - 6, y1: bn.y1 - 1 };
  const bottomGuard = { x0: bCost - 4, y0: bn.y0 - 1, x1: B.name.costRight + 8, y1: bn.y1 + 1 };
  const bottomType = { x0: B.type.x0, y0: bt.y0 + 1, x1: B.type.x1, y1: bt.y1 - 1 };
  const bottomBox = aftermathBox(tData, "bottom");
  const bottomCentered = halves[1].text_pt?.trim() ? measureCentered(tData, toTurned(bottomBox), [], gx) === true : false;
  const bottomRects = [toTurned(bottomName), toTurned(bottomType)];
  const bottomInks = eraseRegions(
    tData,
    [
      ...bottomRects.map((rect) => ({ rect, threshold: 28, fill: "rows" as const })),
      { rect: toTurned(bottomBox), threshold: 14, colorThreshold: 34, stains: true, dividers: true },
    ],
    [toTurned(bottomGuard)],
    [toTurned(bottomGuard)],
    bottomRects.flatMap((r) => barCapGuard(tData, r, "left")),
  );
  tctx.putImageData(tData, 0, 0);

  // a carta apagada, de pé de novo
  ctx.save();
  ctx.translate(W, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(turned, 0, 0, H, W);
  ctx.restore();

  const writeHalf = async (
    h: PtFace,
    k: number,
    name: { x: number; center: number; maxWidth: number },
    type: { x: number; center: number; maxWidth: number },
    b: Rect,
    inks: ("dark" | "light")[],
    centered: boolean,
  ) => {
    const m = measurer(ctx, k);
    drawLine(ctx, h.name_pt ?? h.name_en, name.x, name.center, name.maxWidth, AFTERMATH.nameSize, k, INK[inks[0] ?? "dark"]);
    drawLine(ctx, h.type_pt ?? "", type.x, type.center, type.maxWidth, AFTERMATH.typeSize, k, INK[inks[1] ?? "dark"]);
    const box = { x0: b.x0 + pad.x0, y0: b.y0 + pad.y0, x1: b.x1 - pad.x1, y1: b.y1 - pad.y1 };
    const symbols = await preloadSymbols(h.text_pt, h.flavor_pt);
    const res = fitText(
      h.text_pt,
      h.flavor_pt,
      box.x1 - box.x0,
      box.y1 - box.y0,
      m,
      AFTERMATH.maxSize,
      AFTERMATH.minSize,
      undefined,
      h.ability_words,
    );
    drawLayout(ctx, res, box, k, inks[2] ?? "dark", symbols, m, centered);
  };
  await writeHalf(
    halves[0],
    W / BASE_W,
    { x: T.name.x, center: tn.center, maxWidth: cost - 12 - T.name.x },
    { x: T.type.x, center: tt.center, maxWidth: setLeft - 10 - T.type.x },
    topBox,
    topInks,
    topCentered,
  );
  ctx.save();
  ctx.translate(W, 0);
  ctx.rotate(Math.PI / 2);
  await writeHalf(
    halves[1],
    H / BASE_H,
    { x: B.name.x, center: bn.center, maxWidth: bCost - 10 - B.name.x },
    { x: B.type.x, center: bt.center, maxWidth: B.type.x1 - B.type.x },
    bottomBox,
    bottomInks,
    bottomCentered,
  );
  ctx.restore();
  return true;
}

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
    // a ponta arredondada da barra de tipo fica como está (ver barCapGuard); a moldura de
    // 2003 apaga só depois do fio da ponta
    face.type_pt && layout.type.x0 <= 50 ? barCapGuard(data, toImg(layout.type), "left") : [],
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
/**
 * Na moldura de 2003, o centro das minúsculas medido nas cartas (40 impressões): o centro das
 * linhas do layout (`frame2003` em `m15Layout`). Com o da M15, o nome de quase todas descia
 * 6,5 px no alinhamento e o das outras não, porque ficavam abaixo dos 4 px.
 */
const BAR_CENTER_2003 = { title: 88, type: 617.5 };

/**
 * Centro das letras das duas barras da mágica (Aventura e Preparar, escala-base): o medido no
 * inglês, se perto do padrão (digitalizações com a moldura uns pixels acima ou abaixo); senão, o
 * padrão.
 */
function advBarCenters(data: ImageData, adv: SplitLayout, fy: number): [number, number] {
  const fx = data.width / BASE_W;
  return ([adv.name, adv.type] as const).map((bar) => {
    const expected = bar.center;
    const r = bar.rect;
    // (sem as beiradas da barra: com elas a faixa das letras passava da altura de uma linha)
    const c = textBandCenter(data, {
      x0: adv.lettersX[0] * fx,
      y0: (r.y0 + 3) * fy,
      x1: Math.min(r.x1, adv.lettersX[1]) * fx,
      y1: (r.y1 - 3) * fy,
    });
    // (o português é escrito 2 px acima do centro medido: com o corpo e o recuo da Beleren, assim
    // as letras caem na mesma altura das em inglês, conferido em ELD, WOE e TDM)
    return (c !== null && Math.abs(c / fy - expected) <= 6 ? c / fy : expected) - 2;
  }) as [number, number];
}

/** Desloca a faixa `i` (0 = nome, 1 = tipo) do layout se as letras estão fora do lugar padrão. */
function alignBar(
  data: ImageData,
  layout: FrameLayout,
  i: 0 | 1,
  search: Rect,
  expected: number,
  fx: number,
  fy: number,
  center: (img: ImageData, rect: Rect) => number | null = textBandCenter,
) {
  const c = center(data, { x0: search.x0 * fx, y0: search.y0 * fy, x1: search.x1 * fx, y1: search.y1 * fy });
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

/** Planeswalker de uma face (o tipo em PT, ou o em inglês quando falta). */
const isPlaneswalker = (print: PrintRecord, face: PtFace | null, typeLine?: string | null) =>
  !print.sides && /planeswalker/i.test(face?.type_pt ?? typeLine ?? "");

/**
 * A montagem passa pela rede neural (lama.ts): português a escrever num planeswalker, numa arte
 * sem borda ou na moldura antiga. A prévia usa para mostrar o andamento enquanto espera por ela.
 */
export function usesNeuralFill(print: PrintRecord, face: PtFace | null, side: 0 | 1 = 0, typeLine?: string | null): boolean {
  const supported = print.sides ? Boolean(print.sides[side]?.supported) : print.supported;
  return (
    Boolean(supported && face?.name_pt && face.text_pt !== null) &&
    (print.border === "borderless" ||
      isPlaneswalker(print, face, typeLine) ||
      (print.frame === "1997" && print.layout === "normal") ||
      isRoom(print, typeLine))
  );
}

/** Sala de Duskmourn (ver room.ts): carta dividida com o tipo "Room" nas duas metades. */
const isRoom = (print: PrintRecord, typeLine?: string | null) =>
  print.layout === "split" && print.border !== "borderless" && /\bRoom\b/.test(typeLine ?? "");

/** Lançamento de Kamigawa: Neon Dynasty: dali em diante o verso das cartas de duas faces não tem o símbolo da coleção. */
const SYMBOLLESS_BACKS_SINCE = "2022-02-18";

export async function renderCard(opts: RenderOptions): Promise<RenderResult> {
  const { print, face } = opts;
  const side = opts.side ?? 0;
  const sideInfo = print.sides?.[side] ?? null;
  const scale = opts.scale ?? 1.6;
  // Planeswalker usa sempre o PNG, também na prévia: a rede neural limpa a caixa
  // melhor na imagem sem compressão JPEG, e a caixa limpa é reaproveitada no PDF.
  const pw = isPlaneswalker(print, face, opts.typeLine);
  // A moldura sem borda também: a caixa é translúcida e vai para a mesma rede neural.
  const borderless = print.border === "borderless";
  // Saga também: os fios entre os capítulos são degraus de uma linha, que o JPEG reduzido espalha
  const saga = print.layout === "saga" && !borderless;
  // e Classe: as barras de nível são recortadas e coladas em outra altura
  const klass = print.layout === "class" && !borderless;
  // e as naves com Posicionar: a caixa translúcida vai para a rede neural
  const stationParts = !borderless && print.layout === "normal" ? stationText(face?.text_pt) : null;
  // e a moldura antiga: o nome e o tipo, sobre a moldura texturizada, vão para a rede neural
  const old = print.frame === "1997" && !borderless && print.layout === "normal";
  // e as Salas de Duskmourn: a linha de tipo e a faixa do lembrete vão para a rede neural
  const room = isRoom(print, opts.typeLine);
  const version = pw || borderless || saga || klass || stationParts || old || room ? "png" : (opts.imageVersion ?? "png");
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

  // andamento da rede neural: o total previsto de quadros sobe antes do primeiro rodar
  let neuralDone = 0;
  let neuralTotal = 0;
  const report = () => opts.onNeural?.({ done: Math.min(neuralDone, neuralTotal), total: neuralTotal });
  const plan = (frames: number) => {
    neuralTotal += frames;
    report();
  };
  const neural: Neural = {
    enabled: opts.neural ?? true,
    tick: (frames = 1) => {
      neuralDone += frames;
      report();
    },
  };

  // cartas divididas: as Salas (renderRoom), as da moldura atual (renderSplit) e as com
  // Consequência (renderAftermath); as outras saem na original
  if (print.layout === "split") {
    const other = opts.split ?? null;
    const halves: [PtFace, PtFace] | null = other?.name_pt && other.text_pt !== null ? [face, other] : null;
    const done = !halves
      ? false
      : room
        ? await renderRoom({ ctx, src, halves, print, W, H, neural, plan })
        : (await renderSplit({ ctx, src, halves, W, H })) || (await renderAftermath({ ctx, src, halves, W, H }))
          ? "ok"
          : false;
    if (done === "ok") return { canvas: out, translated: true };
    ctx.drawImage(img, 0, 0, W, H);
    return done === "neural" ? { canvas: out, translated: false, reason: "neural" } : { canvas: out, translated: false };
  }

  if (pw) {
    const done = await renderPlaneswalker({ ctx, src, sctx, data, toImg, face, print, W, H, neural, plan });
    if (!done) ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: done };
  }

  if (saga) {
    const done = await renderSaga({ ctx, src, sctx, data, toImg, face, print, W, H });
    if (!done) ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: done };
  }

  if (klass) {
    const done = await renderClass({ ctx, src, sctx, data, toImg, face, print, W, H });
    if (!done) ctx.drawImage(img, 0, 0, W, H);
    return { canvas: out, translated: done };
  }

  if (old) {
    const done = await renderOld({ ctx, src, sctx, data, toImg, face, print, flavor: opts.flavor ?? null, side, W, H, neural, plan });
    if (done === "ok") return { canvas: out, translated: true };
    ctx.drawImage(img, 0, 0, W, H);
    return done === "neural" ? { canvas: out, translated: false, reason: "neural" } : { canvas: out, translated: false };
  }

  // Algumas artes estendidas têm a caixa de texto mais curta e a linha de tipo mais
  // baixa: mede o fio de cima da barra e desloca tipo e caixa juntos.
  const bar = typeBarEdges(data);
  const barTop = bar?.top ?? null;
  // (o primeiro fio achado varia de 573 a 591 na padrão e de 630 a 633 na baixa; o
  // desenho da moldura baixa é sempre o mesmo, 44 abaixo)
  const typeShift = barTop !== null && barTop >= 615 && barTop <= 660 ? 44 : 0;
  // Moldura sem borda: a caixa com aro e a barra do nome conferidas na imagem (ver
  // borderlessBox); sem elas, a carta sai na original
  const frameBox = borderless ? borderlessBox(data) : null;
  const symbolInfo: { colored: number; lim: number; tight?: boolean; none?: boolean } = { colored: -1, lim: 0 };
  // O verso das cartas de duas faces não tem o símbolo da coleção desde Kamigawa: Neon Dynasty
  // (ver findSetSymbolLeft). The List traz a impressão original, com a data da lista.
  const symbolless = side === 1 && !frameBox && print.set_code !== "plst" && (print.released ?? "") >= SYMBOLLESS_BACKS_SINCE;
  // (na sem borda a barra de tipo acaba no aro da caixa, uns 20 px antes da M15: com a busca
  // até o fim da M15, o aro entrava como bloco, o fim do traço do símbolo da Secret Lair
  // grudava nele e a estrela, solta, ficava de fora e era apagada, Lord of the Pit SLD 1857)
  // (na de 2003 a barra acaba antes, ver TYPE_BAR_END_2003)
  const symbolEnd = frameBox ? Math.round((frameBox.x1 + 4) * fx) : print.frame === "2003" ? Math.round(TYPE_BAR_END_2003 * fx) : undefined;
  const setLeft =
    findSetSymbolLeft(
      data,
      Math.round((594 + typeShift) * fy),
      Math.round((632 + typeShift) * fy),
      symbolEnd,
      100,
      symbolInfo,
      Boolean(frameBox),
      symbolless,
    ) / fx;
  const manaCost = sideInfo ? sideInfo.mana_cost : print.mana_cost;
  const hasPt = sideInfo ? sideInfo.has_pt : print.has_pt;
  // lembrete do verso ("4/4") na frente das cartas de transformar
  const backPt = print.layout === "transform" && side === 0 ? (print.sides?.[1]?.pt ?? null) : null;
  const rightIcon = Boolean(sideInfo && side === 1 && !manaCost && hasRightIcon(data));
  const layout = m15Layout(manaCost, hasPt, setLeft, {
    // (Lição sem o efeito marcado no Scryfall, como as de SOS: o ícone conferido na imagem)
    leftIcon: hasLeftIcon(print.effects, Boolean(sideInfo), rightIcon) || (/\bLição\b/.test(face.type_pt ?? "") && hasLessonIcon(data)),
    rightIcon,
    // (de uma face só, o da impressão: o círculo de Crashing Footfalls era apagado e o
    // "Feitiço" ia por cima do lugar dele)
    indicator: sideInfo ? sideInfo.indicator : Boolean(print.indicator),
    mdfcStrip: print.layout === "modal_dfc",
    typeShift,
    noSetSymbol: symbolInfo.none,
    frame2003: print.frame === "2003",
    released: print.released,
  });
  // Carta modal: a faixa de baixo resume o outro lado ("Land  {T}: Add {R}.", "Cleric  1{W}"). A
  // palavra e a habilidade de mana saem em português; o custo é desenho e fica (ver mdfc.ts)
  const otherSide: 0 | 1 = side === 1 ? 0 : 1;
  const hint =
    print.layout === "modal_dfc" && opts.otherFace
      ? mdfcHint(opts.otherFace, opts.typeLine?.split(" // ")[otherSide] ?? "", print.sides?.[otherSide]?.pt ?? null, print.released)
      : null;
  const stripRect = hint
    ? { ...MDFC_STRIP.erase, x1: hint.mana ? MDFC_STRIP.erase.x1 : mdfcCostLeft(print.sides?.[otherSide]?.mana_cost) - 4 }
    : null;
  // (o ponto final de "Add {W}." encosta no fim da faixa, que é inclinado: no meio dela o
  // apagamento vai até onde a ponta começa, e nos cantos fica antes do fio dela)
  const stripCorners = hint?.mana ? MDFC_STRIP.corners : [];
  // caixa escura ou sem os fios da barra de tipo: não é a moldura da M15 (ver notM15Frame).
  // Na sem borda a caixa é escura de propósito: valem o aro da caixa e a barra do nome (com
  // arte clara atrás, a letra branca só se lê pelo contorno, ver lightBorderlessBox; com
  // retícula grossa atrás, a rede neural não refaz a textura, ver screenNoise). A letra é
  // sempre branca (o pipeline só marca as de efeito "inverted"): a polaridade medida errava
  // com arte preta atrás de parte da caixa (Shirei, CMM 676)
  // (sem borda com a barra de tipo mais baixa é a caixa curta da série Drácula, VOW: o pipeline já
  // a deixa de fora, e aqui também sai a original)
  const blocked = frameBox
    ? typeShift > 0 || lightBorderlessBox(data, toImg(frameBox)) || screenNoise(data, toImg(frameBox)) > 16
    : borderless || notM15Frame(data, toImg(layout.box));
  // Nome de crossover ("Skeletor, Lord of Destruction" no Tinybones, the Pickpocket da Secret
  // Lair): o nome do alto é nome próprio e fica como impresso; o nome de jogo, em inglês na
  // aba logo abaixo da barra, é o que recebe o nome em PT. Sem a aba no lugar, sai a original.
  const subtitle = print.flavor_name ? subtitleLetters(data) : null;
  // (também quando a rede neural não roda neste navegador: o preenchimento simples deixaria um
  // borrão sobre a arte)
  const original = (reason?: "neural"): RenderResult => {
    ctx.drawImage(img, 0, 0, W, H);
    return reason ? { canvas: out, translated: false, reason } : { canvas: out, translated: false };
  };
  if (blocked || (print.flavor_name && !subtitle)) return original();
  // Aventura e Preparar: a caixa é dividida entre a criatura e a mágica. Na Aventura é um livro
  // aberto, conferido na imagem (a lombada entre as páginas e as barras da aventura, ver
  // adventureBook): a página da direita leva as regras e o flavor da criatura, a da esquerda, as
  // barras e as regras da aventura. No Preparar é o contrário, com um fio entre as caixas (ver
  // prepareFrame).
  const split = print.layout === "adventure" || print.layout === "prepare";
  const adv = split ? (opts.adventure ?? null) : null;
  const ready = Boolean(adv?.name_pt && adv.text_pt !== null && !frameBox);
  const book = ready && print.layout === "adventure" ? adventureBook(data) : null;
  const prepFrame = ready && print.layout === "prepare" ? prepareFrame(data) : null;
  if (split && !book && !prepFrame) return original();
  const advLayout = !adv ? null : book ? adventureLayout(book, adv.mana_cost) : prepFrame ? prepareLayout(prepFrame, adv.mana_cost) : null;
  if (advLayout) {
    const t = advLayout.creature.text;
    layout.erase[2] = { ...layout.erase[2], rect: advLayout.creature.erase };
    layout.box = { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 ?? layout.box.y1 };
  }
  // Algumas digitalizações e molduras (arte estendida) trazem o nome ou o tipo uns
  // pixels acima ou abaixo da medida padrão: mede onde as letras estão e acompanha,
  // para apagar tudo e escrever o português no mesmo lugar.
  // (na sem borda as letras brancas sobre uma barra clara quase não fogem da mediana da
  // linha: a faixa delas sai das viradas de tom, ver letterBandCenter)
  const bandCenter = frameBox ? letterBandCenter : textBandCenter;
  const barCenter = print.frame === "2003" ? BAR_CENTER_2003 : BAR_CENTER;
  alignBar(data, layout, 0, { x0: 70, y0: 45, x1: 420, y1: 120 }, barCenter.title, fx, fy, bandCenter);
  // (a busca das letras do tipo fica entre os fios da barra, sem o contorno dela: o
  // contorno contava como "letra" e escondia o tipo mais baixo das molduras escuras de BRO)
  const typeSearch =
    bar && !typeShift
      ? { x0: 70, y0: Math.max(585, bar.top + 6), x1: 420, y1: Math.min(645, bar.bottom - 1) }
      : { x0: 70, y0: 585 + typeShift, x1: 420, y1: 645 + typeShift };
  alignBar(data, layout, 1, typeSearch, barCenter.type + typeShift, fx, fy, bandCenter);
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
  // Símbolo colado no fim do tipo, sem cor que o separe (a adaga do Lazav comum, MKM 216):
  // a folga de 6 px antes do símbolo deixava o pé do último "e" em inglês. O apagamento vai
  // até o fim da barra, com o desenho do símbolo opaco linha a linha (do primeiro pixel dele
  // em diante): a barra entre o fim do texto e o contorno serve de fonte do remendo. Com o
  // retângulo acabando no símbolo, o remendo só tinha o lado esquerdo, mais claro (a barra
  // escurece para a ponta), e ficava um bloco claro antes da adaga.
  if (symbolInfo.tight && !symbolGuard.length) {
    const r = layout.erase[1].rect;
    layout.erase[1] = { ...layout.erase[1], rect: { ...r, x1: BASE_W * 0.955 } };
    symbolGuard.push(...symbolRowsFrom(data, Math.round(setLeft * fx), Math.round(r.y0 * fy), Math.round(r.y1 * fy)));
  }
  // naves e planetas com Posicionar: as faixas dos níveis mudam de lugar (ver renderStation)
  if (stationParts) {
    const done = await renderStation({
      ctx,
      src,
      sctx,
      data,
      toImg,
      face,
      print,
      W,
      H,
      neural,
      plan,
      layout,
      symbolGuard,
      parts: stationParts,
      manaCost,
    });
    if (done === "ok") return { canvas: out, translated: true };
    return original(done === "neural" ? "neural" : undefined);
  }
  // terreno básico sem texto: o símbolo de mana grande na caixa é desenho, não texto
  const keepBox = /Básic/.test(face.type_pt ?? "") && !(face.text_pt ?? "").trim();
  // a caixa (com marca-d'água) termina no fio interno dela, que muda de lugar entre molduras
  const boxRect = (r: Rect) =>
    keepBox
      ? { x0: 0, y0: 0, x1: 0, y1: 0 }
      : frameBox
        ? roundRect(toImg(frameBox))
        : // (as páginas da Aventura já param antes da lombada e da moldura: a busca dos lados
          // achava a sombra da lombada)
          advLayout
          ? roundRect(toImg(r))
          : insideBoxSides(data, toImg(r), 30 * fx, true);
  const boxErase = layout.erase.find((e) => e.stains);
  const measuredBox = boxErase ? boxRect(boxErase.rect) : null;
  const found = findCardStamp(data, frameBox?.y1);
  // nas cartas a última linha de texto desce até perto do selo: a folga de cima fica
  // só no aro dele, para o pé das letras não ficar protegido (sobrava um tracejado)
  const stamp = found ? { ...found, y0: found.y0 + 3 } : null;
  // (seguindo o contorno da cúpula: nos cantos do retângulo cai o pé das letras; na sem borda,
  // pela forma do próprio selo e do aro que sobe em volta dele, que passam do retângulo)
  const stampGuard =
    !found || !stamp
      ? []
      : frameBox
        ? borderlessStamp(data, toImg({ x0: found.x0 - 30, y0: found.y0 - 8, x1: found.x1 + 30, y1: found.y1 }), toImg(frameBox))
        : stampShape(data, toImg(stamp));
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
  // (na sem borda o "papel" é a arte: a caixa é medida contra a arte das mesmas linhas, com o
  // desenho da moldura de reserva; ver borderlessPtBox)
  if (hasPt && layout.protect[0] && frameBox) {
    const pt = borderlessPtBox(ptSource);
    layout.protect.splice(0, 1, ...ptProtect(pt.top, pt.left));
  } else if (hasPt && layout.protect[0]) {
    const top = ptBoxTop(ptSource, 610 * fx, 670 * fx, 905 * fy, 950 * fy, 890 * fy);
    if (top !== null) {
      const left = ptBoxLeft(ptSource, top + 22 * fy, 545 * fx, 610 * fx, 890 * fy);
      layout.protect.splice(0, 1, ...ptProtect(top / fy, left === null ? null : left / fx));
    }
  }
  // o texto centrado no original (alguns feitiços curtos) sai centrado: medido antes de
  // apagar; na dúvida, à esquerda
  const boxGuard = [...stampGuard, ...layout.protect.map(toImg)];
  const boxPolarity = frameBox ? ("light" as const) : undefined;
  const centered =
    measuredBox && !keepBox && (face.text_pt ?? "").trim() ? measureCentered(data, measuredBox, boxGuard, fx, boxPolarity) === true : false;
  // a ponta arredondada das barras (o contorno e o relevo da curva) fica como está; sem
  // custo de mana, a do fim da barra de nome também (ver barCapGuard). Com o ícone das
  // duas faces ou o indicador de cor, o retângulo começa depois deles: ali não há ponta
  const advBars = advLayout ? [advLayout.name.rect, advLayout.type.rect] : [];
  const advLeft = advLayout ? roundRect(toImg(advLayout.spell.erase)) : null;
  const advCentered = advLeft && adv?.text_pt?.trim() ? measureCentered(data, advLeft, boxGuard, fx) === true : false;
  // (as letras das barras da aventura, medidas antes de apagar)
  const advCenters = advLayout ? advBarCenters(data, advLayout, fy) : null;
  const capGuard = [
    ...[...layout.erase.slice(0, 2).map((e) => e.rect), ...advBars]
      .filter((r) => r.x0 <= 50)
      .flatMap((r) => barCapGuard(data, toImg(r), "left", Boolean(frameBox))),
    ...(!manaCost && !rightIcon ? barCapGuard(data, toImg(layout.erase[0].rect), "right", Boolean(frameBox)) : []),
  ];
  // (a faixa das modais só na moldura comum: as sem borda e as Aventuras não são modais)
  const strip = stripRect && !frameBox && !advLayout ? stripRect : null;
  // Na faixa das modais, o selo fica à direita dela: a proteção dele (que segue a borda preta
  // ligada à cúpula) entrava na faixa e o ponto final de "Add {U}." ficava (Barkchannel
  // Pathway, KHM 251). Nas linhas da faixa, ela começa onde a faixa acaba.
  const stampKept = strip ? beside(stampGuard, roundRect(toImg(strip))) : stampGuard;
  const opaque = [...stampKept, ...layout.protect.map(toImg), ...symbolGuard, ...(strip ? stripCorners.map(toImg) : [])];
  // Os símbolos da habilidade de mana em inglês têm as duas cores: o disco claro e o desenho
  // preto. Com a máscara de uma cor só, o miolo do desenho, longe da beira do disco, ficava
  // (um pingo preto no meio do "Adicione", Drowner of Truth, MH3 253): a faixa passa de novo
  // com a outra cor.
  const stripPolarity = strip ? textPolarity(data, roundRect(toImg(strip))) : undefined;
  // as páginas da Aventura escurecem em direção à lombada: a sombra sai antes de apagar e volta
  // depois (ver pageShade)
  const shaded =
    advLeft && measuredBox && advLayout?.shaded ? [measuredBox, advLeft].map((rect) => ({ rect, shade: pageShade(data, rect) })) : [];
  const unshade = shaded.map((p) => shadePage(data, p.rect, p.shade));
  // barra de tipo translúcida, com a arte por trás e letra branca (artes estendidas): só as
  // letras saem, e a arte em volta delas fica (ver glassBarLetters)
  const typeRect = roundRect(toImg(layout.erase[1].rect));
  const glass = frameBox ? null : glassBarLetters(data, typeRect, [...opaque, ...capGuard], capGuard);
  // Marca-d'água da moldura de 2003 (as das guildas, a mirrana e a phyrexiana, os logotipos das
  // promos): cinza-clara e sem cor, o apagamento de sempre a levava só onde as letras passavam, e
  // o resto ficava em cacos (ADR 0024). Só as letras saem, e a rede neural refaz a marca por baixo
  // delas, como na carta impressa
  const keepMark = print.frame === "2003" && Boolean(print.watermark) && !frameBox && !advLayout && Boolean(measuredBox) && !keepBox;
  // (a moldura sem borda vai inteira para a rede neural, logo abaixo)
  const inks = eraseRegions(
    data,
    // (abaixo da medida fixa, só o pé das letras: a medida do terço da esquerda pode
    // passar do fio de baixo nas outras partes da caixa)
    [
      ...layout.erase.slice(subtitle ? 1 : 0, frameBox ? 0 : keepMark ? 2 : 3).map((e) => ({
        rect: e.stains && measuredBox ? measuredBox : glass && e === layout.erase[1] ? typeRect : toImg(e.rect),
        threshold: e.threshold,
        colorThreshold: e.colorThreshold,
        fill: glass && e === layout.erase[1] ? ("pyramid" as const) : e.fill,
        letters: glass && e === layout.erase[1] ? glass : undefined,
        stains: e.stains,
        attachedBelow: e.stains ? (advLayout?.attachedBelow ? advLayout.attachedBelow * fy : toImg(e.rect).y1) : undefined,
        force:
          e.stains && bands
            ? bands.bands.map((b) => ({ x0: bands.x0 - 3 * fx, y0: b.y0 - 3 * fy, x1: bands.x1 + 3 * fx, y1: b.y1 + 3 * fy }))
            : undefined,
      })),
      // (as barras da aventura como as do nome e do tipo; a página da esquerda como a caixa)
      // (com o limiar mais baixo que o das barras do nome e do tipo, ver ADVENTURE.barThreshold e PREPARE.barThreshold)
      ...advBars.map((r) => ({ rect: toImg(r), threshold: advLayout?.barThreshold ?? 20, fill: "rows" as const })),
      ...(advLeft
        ? [
            {
              rect: advLeft,
              threshold: 14,
              colorThreshold: 34,
              stains: true,
              attachedBelow: (advLayout?.attachedBelow ?? advLayout?.spell.erase.y1 ?? 0) * fy,
            },
          ]
        : []),
      // (a faixa das modais é uma barra: fundo e preenchimento linha a linha)
      ...(strip ? [{ rect: roundRect(toImg(strip)), threshold: 28, fill: "rows" as const, polarity: stripPolarity }] : []),
      ...(strip && hint?.mana
        ? [
            {
              rect: roundRect(toImg(strip)),
              threshold: 28,
              fill: "rows" as const,
              polarity: stripPolarity === "dark" ? ("light" as const) : ("dark" as const),
            },
          ]
        : []),
      // na faixa clara, os símbolos têm um halo do disco, até ~24 tons mais escuro que a faixa: o
      // que o português não cobria ficava (um arco claro no "Ad" do Cragcrown Pathway, ZNR 261)
      ...(strip && hint?.mana && stripPolarity === "dark"
        ? [{ rect: roundRect(toImg(strip)), threshold: 14, fill: "rows" as const, polarity: "dark" as const }]
        : []),
    ],
    [],
    // o selo de promoção (oval holográfico), a aba das cartas de duas faces e a caixa de
    // P/R sobem para dentro da caixa de texto: ficam, e a cor deles não entra no
    // preenchimento ao lado (a caixa de P/R dourada deixava um brilho dourado acima dela)
    opaque,
    capGuard,
  );
  for (const back of unshade) back();
  // Sem borda: a arte aparece por trás das letras, e o preenchimento simples deixaria um
  // borrão. As letras brancas vão para a rede neural (ver lamaBox e whiteTextMask); selo,
  // caixa de P/R, símbolo da coleção e pontas das barras ficam escondidos dela, para a cor
  // deles não vazar. As barras do nome e do tipo também são translúcidas: o preenchimento
  // por linha das barras opacas achatava a arte de trás num borrão liso (a asa atrás do tipo
  // do Lord of the Pit, SLD 1857; a placa atrás do "Sorcery" do Temporal Trespass, SLD
  // 2190). As duas barras vão num quadro do modelo, a aba do crossover noutro e a caixa
  // noutro, cada um reduzido aos 512 px do modelo (a caixa já foi em dois na resolução da
  // imagem; num só ficou igual e 30% mais rápida, ADR 0015).
  // (com nome de crossover, o nome do alto fica e a aba vai à parte, logo abaixo)
  const bars = (subtitle ? [layout.erase[1].rect] : [layout.erase[0].rect, layout.erase[1].rect]).map((r) => roundRect(toImg(r)));
  const barArea = {
    x0: Math.min(...bars.map((r) => r.x0)),
    y0: Math.min(...bars.map((r) => r.y0)),
    x1: Math.max(...bars.map((r) => r.x1)),
    y1: Math.max(...bars.map((r) => r.y1)),
  };
  const subtitleRect = subtitle ? roundRect(toImg(subtitle)) : null;
  if (frameBox) {
    // o total de quadros da carta, antes do primeiro: a prévia mostra "parte X de Y"
    plan(1 + (subtitleRect ? 1 : 0) + (measuredBox && !keepBox ? 1 : 0));
    const guard = [...opaque, ...capGuard];
    const barMasks = bars.map((rect) => ({ rect, mask: whiteTextMask(data, rect, guard), polarity: "light" as const }));
    const clean = await lamaBox(data, barMasks, barArea, guard, "light", `${print.id}:${data.width}:${side}:barras`, {
      grow: Math.round(fx * 2),
      gap: 0,
      simple: false,
      neural,
    });
    if (!clean) return original("neural");
  }
  // A aba do nome de crossover vai à rede neural sozinha, num recorte justo e com o grão
  // de volta (sobre ela também aparece a arte: Awesome Android da Marvel, MSC; a retícula da
  // aba do Yojimbo, SLD 7004, num quadro reduzido junto com a barra de tipo, saía num
  // remendo liso e mais claro). Os aros de cima e de baixo da aba ficam escondidos do modelo.
  if (subtitle && subtitleRect) {
    const rect = subtitleRect;
    const rims = [
      { x0: rect.x0, y0: rect.y0 - Math.round(3 * fy), x1: rect.x1, y1: rect.y0 },
      { x0: rect.x0, y0: rect.y1, x1: rect.x1, y1: rect.y1 + Math.round(3 * fy) },
    ];
    const guard = [...opaque, ...capGuard, ...rims];
    const clean = await lamaBox(
      data,
      [{ rect, mask: whiteTextMask(data, rect, guard, subtitle.ink), polarity: "light" }],
      rect,
      guard,
      "light",
      `${print.id}:${data.width}:${side}:aba`,
      { art: true, grow: Math.round(fx * 2), gap: 0, simple: false, neural },
    );
    if (!clean) return original("neural");
  }
  if (frameBox && measuredBox && !keepBox) {
    const mask = whiteTextMask(data, measuredBox, opaque, 110, true);
    // o fio entre as regras e o flavor sai também: o português põe o dele, se tiver flavor
    const bw = measuredBox.x1 - measuredBox.x0;
    for (const y of boxDividers(data, measuredBox))
      for (let yy = y - 1; yy <= y + 1; yy++)
        for (let x = measuredBox.x0; x < measuredBox.x1; x++)
          if (!opaque.some((g) => x >= g.x0 && x < g.x1 && yy >= g.y0 && yy < g.y1))
            mask[(yy - measuredBox.y0) * bw + x - measuredBox.x0] = 1;
    const masks = [{ rect: measuredBox, mask, polarity: "light" as const }];
    // (máscara justa: entre as letras fica a arte, que o modelo usa de modelo; com os vãos
    // fechados, cada linha virava uma faixa inteira para inventar, e na gravura do Shivan
    // Dragon da Secret Lair as faixas saíam borradas)
    const clean = await lamaBox(data, masks, measuredBox, opaque, "light", `${print.id}:${data.width}:${side}`, {
      art: true,
      grow: Math.round(fx * 2),
      gap: 0,
      simple: false,
      neural,
    });
    if (!clean) return original("neural");
  }
  // (a cor da letra da caixa, medida antes de apagar: sem a caixa em `eraseRegions`, ela não
  // vem de lá)
  const markInk = keepMark && measuredBox ? textPolarity(data, measuredBox) : undefined;
  if (keepMark && measuredBox && markInk) {
    plan(1);
    // (só as letras: a marca é uns 20 a 40 tons mais escura que o papel, e as letras, pretas)
    const mask = textMask(data, measuredBox, WATERMARK_2003.ink, opaque, WATERMARK_2003.color, markInk);
    const clean = await lamaBox(
      data,
      [{ rect: measuredBox, mask, polarity: markInk }],
      measuredBox,
      opaque,
      markInk,
      `${print.id}:${data.width}:${side}:marca`,
      {
        art: true,
        grow: Math.round(fx * 2),
        gap: 0,
        simple: false,
        neural,
      },
    );
    if (!clean) return original("neural");
  }
  // (sem a região do nome, apagada à parte, as cores medidas começam pela do tipo)
  const measured: ("dark" | "light" | undefined)[] = subtitle
    ? [undefined, ...inks]
    : markInk
      ? [...inks.slice(0, 2), markInk, ...inks.slice(2)]
      : inks;
  const titleInk = frameBox ? "light" : (measured[0] ?? "light");
  const typeInk = frameBox ? "light" : (measured[1] ?? "light");
  const boxInk = measured[2] ?? boxPolarity ?? "light";
  const advInks = advLayout ? inks.slice(-3) : [];
  const stripInk = strip ? stripPolarity : undefined;
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
  // (a aba de algumas fica uns pixels mais alta, ver subtitleShift)
  // (na moldura de 2003, a Matrix Bold, ADR 0024)
  const tf = titleFont(print.frame === "2003");
  if (subtitle) drawSubtitle(ctx, face.name_pt ?? face.name_en, SUBTITLE.baseline + subtitle.y0 - SUBTITLE.y0, k);
  else
    drawLine(
      ctx,
      face.name_pt ?? face.name_en,
      layout.title.x,
      layout.title.centerY,
      layout.title.maxWidth,
      layout.title.size,
      k,
      INK[titleInk],
      tf,
    );
  if (face.type_pt)
    drawLine(ctx, face.type_pt, layout.type.x, layout.type.centerY, layout.type.maxWidth, layout.type.size, k, INK[typeInk], tf);
  if (backPt) drawBackPt(ctx, backPt, layout.box.y1 - BACK_PT_NOTCH.height / 2, k, boxInk);

  const box = layout.box;
  const symbols = await preloadSymbols(face.text_pt, opts.flavor, adv?.text_pt, strip ? hint?.mana : null);
  const m = measurer(ctx, k);
  if (strip && hint) drawMdfcHint(ctx, hint, strip.x1, k, stripInk ?? "light", symbols);
  if (advLayout && adv && advCenters) {
    const centers = advCenters;
    drawLine(
      ctx,
      adv.name_pt ?? adv.name_en,
      advLayout.name.x,
      centers[0],
      advLayout.name.maxWidth,
      advLayout.name.size,
      k,
      INK[advInks[0] ?? "light"],
    );
    if (adv.type_pt)
      drawLine(ctx, adv.type_pt, advLayout.type.x, centers[1], advLayout.type.maxWidth, advLayout.type.size, k, INK[advInks[1] ?? "light"]);
    const page = advLayout.spell.text;
    const left = fitText(adv.text_pt, null, page.x1 - page.x0, page.y1 - page.y0, m, advLayout.maxSize, 15, undefined, adv.ability_words);
    drawLayout(ctx, left, page, k, advInks[2] ?? "dark", symbols, m, advCentered);
  }
  const res = fitText(
    face.text_pt,
    opts.flavor ?? null,
    box.x1 - box.x0,
    box.y1 - box.y0,
    m,
    advLayout ? advLayout.maxSize : 34,
    15,
    backPt ? BACK_PT_NOTCH : undefined,
    face.ability_words,
  );
  const shade = bands ? { x0: bands.x0 / fx, x1: bands.x1 / fx, color: `rgb(${bands.color.join(",")})` } : undefined;
  drawLayout(ctx, res, box, k, boxInk, symbols, m, centered, shade);

  return { canvas: out, translated: true };
}
