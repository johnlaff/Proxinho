/**
 * Moldura de Saga (desde Dominaria, 2018).
 *
 * A caixa de texto é uma coluna à esquerda da arte: no alto, o lembrete ("(As this Saga
 * enters…)") ou o "Read ahead"; embaixo, uma faixa por capítulo, ou por grupo de capítulos
 * com o mesmo texto ("I, II —"). Os marcadores hexagonais com o número de cada capítulo
 * ficam numa tira à esquerda (x ≈ 30 a 84) e não são apagados: o português de cada capítulo
 * vai na faixa dele, ao lado do marcador. A barra de tipo fica no pé, uns 291 px abaixo da
 * barra da carta comum.
 *
 * A altura das faixas depende do texto em inglês, então os fios entre elas são medidos na
 * imagem: cada fio é uma sombra que escurece por uns 8 px e acaba num degrau claro na largura
 * toda da coluna. Letra nenhuma faz esse degrau na largura toda.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas em DOM, THB, KHM, MH2,
 * DMU, LTR, WOE, MH3, DSK, TDM, SPM, MSH, HOB e TRK.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const SAGA = {
  /** a coluna de texto: do fio da esquerda (x ≈ 58) até a arte; do pé da barra do nome ao fio de baixo */
  column: { x0: 60, y0: 119, y1: 867 },
  /** nas faixas de capítulo, o papel começa depois da tira dos marcadores (x ≈ 84) */
  chapterX0: 87,
  /** onde o texto começa: o do alto na margem, o dos capítulos depois dos marcadores */
  text: { topX0: 66, chapterX0: 100, gap: 8 },
  /** o fio escuro do lado esquerdo da arte, em x ≈ 370 a 374 */
  art: { x0: 360, x1: 384 },
  /** fio de cima da barra de tipo (y ≈ 870 a 875 com a sombra) e o desvio em relação à carta comum */
  type: { y0: 862, y1: 900, shift: 291 },
};

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Lado esquerdo da arte (escala-base): a coluna mais escura (mediana das linhas 150 a 850)
 * entre x 360 e 384, onde fica o fio preto que separa a coluna de texto da arte. `null`
 * quando nenhuma coluna ali é escura de verdade (não é a moldura de Saga).
 */
export function sagaArtLeft(img: ImageData): number | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const y0 = Math.round(150 * fy);
  const y1 = Math.round(850 * fy);
  const col = new Float32Array(y1 - y0);
  let best = Infinity;
  let at = -1;
  for (let x = Math.round(SAGA.art.x0 * fx); x <= Math.round(SAGA.art.x1 * fx); x++) {
    for (let y = y0; y < y1; y++) col[y - y0] = lum(img.data, (y * img.width + x) * 4);
    const med = col.slice().sort()[col.length >> 1];
    if (med < best) {
      best = med;
      at = x;
    }
  }
  return best < 90 ? at / fx : null;
}

/**
 * Fios entre as faixas da coluna (escala-base, a linha do degrau claro), de cima para baixo.
 * No degrau, 85% ou mais da largura (de x 100 até 8 px antes da arte) clareia mais de 6 tons
 * em duas linhas (da `y − 2` para a `y`), e a sombra acima dele escurece: a mediana da linha
 * 6 px acima fica 5 tons ou mais acima da linha logo antes do degrau (ou da anterior). O pé das
 * letras clareia só onde havia tinta, longe dos 85%; o grão do papel de MH2 chega a 73%.
 */
export function sagaDividers(img: ImageData, artLeft: number): number[] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const x0 = Math.round(100 * fx);
  const x1 = Math.round((artLeft - 8) * fx);
  const w = x1 - x0;
  if (w <= 0) return [];
  const shade = new Float32Array(w);
  const out: number[] = [];
  let last = -Infinity;
  const at = (x: number, y: number) => lum(img.data, (y * img.width + x) * 4);
  const above = Math.round(6 * fy);
  // sombra: mediana de quanto a linha `y - 1 - above` é mais clara que a linha `y - 1`
  const shadow = (y: number) => {
    for (let x = x0; x < x1; x++) shade[x - x0] = at(x, y - 1 - above) - at(x, y - 1);
    return shade.slice().sort()[w >> 1];
  };
  for (let y = Math.round(126 * fy); y <= Math.round(860 * fy); y++) {
    // (o degrau é medido em duas linhas: nas digitalizações, como as cartas de Theros e as
    // promos de pré-estreia, ele se espalha por duas e não passava de 6 tons em nenhuma)
    let up = 0;
    for (let x = x0; x < x1; x++) if (at(x, y) - at(x, y - 2) > 6) up++;
    if (up < w * 0.85) continue;
    const fresh = y - last > 4 * fy;
    last = y;
    if (!fresh) continue;
    // a linha mais escura da sombra é a de antes do degrau, ou a anterior quando ele se espalha
    if (Math.max(shadow(y), shadow(y - 1)) >= 5) out.push(y / fy);
  }
  return out;
}

