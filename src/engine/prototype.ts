/**
 * Moldura das criaturas com Protótipo (The Brothers' War, 2022, e Modern Horizons 3), ADR 0045.
 *
 * A caixa de texto é a da carta comum, partida em duas: no alto, uma faixa da cor do protótipo
 * (com grão, como o papel, e um fio da cor dela em volta) leva só o lembrete, "Prototype (You may
 * cast…)", à esquerda; à direita ficam a aba com o custo do protótipo e, embaixo dela, a caixa de
 * P/R dele. Embaixo de um fio, o papel de sempre leva o resto do texto e a caixa de P/R da carta.
 * As abas ficam como estão (os números e os símbolos são os mesmos em PT); só o lembrete e o resto
 * do texto são trocados, com a mesma letra nas duas partes, como na impressa em PT.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas nas 40 impressões de papel
 * (BRO, as promos de PBRO, The List e MH3; as de arte estendida têm a caixa uns pixels deslocada,
 * medida na imagem). As do MTGO e as do Alchemy não são de papel.
 */
import { BASE_H, BASE_W, countSymbols, type Rect } from "./geometry";

export const PROTOTYPE = {
  /** o fio de cima da faixa é a última linha escura destas (de 649 a 665 nas impressões) */
  top: { y0: 644, y1: 668 },
  /** as colunas medidas: sem a aba do custo nem a caixa de P/R */
  cols: { x0: 90, x1: 520 },
  /** onde o tom da faixa é medido (linhas, a partir do alto da caixa) */
  sample: { y0: 668, y1: 750 },
  /** o fio fica ao menos isso abaixo da faixa; a primeira linha da faixa, a até `near` dela */
  dark: 25,
  near: 18,
  /** altura da faixa (as letras do lembrete nunca passam disso: o pé delas fica a ~92) */
  height: 98,
  /** o fio de baixo: a linha mais escura de 100 a 114 linhas abaixo do alto da faixa, ao menos 20 tons abaixo da faixa e do papel */
  rule: { from: 100, to: 115, contrast: 20 },
  /** o papel de baixo começa de 108 a 118 linhas abaixo do alto da faixa (113 ou 114 em quase todas) */
  paper: { min: 108, max: 118 },
  /**
   * a aba do custo: o lado esquerdo esperado pelo número de símbolos (607 com dois, 574 com três;
   * nas de arte estendida, até 6 px antes), procurado a até 12 px disso. O contorno da aba e a caixa
   * de P/R são ao menos 50 tons mais escuros que a faixa (40 na coluna seguinte)
   */
  tab: { two: 607, symbol: 33, search: 12 },
  edge: { first: 50, next: 40 },
  /** a caixa de P/R da faixa: o lado esquerdo procurado de 560 a 600 (576 a 583 nas impressões) */
  pt: { x0: 560, x1: 600 },
  /** folga entre o apagamento e as abas; entre o texto e as abas */
  gap: 3,
  textGap: 8,
  /** folga do texto da faixa (em cima e embaixo) e do fio até o texto do papel */
  pad: 3,
};

/** A faixa do protótipo, medida na imagem (escala-base). */
export interface PrototypeFrame {
  /** primeira linha da faixa (depois do fio de cima) */
  top: number;
  /** linha logo depois da faixa (o fio de baixo vem de 2 a 16 linhas depois) */
  bottom: number;
  /** primeira linha do papel de baixo */
  paper: number;
  /** lado esquerdo da aba do custo e da caixa de P/R do protótipo */
  tab: number;
  pt: number;
}

