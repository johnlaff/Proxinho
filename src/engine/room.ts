/**
 * Moldura das Salas (Cômodos) de Duskmourn (ADR 0033): a carta dividida impressa deitada. O
 * motor gira a imagem 90° no sentido horário e trabalha na carta deitada, de 1040 × 745 na
 * escala-base (a altura e a largura da carta de pé). Cada metade tem a barra do nome no alto, de
 * papel claro e letra escura, com o custo de mana no fim, e uma caixa de papel embaixo. No meio,
 * de uma ponta à outra, a linha de tipo das duas ("Encantamento — Cômodo"), uma barra translúcida
 * com a arte por trás, letra branca e o símbolo da coleção no fim, e a faixa do lembrete das
 * Salas, translúcida também, em itálico branco centrado. As medidas são da escala-base deitada,
 * conferidas nas 51 impressões de borda preta (DSK, DSC, as promos de PDSK e The List).
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const ROOM = {
  /** largura e altura da carta deitada (escala-base) */
  width: BASE_H,
  height: BASE_W,
  /**
   * barras dos nomes (o retângulo do apagamento; a ponta arredondada da esquerda começa em
   * x ≈ 96 e 573): `x` é onde começa a primeira letra e `costRight` onde acaba o custo
   */
  names: [
    { x0: 100, x1: 512, x: 111, costRight: 508 },
    { x0: 578, x1: 990, x: 590, costRight: 984 },
  ],
  /** altura das barras dos nomes: o papel vai de 37 a 89, com o relevo; o meio das letras em 63 */
  nameY: { y0: 38, y1: 89, center: 63 },
  nameSize: 35,
  /** cada símbolo do custo ocupa ~35,3 px (com o vão; a sombra do círculo passa uns 2 px à esquerda); os híbridos, mais */
  costSymbol: 35.3,
  costHybrid: 40,
  /**
   * linha de tipo: entre os fios da barra (401 a 408 em cima, 442 a 448 embaixo); o tipo em
   * inglês acaba antes de x 360 e o símbolo da coleção fica entre 935 e 980
   */
  type: { x0: 100, y0: 408, x1: 760, y1: 442, x: 109, center: 423, size: 25, end: 900 },
  /** faixa do lembrete, entre os fios dela (448 e 511) */
  strip: { x0: 100, y0: 450, x1: 986, y1: 510, textX0: 118, textX1: 968, textY0: 452, textY1: 509 },
  /** o retângulo da rede neural (as duas faixas inteiras) e onde ele se divide em dois quadros */
  lama: { x0: 96, y0: 402, x1: 990, y1: 512, mid: 541 },
  /** o símbolo da coleção, escondido da rede neural */
  symbol: { x0: 925, y0: 404, x1: 990, y1: 442 },
  /** o papel de cada caixa, dentro do relevo (o fio da moldura acaba em 523, o relevo de baixo começa em 704) */
  boxes: [
    { x0: 102, y0: 524, x1: 504, y1: 704 },
    { x0: 578, y0: 524, x1: 980, y1: 704 },
  ],
  /** margem do texto dentro do papel da caixa */
  boxPad: { x0: 9, y0: 5, x1: 9, y1: 5 },
  /** corpo do texto das caixas (o inglês fica entre 24 e 30) */
  maxSize: 30,
  minSize: 15,
  /** corpo do lembrete da faixa (o inglês tem 24) */
  stripMax: 24,
  stripMin: 17,
} as const;

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Percentil `q` (0 a 1) dos tons de um retângulo da carta deitada (escala-base), de 2 em 2 px. */
function percentile(img: ImageData, r: Rect, q: number): number {
  const fx = img.width / ROOM.width;
  const fy = img.height / ROOM.height;
  const v: number[] = [];
  for (let y = Math.round(r.y0 * fy); y < Math.round(r.y1 * fy); y += 2)
    for (let x = Math.round(r.x0 * fx); x < Math.round(r.x1 * fx); x += 2) v.push(lum(img.data, (y * img.width + x) * 4));
  v.sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0;
}

/**
 * Confere na carta deitada a moldura das Salas: as duas barras dos nomes claras, a barra do tipo
 * e a faixa do lembrete escuras (translúcidas, sobre a arte; a mais clara das 51 fica em 91) e as
 * duas caixas de papel, com o relevo mais escuro no lado direito de cada uma (na moldura branca
 * o fio em volta da caixa tem a cor do papel, e o relevo é o que separa). Sem as pistas, a carta
 * sai na original.
 */
export function roomFrame(img: ImageData): boolean {
  if (img.width <= img.height) return false;
  const [a, b] = ROOM.boxes;
  const names = [
    { x0: 130, y0: 42, x1: 480, y1: 84 },
    { x0: 610, y0: 42, x1: 960, y1: 84 },
  ];
  if (names.some((r) => percentile(img, r, 0.8) < 150)) return false;
  if (percentile(img, { x0: 400, y0: 410, x1: 900, y1: 440 }, 0.5) > 115) return false;
  if (percentile(img, { x0: 110, y0: 452, x1: 980, y1: 508 }, 0.5) > 115) return false;
  for (const box of [a, b]) {
    const paper = percentile(img, { x0: box.x0 + 20, y0: 540, x1: box.x1 - 20, y1: 690 }, 0.5);
    const bevel = percentile(img, { x0: box.x1 + 1, y0: 540, x1: box.x1 + 4, y1: 690 }, 0.5);
    if (paper < 150 || bevel > paper - 25) return false;
  }
  return true;
}

/** Onde começa o custo de mana de uma metade, no fim da barra do nome dela (escala-base deitada). */
export function roomCostLeft(manaCost: string | null | undefined, half: 0 | 1): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  const right = ROOM.names[half].costRight;
  return right - symbols.reduce((w, s) => w + (s.includes("/") ? ROOM.costHybrid : ROOM.costSymbol), 0);
}