/** Linha de capítulo do texto em PT: "I — …", "I, II — …" (o número vem do Oracle, ver o pipeline). */
const CHAPTER = /^((?:[IVX]+)(?:, [IVX]+)*) — (.+)$/;

export interface SagaText {
  /** linhas antes dos capítulos (o lembrete do texto impresso, o "Ler adiante"), com o índice em `text_pt` */
  top: { text: string; line: number }[];
  /** um item por faixa de capítulo, sem o número (que está no marcador) */
  chapters: { numerals: string; text: string; line: number }[];
}

/**
 * Separa o texto em PT da Saga em linhas do alto e capítulos. `null` quando não há capítulo
 * ou há texto depois deles (as criaturas Saga de Final Fantasy, com a palavra-chave embaixo,
 * têm outra moldura).
 */
export function sagaText(text: string | null): SagaText | null {
  const top: SagaText["top"] = [];
  const chapters: SagaText["chapters"] = [];
  const lines = (text ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = CHAPTER.exec(line);
    if (m) chapters.push({ numerals: m[1], text: m[2], line: i });
    else if (chapters.length) return null;
    else top.push({ text: line, line: i });
  }
  return chapters.length ? { top, chapters } : null;
}

/**
 * As faixas da coluna (escala-base): a do alto e uma por capítulo, entre os fios medidos. O
 * retângulo `erase` vai do fio de cima ao de baixo, sem a tira dos marcadores; `text` é onde
 * o português cabe, com folga da sombra do fio de baixo.
 */
export function sagaBands(dividers: number[], artLeft: number): { erase: Rect; text: Rect }[] {
  const edges = [SAGA.column.y0, ...dividers, SAGA.column.y1];
  const x1 = artLeft - 2;
  const out: { erase: Rect; text: Rect }[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const top = i === 0;
    const y0 = edges[i] + (top ? 0 : 1);
    const y1 = edges[i + 1] - (i + 2 < edges.length ? 1 : 0);
    out.push({
      erase: { x0: top ? SAGA.column.x0 : SAGA.chapterX0, y0, x1, y1 },
      text: {
        x0: top ? SAGA.text.topX0 : SAGA.text.chapterX0,
        y0: y0 + SAGA.text.gap,
        x1: artLeft - 10,
        // (a do alto acaba antes da curva da tira dos marcadores, ver TOP_CURVE_CLEAR)
        y1: top && edges.length > 2 ? edges[1] - TOP_CURVE_CLEAR : y1 - SAGA.text.gap - (i + 2 < edges.length ? 6 : 0),
      },
    });
  }
  return out;
}

/**
 * Centros (y, escala-base) dos números romanos dos marcadores, de cima para baixo, entre `from`
 * e `to`. O número é tinta escura no meio do marcador (x 44 a 71) com o dourado claro do
 * hexágono dos dois lados (x 35 a 42 e 73 a 79); a tira entre os marcadores tem a cor da
 * moldura dos dois lados (preta, creme, verde…) e nunca tem as duas coisas na mesma linha. Um
 * número tem de 19 a 27 px de altura; a curva da tira no alto e a ponta dela no pé, mais
 * baixas ou mais altas que isso, ficam de fora.
 */
export function sagaNumerals(img: ImageData, from: number, to: number): number[] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const X = (v: number) => Math.round(v * fx);
  const at = (x: number, y: number) => lum(img.data, (y * img.width + x) * 4);
  const groups: [number, number][] = [];
  for (let y = Math.round(from * fy); y < Math.round(Math.min(to, 845) * fy); y++) {
    let dark = 0;
    for (let x = X(44); x < X(71); x++) if (at(x, y) < 100) dark++;
    let light = 0;
    let n = 0;
    for (const [a, b] of [
      [X(35), X(42)],
      [X(73), X(79)],
    ])
      for (let x = a; x < b; x++, n++) if (at(x, y) > 140) light++;
    if (dark < 2 || light < n * 0.7) continue;
    const last = groups[groups.length - 1];
    if (last && y - last[1] <= Math.max(3, Math.round(3 * fy))) last[1] = y;
    else groups.push([y, y]);
  }
  return groups
    .filter(([a, b]) => (b - a) / fy >= 19 && (b - a) / fy <= 27)
    .map(([a, b]) => (a + b) / 2 / fy)
    .filter((c) => c <= 825);
}

/** Meia altura de um marcador (o hexágono tem ~60 px de altura). */
export const MARKER_HALF = 31;

/** Folgas do texto (escala-base): abaixo de um fio, acima dele (com a sombra) e nas pontas da coluna. */
export const SAGA_PAD = { below: 9, above: 15, edge: 10 };