const lum = (d: Uint8ClampedArray, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Acha a faixa do protótipo: o fio de cima (a última linha bem mais escura que a faixa logo
 * abaixo da barra de tipo), o fio de baixo e o papel depois dele, e as duas abas da direita. Sem
 * eles nos lugares de sempre, `null`: não é a moldura do Protótipo, e a carta sai na original.
 */
export function prototypeFrame(img: ImageData, cost: string | null | undefined): PrototypeFrame | null {
  const symbols = countSymbols(cost);
  if (symbols < 1) return null;
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const P = PROTOTYPE;
  const rowAt = (y: number) => {
    const yy = Math.round(y * fy);
    const values: number[] = [];
    for (let x = Math.round(P.cols.x0 * fx); x < Math.round(P.cols.x1 * fx); x++) values.push(lum(img.data, (yy * img.width + x) * 4));
    return median(values);
  };
  const rows = new Map<number, number>();
  const row = (y: number) => {
    let v = rows.get(y);
    if (v === undefined) rows.set(y, (v = rowAt(y)));
    return v;
  };
  // o tom da faixa: as linhas de texto têm mais papel que letra, e a mediana fica no papel
  const band = median(Array.from({ length: P.sample.y1 - P.sample.y0 }, (_, i) => row(P.sample.y0 + i)));
  let last = -1;
  for (let y = P.top.y0; y < P.top.y1; y++) if (row(y) < band - P.dark) last = y;
  if (last < 0) return null;
  let top = last + 1;
  while (top < last + 5 && Math.abs(row(top) - band) > P.near) top++;
  for (let i = 0; i < 4; i++) if (Math.abs(row(top + i) - band) > P.near) return null;
  // o fio de baixo e o papel depois dele
  let rule = top + P.rule.from;
  for (let y = rule; y < top + P.rule.to; y++) if (row(y) < row(rule)) rule = y;
  const below = median(Array.from({ length: 16 }, (_, i) => row(rule + 12 + i)));
  if (row(rule) > Math.min(band, below) - P.rule.contrast) return null;
  let paper = rule + 1;
  while (paper < rule + 12 && row(paper) < below - 15) paper++;
  if (paper - top < P.paper.min || paper - top > P.paper.max) return null;
  // as abas: a primeira coluna bem mais escura que a faixa (o contorno), nas linhas de cada uma
  const colAt = (x: number, y0: number, y1: number) => {
    const xx = Math.round(x * fx);
    const values: number[] = [];
    for (let y = Math.round(y0 * fy); y < Math.round(y1 * fy); y++) values.push(lum(img.data, (y * img.width + xx) * 4));
    return median(values);
  };
  const edge = (from: number, to: number, y0: number, y1: number) => {
    for (let x = from; x <= to; x++) if (colAt(x, y0, y1) < band - P.edge.first && colAt(x + 1, y0, y1) < band - P.edge.next) return x;
    return null;
  };
  // (a aba do custo pelo número de símbolos: a haste do "h" de "with", logo antes dela, também é
  // escura nas linhas do alto, na faixa azul do Arcane Proxy de pré-estreia, PBRO 75s)
  const expected = P.tab.two - P.tab.symbol * (symbols - 2);
  const tab = edge(expected - P.tab.search, expected + P.tab.search, top + 4, top + 34);
  const pt = edge(P.pt.x0, P.pt.x1, top + P.height - 40, top + P.height - 10);
  if (tab === null || pt === null) return null;
  return { top, bottom: top + P.height, paper, tab, pt };
}

/** O texto de uma criatura com Protótipo, partido entre a faixa do alto e o papel. */
export interface PrototypeText {
  /** o lembrete do Protótipo ("Protótipo (Você pode conjurar…)") */
  band: string;
  /** o resto, que vai no papel (vazio se não houver) */
  rest: string;
  /** as linhas do resto com palavra de habilidade (ver `buildParagraphs`) */
  italic: number[];
}

/**
 * Parte o texto: a primeira linha é a do Protótipo, que vai na faixa (o pipeline já a pôs no alto,
 * com o lembrete das impressas em PT). Sem ela na frente, `null`: o texto não bate com a moldura.
 */
export function prototypeText(text: string | null | undefined, abilityWords: readonly number[] = []): PrototypeText | null {
  const lines = (text ?? "").split("\n");
  if (!/^Protótipo( \(|$)/.test(lines[0] ?? "")) return null;
  return {
    band: lines[0],
    rest: lines.slice(1).join("\n"),
    italic: abilityWords.filter((i) => i > 0).map((i) => i - 1),
  };
}

/** O que sai da faixa (escala-base): da beira dela até logo antes das abas. */
export function prototypeErase(frame: PrototypeFrame, x0: number): Rect {
  return { x0, y0: frame.top, x1: Math.min(frame.tab, frame.pt) - PROTOTYPE.gap, y1: frame.bottom };
}

/** As duas caixas de texto (escala-base): a faixa, até antes das abas, e o papel. */
export function prototypeBoxes(box: Rect, frame: PrototypeFrame): { band: Rect; paper: Rect } {
  return {
    band: {
      x0: box.x0,
      y0: frame.top + PROTOTYPE.pad,
      x1: Math.min(frame.tab, frame.pt) - PROTOTYPE.textGap,
      y1: frame.bottom - PROTOTYPE.pad,
    },
    paper: { x0: box.x0, y0: frame.paper + PROTOTYPE.pad, x1: box.x1, y1: box.y1 },
  };
}
