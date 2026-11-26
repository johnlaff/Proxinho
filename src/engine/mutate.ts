/**
 * Moldura das criaturas com Mutação (Ikoria, 2020, e as reimpressões de Commander).
 *
 * A caixa de texto é a da carta comum, partida em duas: no alto, uma faixa translúcida, com a
 * arte aparecendo por trás, leva a linha da Mutação com o lembrete; embaixo de um fio escuro
 * (com uma sombra de uns 8 px em cima dele), o papel de sempre leva o resto do texto. A faixa
 * tem a mesma altura em todas as cartas, em inglês e em PT: na impressa em PT, com o lembrete
 * mais comprido, a letra da carta inteira é menor, a mesma nas duas partes.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas nas 59 impressões de papel
 * (IKO, PIKO, C20, DMC, MOC, PL22 e The List). As de vitrine, as sem borda e as do MTGO (arte
 * atrás da caixa inteira) ficam de fora no pipeline.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const MUTATE = {
  /** onde o fio é procurado (o mais escuro destas linhas; nas 59 impressões, de 783 a 787) */
  search: { y0: 776, y1: 796 },
  /** as colunas medidas: sem o símbolo da coleção nem a caixa de P/R */
  cols: { x0: 90, x1: 580 },
  /** o fio fica ao menos isso abaixo do papel logo depois dele e da faixa logo antes da sombra */
  contrast: { paper: 35, band: 20 },
  /** o papel abaixo do fio (mediana das linhas): de 220 a 250 nas impressões */
  paper: 190,
  /** a sombra acima do fio (a faixa de antes dela é a medida contra o fio) */
  shadow: 8,
  /** folga do texto da faixa até o fio (o pé das letras desce até a sombra, como na impressa em PT) e do fio até o texto do papel */
  pad: 4,
};

/** Linhas do fio escuro entre a faixa da Mutação e o papel (escala-base). */
export interface MutateRule {
  /** primeira linha escura (a sombra acima dela fica na faixa) */
  top: number;
  /** primeira linha de papel depois do fio */
  bottom: number;
}

const lum = (d: Uint8ClampedArray, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

/** Mediana do brilho de uma linha da imagem entre `x0` e `x1` (pixels). */
function rowMedian(img: ImageData, y: number, x0: number, x1: number): number {
  const hist = new Uint32Array(256);
  for (let x = x0; x < x1; x++) hist[Math.round(lum(img.data, (y * img.width + x) * 4))]++;
  let acc = 0;
  const half = (x1 - x0) / 2;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= half) return v;
  }
  return 255;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * Acha o fio da faixa da Mutação: a linha mais escura entre `MUTATE.search.y0` e `y1`, bem mais
 * escura que o papel logo abaixo e que a faixa logo acima da sombra, com o papel claro depois
 * dela. Sem ele, não é a moldura da Mutação (as do MTGO têm a arte atrás da caixa inteira) e a
 * carta sai na original.
 */
export function mutateRule(img: ImageData): MutateRule | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const x0 = Math.round(MUTATE.cols.x0 * fx);
  const x1 = Math.round(MUTATE.cols.x1 * fx);
  const med = (y: number) => rowMedian(img, Math.round(y * fy), x0, x1);
  let best = -1;
  let darkest = 256;
  for (let y = MUTATE.search.y0; y <= MUTATE.search.y1; y++) {
    const v = med(y);
    if (v < darkest) [best, darkest] = [y, v];
  }
  if (best < 0) return null;
  const paper = median(Array.from({ length: 16 }, (_, i) => med(best + 8 + i)));
  const band = median(Array.from({ length: 8 }, (_, i) => med(best - MUTATE.shadow - 10 + i)));
  if (paper < MUTATE.paper || darkest > paper - MUTATE.contrast.paper || darkest > band - MUTATE.contrast.band) return null;
  // o fio vai, para cima, até onde a sombra deixa de ser bem mais escura que a faixa, e, para
  // baixo, até onde as linhas voltam para perto do papel
  let top = best;
  while (top > best - 4 && med(top - 1) < band - MUTATE.contrast.band) top--;
  let bottom = best + 1;
  while (bottom < best + 6 && med(bottom) < paper - MUTATE.contrast.paper) bottom++;
  return { top, bottom };
}

/** O texto de uma criatura com Mutação, partido entre a faixa do alto e o papel. */
export interface MutateText {
  /** a linha da Mutação, com o lembrete */
  band: string;
  /** o resto, que vai no papel (vazio se não houver) */
  rest: string;
  /** as linhas do resto com palavra de habilidade (ver `buildParagraphs`) */
  italic: number[];
}

/**
 * Parte o texto: a primeira linha é a da Mutação ("Mutação {1}{G}{G} (Se você conjurar…)"), que
 * vai na faixa. Sem ela na frente, `null`: o texto não bate com a moldura.
 */
export function mutateText(text: string | null | undefined, abilityWords: readonly number[] = []): MutateText | null {
  const lines = (text ?? "").split("\n");
  if (!/^Mutação \{/.test(lines[0] ?? "")) return null;
  return {
    band: lines[0],
    rest: lines.slice(1).join("\n"),
    italic: abilityWords.filter((i) => i > 0).map((i) => i - 1),
  };
}

/** As duas caixas de texto (escala-base): a faixa, entre o alto da caixa e a sombra do fio, e o papel. */
export function mutateBoxes(box: Rect, rule: MutateRule): { band: Rect; paper: Rect } {
  return {
    band: { x0: box.x0, y0: box.y0, x1: box.x1, y1: rule.top - MUTATE.pad },
    paper: { x0: box.x0, y0: rule.bottom + MUTATE.pad, x1: box.x1, y1: box.y1 },
  };
}