/**
 * Quanto acima do fio de cima original o texto do alto tem de acabar (escala-base): a tira dos
 * marcadores sobe em curva até ele (`TOP_CURVE`) e, a 24 px dele, já passa de x = 65, onde o
 * texto do alto começa. O lembrete comprido em PT descia até ali e o "S" de "Sacrifique-a"
 * ficava por baixo da curva.
 */
export const TOP_CURVE_CLEAR = 26;

/**
 * Onde ficam os fios entre as faixas, com o texto em PT de cada uma medindo `heights` (a do
 * alto primeiro, se houver, e uma por capítulo). Os marcadores não saem do lugar, mas os fios
 * podem: cada um fica entre o último marcador de um capítulo e o primeiro do seguinte (o
 * primeiro, abaixo do texto do alto e acima do primeiro marcador), e cada faixa tem de caber o
 * texto dela. Dentro do que cabe, cada fio fica no meio do caminho entre o texto de cima e o de
 * baixo, cada um centrado nos seus marcadores, como na carta impressa. `markers` traz, por
 * capítulo, o centro do primeiro e do último número. `topLimit` é onde o texto do alto tem de
 * acabar: a curva da tira dos marcadores fica onde estava, no fio de cima original (ver
 * `TOP_CURVE_CLEAR`). `null` quando não cabe.
 */
export function sagaPlan(
  heights: number[],
  hasTop: boolean,
  markers: { first: number; last: number }[],
  topLimit = Infinity,
): number[] | null {
  const { y0: top, y1: bottom } = SAGA.column;
  const n = heights.length;
  if (n !== markers.length + (hasTop ? 1 : 0) || n < 1) return null;
  if (hasTop && top + SAGA_PAD.edge + heights[0] > topLimit) return null;
  // um grupo só, sem nada no alto: nenhum fio, o texto na coluna inteira
  if (n === 1) return heights[0] + 2 * SAGA_PAD.edge <= bottom - top ? [] : null;
  // marcadores de cada faixa (a do alto não tem)
  const mk = (i: number) => markers[i - (hasTop ? 1 : 0)];
  const center = (i: number) => (hasTop && i === 0 ? top + SAGA_PAD.edge + heights[0] / 2 : (mk(i).first + mk(i).last) / 2);
  // altura mínima de cada faixa: o texto mais as folgas do fio de cima e do de baixo
  const need = heights.map((h, i) => h + (i === 0 ? SAGA_PAD.edge : SAGA_PAD.below) + (i === n - 1 ? SAGA_PAD.edge : SAGA_PAD.above));
  const lo: number[] = [];
  const hi: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    const above = hasTop && j === 0 ? top + 40 : mk(j).last + MARKER_HALF + 2;
    lo.push(above);
    hi.push(mk(j + 1).first - MARKER_HALF - 2);
  }
  // o mais cedo e o mais tarde possível para cada fio
  const early: number[] = [];
  for (let j = 0; j + 1 < n; j++) early.push(Math.max(lo[j], (j ? early[j - 1] : top) + need[j]));
  const late: number[] = new Array(n - 1);
  for (let j = n - 2; j >= 0; j--) late[j] = Math.min(hi[j], (j === n - 2 ? bottom : late[j + 1]) - need[j + 1]);
  if (early.some((e, j) => e > late[j])) return null;
  const out: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    const ideal = (center(j) + heights[j] / 2 + center(j + 1) - heights[j + 1] / 2) / 2;
    const min = Math.max(early[j], (j ? out[j - 1] : top) + need[j]);
    out.push(Math.round(Math.min(Math.max(ideal, min), late[j])));
  }
  return out;
}

/**
 * O retângulo do texto do alto, encostado em cima (escala-base): o lembrete fica no alto da
 * faixa, como na carta impressa. Centrado numa faixa mais alta que ele, descia até a curva da
 * tira dos marcadores (Book of Mazarbul, LTR 116), e `sagaPlan` conta com ele em cima.
 */
export function topAligned(box: Rect, height: number): Rect {
  return { ...box, y1: Math.min(box.y1, box.y0 + height) };
}

/** Retângulos de texto das faixas (escala-base) entre os fios `dividers`, com as folgas de `SAGA_PAD`. */
export function sagaBoxes(dividers: number[], hasTop: boolean, artLeft: number): Rect[] {
  const edges = [SAGA.column.y0, ...dividers, SAGA.column.y1];
  return edges.slice(0, -1).map((y, i) => ({
    x0: hasTop && i === 0 ? SAGA.text.topX0 : SAGA.text.chapterX0,
    y0: y + (i === 0 ? SAGA_PAD.edge : SAGA_PAD.below),
    x1: artLeft - 10,
    y1: edges[i + 1] - (i + 2 === edges.length ? SAGA_PAD.edge : SAGA_PAD.above),
  }));
}

