/**
 * Cartas viradas de Kamigawa (flip, ADR 0044). A carta tem duas metades numa imagem só: a de cima,
 * de pé, com a barra do nome, a caixa de texto e a barra de tipo acima da arte; e a de baixo, a da
 * carta virada, impressa de cabeça para baixo abaixo da arte, na mesma ordem. Girada 180°, a de
 * baixo fica de pé, com a barra do nome no alto, a caixa e a barra de tipo, uns 28 px (na moldura
 * de 2003) ou 81 px (na atual) mais abaixo que as da de cima. A caixa de P/R fica no fim de cada
 * barra de tipo, quando a metade é criatura; na moldura atual, o símbolo da coleção fica na barra
 * de tipo da de cima, antes da caixa de P/R.
 *
 * O motor apaga e escreve a de cima na carta de pé e a de baixo na carta girada (`renderFlip` em
 * render.ts). O nome fica como está: as cartas viradas só têm a tradução não oficial, com o nome
 * em inglês (ADR 0025). As medidas são da escala-base (745 × 1040) de cada orientação, conferidas
 * nas 33 impressões de borda preta e branca de Kamigawa e das reimpressões.
 */
import type { Rect } from "./geometry";
import { typeBarEdges } from "./erase";
import { paperBoxes, type BoxEdge } from "./split";

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** As medidas de uma metade, na orientação em que ela fica de pé. */
export interface FlipHalf {
  /** onde fica o fio de cima da barra de tipo (de `top[0]` a `top[1]`) */
  top: readonly [number, number];
  /** os limites do papel da caixa e a parte que fica dentro dele em qualquer impressão */
  box: Rect;
  core: Rect;
  /** onde a primeira letra do tipo começa (a posição da linha) */
  typeX: number;
}

/** Medidas de uma moldura de carta virada (escala-base 745 × 1040, em cada orientação). */
export interface FlipGeometry {
  /** a moldura de 2003: o tipo na Matrix Bold, pelo centro das minúsculas */
  frame2003: boolean;
  /** a de cima, na carta de pé, e a de baixo, na carta girada 180° */
  halves: readonly [FlipHalf, FlipHalf];
  /** a altura da barra de tipo, do fio de cima ao de baixo */
  span: readonly [number, number];
  /** o apagamento do tipo: de `x0` e das linhas `top + dy0` a `bottom + dy1` */
  typeErase: { x0: number; dy0: number; dy1: number };
  /** o centro das minúsculas do tipo abaixo do fio de cima, quando a medida no inglês falha */
  typeCenter: number;
  /**
   * o fio escuro de dentro da caixa de P/R, procurado de `x0` a `x1`; a sombra dela começa uns
   * `gap` px antes, e o apagamento do tipo para ali. Sem a caixa (a metade que não é criatura), a
   * barra vai até `barEnd`
   */
  pt: { x0: number; x1: number; gap: number; barEnd: number };
  /** o símbolo da coleção na barra de tipo da metade de cima (a moldura atual) */
  setSymbol: boolean;
  typeSize: number;
  boxEdge: BoxEdge;
  boxPad: { x0: number; y0: number; x1: number; y1: number };
  maxSize: number;
  minSize: number;
}

/**
 * A moldura de 2003 (Champions, Betrayers e Saviors of Kamigawa, as reimpressões de The List e do
 * Commander 2011). A barra de tipo da de cima vai de y ≈ 258 (o fio de cima) a 312 (o de baixo), e
 * a da de baixo, girada, de 286 a 341; o papel da caixa, de 131 a 257 e de 159 a 285. A caixa da de
 * baixo fica 6 px mais à direita (o papel vai de x ≈ 60 a 678 em cima e de 66 a 684 embaixo; na
 * moldura branca, a borda tem a cor do papel e a medida para no limite). O tipo começa em x ≈ 63 a
 * 67 (Champions e Betrayers) e o fio escuro de dentro da caixa de P/R fica em x ≈ 593 a 599, com a
 * sombra dela começando 6 a 11 px antes; o "Monk" mais comprido acaba em 581 (Dokai, Weaver of
 * Life, CHK 202). Sem a caixa de P/R, a barra acaba em x ≈ 685.
 */
export const FLIP_2003: FlipGeometry = {
  frame2003: true,
  halves: [
    { top: [250, 266], box: { x0: 57, y0: 124, x1: 681, y1: 262 }, core: { x0: 90, y0: 150, x1: 650, y1: 240 }, typeX: 64 },
    { top: [278, 294], box: { x0: 63, y0: 152, x1: 687, y1: 290 }, core: { x0: 90, y0: 178, x1: 650, y1: 268 }, typeX: 65 },
  ],
  span: [50, 58],
  /** o papel vai de ~3 px abaixo do fio de cima até o de baixo; a ponta da barra acaba em x ≈ 57 */
  typeErase: { x0: 60, dy0: 3, dy1: 0 },
  typeCenter: 34,
  pt: { x0: 585, x1: 610, gap: 11, barEnd: 676 },
  setSymbol: false,
  /** maiúsculas com 23 px, como no tipo da carta de pé de 2003 */
  typeSize: 30,
  boxEdge: { inset: 0, drop: 30 },
  /** o inglês vai de x ≈ 71 a 673 e de y ≈ 139 a 254 na de cima */
  boxPad: { x0: 10, y0: 5, x1: 7, y1: 4 },
  maxSize: 34,
  minSize: 15,
};

