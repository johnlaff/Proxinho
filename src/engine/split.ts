/**
 * Moldura das cartas divididas de 2015 (ADR 0034): as de Guilds of Ravnica e Ravnica
 * Allegiance, de Murders at Karlov Manor e as reimpressões na moldura atual (Dominaria
 * Remastered, Ravnica Remastered, Time Spiral Remastered, Modern Horizons 2, Clue Edition e os
 * decks de Commander). A carta é impressa deitada, como as Salas (room.ts): o motor gira a
 * imagem 90° no sentido horário e trabalha na carta deitada, de 1040 × 745 na escala-base. Cada
 * metade é uma carta pequena da moldura M15: a barra do nome no alto, com o custo no fim, a arte,
 * a barra de tipo com o símbolo da coleção no fim e a caixa de texto (com a marca-d'água da
 * guilda nas de Ravnica). A metade da direita repete a da esquerda 480 px adiante. As medidas são
 * da escala-base deitada, conferidas nas impressões de borda preta.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const SPLIT = {
  /** largura e altura da carta deitada (escala-base) */
  width: BASE_H,
  height: BASE_W,
  /**
   * barras dos nomes (o retângulo do apagamento; a ponta arredondada da esquerda começa em
   * x ≈ 90 e 570): `x` é onde começa a primeira letra e `costRight` onde acaba o custo
   */
  names: [
    { x0: 96, x1: 512, x: 107, costRight: 505 },
    { x0: 576, x1: 992, x: 587, costRight: 981 },
  ],
  /** o papel da barra do nome vai de 52 a 105 */
  nameY: { y0: 53, y1: 104, center: 79 },
  nameSize: 35,
  /** cada símbolo do custo ocupa ~36,4 px (com o vão); os híbridos, mais (o círculo tem 41) */
  costSymbol: 36.4,
  costHybrid: 44,
  /**
   * barras de tipo, até antes do símbolo da coleção (o mais largo começa em x ≈ 455 na metade
   * da esquerda e 934 na da direita; o tipo em inglês acaba antes de 200 e de 680)
   */
  types: [
    { x0: 96, x1: 445, x: 107 },
    { x0: 576, x1: 925, x: 587 },
  ],
  /** o papel da barra de tipo vai de 405 a 437 */
  typeY: { y0: 406, y1: 437, center: 421 },
  typeSize: 26,
  /**
   * o papel de cada caixa, medido na imagem (`splitBoxes`) dentro destes limites: o lado de
   * dentro muda uns 9 px entre coleções (de 93 a 102 na da esquerda) e o pé, de 709 a 715
   */
  boxes: [
    { x0: 93, y0: 449, x1: 509, y1: 716 },
    { x0: 570, y0: 449, x1: 988, y1: 716 },
  ],
  /** a parte da caixa que fica dentro dela em qualquer coleção */
  boxCore: [
    { x0: 104, y0: 456, x1: 503, y1: 707 },
    { x0: 584, y0: 456, x1: 981, y1: 707 },
  ],
  /** margem do texto dentro do papel da caixa (o inglês começa uns 12 px depois do lado) */
  boxPad: { x0: 10, y0: 6, x1: 10, y1: 6 },
  /** corpo do texto das caixas (o inglês chega a 34, como na M15) */
  maxSize: 34,
  minSize: 15,
} as const;

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Percentil `q` (0 a 1) dos tons de um retângulo da carta deitada (escala-base), de 2 em 2 px. */
function percentile(img: ImageData, r: Rect, q: number): number {
  const fx = img.width / SPLIT.width;
  const fy = img.height / SPLIT.height;
  const v: number[] = [];
  for (let y = Math.round(r.y0 * fy); y < Math.round(r.y1 * fy); y += 2)
    for (let x = Math.round(r.x0 * fx); x < Math.round(r.x1 * fx); x += 2) v.push(lum(img.data, (y * img.width + x) * 4));
  v.sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0;
}

/**
 * Confere na carta deitada a moldura das divididas de 2015: as duas barras dos nomes, as duas
 * barras de tipo e as duas caixas claras, e a borda preta entre as metades. As Salas (room.ts)
 * têm a linha de tipo e a faixa do lembrete escuras no lugar das barras de tipo. Sem as pistas, a
 * carta sai na original.
 */
export function splitFrame(img: ImageData): boolean {
  if (img.width <= img.height) return false;
  for (const dx of [0, 480]) {
    if (percentile(img, { x0: 130 + dx, y0: 60, x1: 420 + dx, y1: 98 }, 0.8) < 150) return false;
    if (percentile(img, { x0: 220 + dx, y0: 411, x1: 420 + dx, y1: 432 }, 0.5) < 150) return false;
    if (percentile(img, { x0: 120 + dx, y0: 470, x1: 480 + dx, y1: 700 }, 0.5) < 150) return false;
  }
  // a borda preta entre as metades, da barra do nome ao pé das caixas
  return percentile(img, { x0: 527, y0: 60, x1: 549, y1: 700 }, 0.5) < 80;
}

/** Onde começa o custo de mana de uma metade, no fim da barra do nome dela (escala-base deitada). */
export function splitCostLeft(manaCost: string | null | undefined, half: 0 | 1): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  const right = SPLIT.names[half].costRight;
  return right - symbols.reduce((w, s) => w + (s.includes("/") ? SPLIT.costHybrid : SPLIT.costSymbol), 0);
}

/**
 * O papel de cada caixa, medido na imagem (escala-base deitada): de cada lado, onde acaba o
 * trecho claro que passa pelo meio da caixa (o percentil 80 das colunas, ou das linhas, na faixa
 * do meio), dentro dos limites de `SPLIT.boxes` e nunca menor que `SPLIT.boxCore`. Na moldura
 * branca o fio em volta da caixa tem a cor do papel e a medida fica no limite de fora menos 3 px.
 */
export function splitBoxes(img: ImageData): Rect[] {
  const fx = img.width / SPLIT.width;
  const fy = img.height / SPLIT.height;
  return SPLIT.boxes.map((lim, i) => {
    const core = SPLIT.boxCore[i];
    const light = (x0: number, y0: number, x1: number, y1: number) => percentile(img, { x0, y0, x1, y1 }, 0.8) >= 145;
    // de dentro para fora, até a primeira coluna (ou linha) escura
    const walk = (from: number, to: number, test: (v: number) => boolean) => {
      const dir = to > from ? 1 : -1;
      let v = from;
      while (v !== to && test(v + dir)) v += dir;
      return v;
    };
    const midY0 = (core.y0 + core.y1) / 2 - 60;
    const midY1 = (core.y0 + core.y1) / 2 + 60;
    const midX0 = (core.x0 + core.x1) / 2 - 120;
    const midX1 = (core.x0 + core.x1) / 2 + 120;
    const col = (x: number) => light(x, midY0, x + 1 / fx, midY1);
    const row = (y: number) => light(midX0, y, midX1, y + 1 / fy);
    const inset = 3;
    return {
      x0: Math.min(core.x0, walk(core.x0, lim.x0, col) + inset),
      y0: Math.min(core.y0, walk(core.y0, lim.y0, row) + inset),
      x1: Math.max(core.x1, walk(core.x1, lim.x1, col) - inset),
      y1: Math.max(core.y1, walk(core.y1, lim.y1, row) - inset),
    };
  });
}