/** Quantas linhas de imagem o desenho do fio ocupa: a sombra acima do degrau e o pé dele. */
export const DIVIDER_SPAN = { above: 11, below: 3 };

/**
 * O fio da carta como fator de cada canal, linha a linha (de `DIVIDER_SPAN.above` acima do degrau
 * até `DIVIDER_SPAN.below` abaixo): a mediana, na largura `x0`–`x1` (escala da imagem), do
 * original dividido pela coluna já sem o fio. A sombra escurece o papel como um filtro; o fator
 * leva também a cor dela (dourada no papel de Kaldheim, cinza no comum).
 */
export function dividerProfile(orig: ImageData, clean: ImageData, y: number, x0: number, x1: number): number[][] {
  const out: number[][] = [];
  const vals: number[][] = [[], [], []];
  for (let dy = -DIVIDER_SPAN.above; dy <= DIVIDER_SPAN.below; dy++) {
    for (const v of vals) v.length = 0;
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const i = ((y + dy) * orig.width + x) * 4;
      for (let c = 0; c < 3; c++) vals[c].push(orig.data[i + c] / Math.max(1, clean.data[i + c]));
    }
    out.push(vals.map((v) => v.sort((a, b) => a - b)[v.length >> 1] ?? 1));
  }
  return out;
}

/** Desenha o fio com o fator de `dividerProfile`, com o degrau na linha `y` (escala da imagem). */
export function drawDivider(img: ImageData, y: number, profile: number[][], x0: number, x1: number): void {
  profile.forEach((f, k) => {
    const yy = y - DIVIDER_SPAN.above + k;
    if (yy < 0 || yy >= img.height) return;
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const i = (yy * img.width + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.min(255, Math.round(img.data[i + c] * f[c]));
    }
  });
}

/**
 * A curva da tira dos marcadores no pé da faixa do alto (escala-base): onde o papel começa, em x,
 * pela distância ao fio de cima. Até 36 px acima do fio o papel começa em x ≈ 58; dali a curva
 * avança até x ≈ 86 no fio. Medida em 15 coleções (a de DMU fica uns 4 px mais baixa).
 */
const TOP_CURVE: [number, number][] = [
  [-36, 58],
  [-32, 59],
  [-28, 62],
  [-24, 65],
  [-20, 69],
  [-16, 72],
  [-12, 77],
  [-8, 80],
  [-4, 84],
  [0, 86],
];

function curveAt(dy: number): number {
  if (dy <= TOP_CURVE[0][0]) return TOP_CURVE[0][1];
  for (let i = 1; i < TOP_CURVE.length; i++) {
    const [a, xa] = TOP_CURVE[i - 1];
    const [b, xb] = TOP_CURVE[i];
    if (dy <= b) return xa + ((dy - a) / (b - a)) * (xb - xa);
  }
  return TOP_CURVE[TOP_CURVE.length - 1][1];
}

/**
 * A moldura à esquerda do papel em cada linha da faixa do alto (escala da imagem), de `y0` até o
 * fio de cima (`divider`, escala-base), para proteger: a tira dos marcadores sobe em curva até o
 * fio, e apagado como papel o pedaço da curva virava um retângulo branco. Em cada linha o papel
 * começa no primeiro pixel (com os dois seguintes) a até 25 tons do papel da linha (o quarto mais
 * claro, de x 100 até a arte: no meio das letras do lembrete a mediana já caía na tinta), dentro
 * da curva medida (`TOP_CURVE`) com 4 px de folga para cima e para baixo. Moldura clara como o
 * papel (Kaldheim, Wilds of Eldraine) não se separa assim: fica a curva medida.
 */
export function sagaTopFrame(img: ImageData, y0: number, divider: number, artLeft: number): Rect[] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const m0 = Math.round(100 * fx);
  const m1 = Math.round((artLeft - 8) * fx);
  const row = new Float32Array(m1 - m0);
  const out: Rect[] = [];
  const xs = Math.round(52 * fx);
  for (let y = Math.round(y0); y < Math.round(divider * fy); y++) {
    const dy = y / fy - divider;
    const min = Math.round((curveAt(dy - 4) - 1) * fx);
    const max = Math.round((curveAt(dy + 4) + 1) * fx);
    for (let x = m0; x < m1; x++) row[x - m0] = lum(img.data, (y * img.width + x) * 4);
    const paper = row.slice().sort()[Math.floor(row.length * 0.75)];
    let left = max;
    for (let x = min; x < max; x++) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) ok = Math.abs(lum(img.data, (y * img.width + x + k) * 4) - paper) <= 25;
      if (ok) {
        left = x;
        break;
      }
    }
    out.push({ x0: xs, y0: y, x1: left, y1: y + 1 });
  }
  return out;
}