/**
 * A moldura atual (Commander 2018 e Commander Anthology Volume II). A barra de tipo da de cima vai
 * de y ≈ 232 a 296, com o fio grosso de cima até 243, e a da de baixo, girada, de 313 a 377; o papel
 * da caixa, de 99 a 231 e de 179 a 312, e de x ≈ 58 a 690. O símbolo da coleção fica em x ≈ 555 a
 * 591, e o fio de dentro da caixa de P/R em 599 a 606.
 */
export const FLIP_2015: FlipGeometry = {
  frame2003: false,
  halves: [
    { top: [224, 240], box: { x0: 54, y0: 92, x1: 694, y1: 236 }, core: { x0: 90, y0: 115, x1: 650, y1: 215 }, typeX: 63 },
    { top: [305, 321], box: { x0: 53, y0: 172, x1: 693, y1: 317 }, core: { x0: 90, y0: 196, x1: 650, y1: 296 }, typeX: 63 },
  ],
  span: [58, 70],
  /** o papel vai do fim do fio grosso (~12 px abaixo do fio de cima) até 1 px antes do de baixo */
  typeErase: { x0: 50, dy0: 12, dy1: -1 },
  typeCenter: 40,
  pt: { x0: 596, x1: 616, gap: 11, barEnd: 690 },
  setSymbol: true,
  typeSize: 30,
  boxEdge: { inset: 1, drop: 30 },
  /** o inglês vai de x ≈ 64 a 677 */
  boxPad: { x0: 7, y0: 6, x1: 10, y1: 6 },
  maxSize: 34,
  minSize: 15,
};

/** A barra de tipo de uma metade, na orientação em que ela fica de pé (escala-base). */
export interface FlipBar {
  top: number;
  bottom: number;
}

/**
 * Os dois fios da barra de tipo de uma metade (escala-base), achados perto de onde a moldura os põe
 * e com a altura dela: na moldura branca, um fio do fim da caixa da de baixo, 10 px acima da barra,
 * passava pelo fio de cima (Bushi Tenderfoot, CHK 2). `null` sem eles.
 */
export function flipBar(img: ImageData, G: FlipGeometry, half: 0 | 1): FlipBar | null {
  const [from, to] = G.halves[half].top;
  const bar = typeBarEdges(img, from, to + G.span[1] + 2, G.span);
  return bar && bar.top <= to ? bar : null;
}

/**
 * O fio escuro de dentro da caixa de P/R no fim da barra de tipo (escala-base), ou `null` sem a
 * caixa: a coluna mais escura (pela mediana das linhas do meio da barra) entre `pt.x0` e `pt.x1`,
 * se 60 tons ou mais abaixo do papel da barra (o percentil 75 de um trecho do começo dela). Na
 * barra sem a caixa ali só há papel, a até 35 tons dele.
 */
export function flipPtLine(img: ImageData, G: FlipGeometry, bar: FlipBar): number | null {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const y0 = Math.round((bar.top + G.typeErase.dy0 + 6) * fy);
  const y1 = Math.round((bar.bottom - 6) * fy);
  if (y1 <= y0) return null;
  const column = (x: number) => {
    const v: number[] = [];
    for (let y = y0; y < y1; y++) v.push(lum(img.data, (y * img.width + x) * 4));
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const paper: number[] = [];
  for (let y = y0; y < y1; y += 2)
    for (let x = Math.round(100 * fx); x < Math.round(300 * fx); x += 2) paper.push(lum(img.data, (y * img.width + x) * 4));
  paper.sort((a, b) => a - b);
  const tone = paper[Math.floor(paper.length * 0.75)];
  let best = -1;
  let min = Infinity;
  for (let x = Math.round(G.pt.x0 * fx); x < Math.round(G.pt.x1 * fx); x++) {
    const v = column(x);
    if (v < min) {
      min = v;
      best = x;
    }
  }
  return best >= 0 && min < tone - 60 ? best / fx : null;
}

/**
 * Onde acaba o tipo em inglês (escala-base): a última coluna de `rect` com dois pixels ou mais 60
 * tons abaixo da mediana da linha deles. O apagamento para logo depois, antes da sombra da caixa de
 * P/R, que escurece a barra devagar até o fio dela: apagada, a sombra saía cortada, num degrau.
 */
export function flipTypeEnd(img: ImageData, rect: Rect): number | null {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(rect.x0 * fx);
  const x1 = Math.round(rect.x1 * fx);
  const y0 = Math.round(rect.y0 * fy);
  const y1 = Math.round(rect.y1 * fy);
  if (x1 <= x0 || y1 <= y0) return null;
  const count = new Uint16Array(x1 - x0);
  const row: number[] = [];
  for (let y = y0; y < y1; y++) {
    row.length = 0;
    for (let x = x0; x < x1; x++) row.push(lum(img.data, (y * img.width + x) * 4));
    const med = [...row].sort((a, b) => a - b)[row.length >> 1];
    row.forEach((v, i) => {
      if (med - v > 60) count[i]++;
    });
  }
  for (let i = count.length - 1; i >= 0; i--) if (count[i] >= 2) return (x0 + i) / fx;
  return null;
}

/** O papel da caixa de uma metade, medido na imagem (escala-base, ver `paperBoxes`). */
export function flipBox(img: ImageData, G: FlipGeometry, half: 0 | 1): Rect {
  const h = G.halves[half];
  return paperBoxes(img, [h.box], [h.core], { w: 745, h: 1040 }, G.boxEdge)[0];
}
