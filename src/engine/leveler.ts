/**
 * Moldura das criaturas com Subir de Nível (Level up: Rise of the Eldrazi, 2010, e as
 * reimpressões das Duel Decks, Commander, Modern Horizons e The List).
 *
 * A caixa de texto é dividida em três faixas fixas, cada uma num tom do papel: no alto, o "Level
 * up" com o lembrete; embaixo, os dois níveis, cada um com o selo em seta ("LEVEL 2-6") à
 * esquerda. Cada faixa tem a sua caixa de P/R à direita. Na impressa em PT as faixas ficam no
 * mesmo lugar, a palavra do selo é "NÍVEL" e os números do selo e das caixas de P/R são os
 * mesmos (Student of Warfare, ROE 47).
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas nas 59 impressões de papel:
 * a moldura de 2003 (ROE, PROE, C13, DDG e The List) e a atual (DDP, CMA, C21, LCC, MH1 e The
 * List).
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export interface LevelerGeometry {
  /** alto do papel da caixa */
  top: number;
  /** pé da última faixa */
  bottom: number;
  /** onde cada faixa de nível começa (a mudança de tom do papel; medida na imagem) */
  rows: [number, number];
  /** onde o texto dos níveis começa, logo depois da ponta do selo */
  levelX: number;
  /** onde a ponta do selo acaba (o apagamento dos níveis começa depois dela) */
  badgeTip: number;
  /** a faixa em que o lado esquerdo da caixa de P/R é procurado */
  pt: { x0: number; x1: number };
  /**
   * a palavra do selo ("LEVEL"): colunas, distância do alto e do pé das letras até o começo de
   * cada faixa (na moldura atual a faixa de baixo é mais alta, e o selo fica no meio dela)
   */
  word: { x0: number; x1: number; dy: [[number, number], [number, number]] };
}

export const LEVELER: { m15: LevelerGeometry; "2003": LevelerGeometry } = {
  m15: {
    top: 656,
    bottom: 956,
    rows: [747, 848],
    levelX: 155,
    badgeTip: 143,
    pt: { x0: 566, x1: 590 },
    word: {
      x0: 58,
      x1: 111,
      dy: [
        [33, 42],
        [38, 47],
      ],
    },
  },
  "2003": {
    top: 653,
    bottom: 931,
    rows: [745, 839],
    levelX: 187,
    badgeTip: 184,
    pt: { x0: 544, x1: 566 },
    word: {
      x0: 84,
      x1: 138,
      dy: [
        [25, 37],
        [24, 36],
      ],
    },
  },
};

/** As faixas medidas de uma carta de níveis (escala-base). */
export interface LevelerFrame {
  geo: LevelerGeometry;
  /** onde começa cada faixa de nível (a mudança de tom do papel) */
  rows: [number, number];
  /** o lado esquerdo da caixa de P/R de cada faixa (a do alto, as dos níveis) */
  pt: [number, number, number];
  /** o alto e o pé das letras da palavra de cada selo ("LEVEL"), medidos na imagem */
  words: [number, number][];
  /** onde acaba o papel da última faixa (o começo do filete claro do pé da caixa) */
  end: number;
}

/** As linhas de uma carta de níveis: o "Subir de nível" e os dois níveis, cada um com o selo e o P/R. */
export interface LevelerText {
  /** a faixa do alto ("Subir de nível {W} (…)") e o que vier antes do primeiro nível */
  main: string;
  levels: { range: string; pt: string; text: string }[];
  /** as linhas com palavra de habilidade, contadas em cada faixa */
  italic: number[][];
}

const lum = (d: Uint8ClampedArray, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

/** Percentil `q` do brilho de uma linha da imagem entre `x0` e `x1` (pixels). */
function rowPercentile(img: ImageData, y: number, x0: number, x1: number, q: number): number {
  const hist = new Uint32Array(256);
  for (let x = x0; x < x1; x++) hist[Math.round(lum(img.data, (y * img.width + x) * 4))]++;
  const want = (x1 - x0) * q;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= want) return v;
  }
  return 255;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** A mudança de tom entre faixas: o papel (percentil 80, sem as letras) acima menos o de baixo. */
const LEVELER_STEP = 6;
/** O contorno da caixa de P/R fica ao menos isso abaixo do papel antes dela (na moldura atual, de 90 a 130 abaixo). */
const LEVELER_PT_CONTRAST = 60;
/** Quanto a mudança de tom pode fugir da medida (nas 59 impressões, até 3 px). */
const LEVELER_SLACK = 5;
/** O filete claro do pé da caixa: ao menos isso acima do papel (nas 59 impressões, de 13 a 76). */
const LEVELER_EDGE = 12;

/**
 * Mede a caixa de uma carta de níveis: a mudança de tom do papel no começo de cada faixa de nível
 * (cada faixa é mais escura que a de cima) e o lado esquerdo das três caixas de P/R. Sem elas no
 * lugar, não é a moldura dos níveis e a carta sai na original.
 */
export function levelerFrame(img: ImageData, frame2003: boolean): LevelerFrame | null {
  const geo = frame2003 ? LEVELER["2003"] : LEVELER.m15;
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const x0 = Math.round(200 * fx);
  const x1 = Math.round(480 * fx);
  const paper = (y: number) => rowPercentile(img, Math.round(y * fy), x0, x1, 0.8);
  // (a mudança medida pelas medianas de 5 linhas de cada lado dá um patamar de linhas em volta
  // dela; a primeira linha da faixa de baixo é o meio do patamar)
  const rows = geo.rows.map((expected) => {
    const steps: [number, number][] = [];
    for (let y = expected - LEVELER_SLACK - 4; y <= expected + LEVELER_SLACK + 4; y++) {
      const above = median([2, 3, 4, 5, 6].map((d) => paper(y - d)));
      const below = median([2, 3, 4, 5, 6].map((d) => paper(y + d)));
      steps.push([y, above - below]);
    }
    const top = Math.max(...steps.map(([, d]) => d));
    if (top < LEVELER_STEP) return null;
    const near = steps.filter(([, d]) => d >= top * 0.9).map(([y]) => y);
    const at = Math.round((near[0] + near[near.length - 1]) / 2);
    return Math.abs(at - expected) <= LEVELER_SLACK ? at : null;
  });
  if (rows.some((r) => r === null)) return null;
  const [r1, r2] = rows as [number, number];
  const bands: [number, number][] = [
    [geo.top, r1],
    [r1, r2],
    [r2, geo.bottom],
  ];
  // a caixa de P/R: a primeira coluna bem mais escura que o papel antes dela (o contorno, cinza
  // na moldura atual e preto na de 2003), no meio da faixa
  const pt = bands.map(([a, b]) => {
    const y0 = Math.round((a + (b - a) * 0.3) * fy);
    const y1 = Math.round((a + (b - a) * 0.7) * fy);
    const column = (x: number) => {
      const col: number[] = [];
      for (let y = y0; y < y1; y++) col.push(lum(img.data, (y * img.width + x) * 4));
      return median(col);
    };
    const start = Math.round(geo.pt.x0 * fx);
    const paperLeft = median(Array.from({ length: 12 }, (_, i) => column(start - Math.round(24 * fx) + i)));
    for (let x = start; x <= Math.round(geo.pt.x1 * fx); x++) if (column(x) < paperLeft - LEVELER_PT_CONTRAST) return x / fx;
    return null;
  });
  if (pt.some((x) => x === null)) return null;
  const words = ([r1, r2] as const).map((r, i) => wordRows(img, geo, r, i));
  // o pé do papel: o filete claro começa até 2 px antes ou depois da medida (931 a 933 na de 2003,
  // 955 a 957 na atual); sem ele, logo depois da medida
  const base = median([7, 8, 9, 10, 11, 12].map((d) => paper(geo.bottom - d)));
  let end = geo.bottom + 1;
  for (let y = geo.bottom - 4; y <= geo.bottom + 4; y++)
    if (paper(y) - base >= LEVELER_EDGE) {
      end = y;
      break;
    }
  return { geo, rows: [r1, r2], pt: pt as [number, number, number], words, end };
}

/**
 * O alto e o pé das letras da palavra do selo, medidos na imagem: a primeira sequência de linhas
 * com tinta (bem mais escura que o selo) perto da medida. A palavra muda 2 ou 3 px de lugar entre
 * coleções, e com a medida fixa o alto ou o pé do "LEVEL" ficava como um traço em cima ou embaixo
 * do "NÍVEL" (C13, DDG). Sem a sequência, vale a medida.
 */
function wordRows(img: ImageData, geo: LevelerGeometry, row: number, i: number): [number, number] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const [dy0, dy1] = geo.word.dy[i];
  const x0 = Math.round((geo.word.x0 + 3) * fx);
  const x1 = Math.round((geo.word.x1 - 3) * fx);
  const ink = (y: number) => {
    const yy = Math.round(y * fy);
    const paper = rowPercentile(img, yy, x0, x1, 0.75);
    let n = 0;
    for (let x = x0; x < x1; x++) if (lum(img.data, (yy * img.width + x) * 4) < paper - 60) n++;
    return n >= 3;
  };
  const cap = dy1 - dy0;
  let start: number | null = null;
  for (let y = row + dy0 - 6; y <= row + dy1 + 4; y++) {
    if (ink(y)) start ??= y;
    else if (start !== null) {
      if (y - start >= cap * 0.6) return [start, y - 1];
      start = null;
    }
  }
  return [row + dy0, row + dy1];
}

/**
 * Parte o texto em PT: a faixa do alto e os dois níveis ("NÍVEL 2-6", o P/R e as habilidades do
 * nível). Fora disso (um nível só, P/R que não é número), `null`: o texto não bate com a moldura.
 */
export function levelerText(text: string | null | undefined, abilityWords: readonly number[] = []): LevelerText | null {
  const lines = (text ?? "").split("\n");
  const marks = lines.flatMap((l, i) => (/^NÍVEL \d+(?:-\d+|\+)$/.test(l) ? [i] : []));
  if (marks.length !== 2 || marks[0] === 0 || marks[1] - marks[0] < 2) return null;
  if (!marks.every((i) => /^\d+\/\d+$/.test(lines[i + 1] ?? ""))) return null;
  const parts = [
    [0, marks[0]],
    [marks[0] + 2, marks[1]],
    [marks[1] + 2, lines.length],
  ];
  return {
    main: lines.slice(0, marks[0]).join("\n"),
    levels: marks.map((i, n) => ({
      range: lines[i].slice("NÍVEL ".length),
      pt: lines[i + 1],
      text: lines.slice(parts[n + 1][0], parts[n + 1][1]).join("\n"),
    })),
    italic: parts.map(([a, b]) => abilityWords.filter((i) => i >= a && i < b).map((i) => i - a)),
  };
}

/**
 * Onde o texto de cada faixa é apagado (escala-base): do selo (ou da beira) até a caixa de P/R, de
 * uma mudança de tom à outra. As letras em inglês chegam a 2 px dela (o alto do "F" de "Flying",
 * Kargan Dragonlord, ROE 152) e, na última faixa, até a última linha do papel (o "g" de "get",
 * Coralhelm Commander, ROE 57). A última vai até o pé medido do papel e para ali: passando dele, o
 * filete claro do pé entrava na máscara pela cor, colado às letras, e saía pintado da cor do papel
 * (com 2 px a menos entre o selo e a caixa de P/R, um degrau nas duas pontas).
 */
export function levelerErase(f: LevelerFrame, boxX0: number): Rect[] {
  const { geo, rows, pt } = f;
  return [
    { x0: boxX0, y0: geo.top + 2, x1: pt[0] - 3, y1: rows[0] - 1 },
    { x0: geo.badgeTip + 1, y0: rows[0] + 1, x1: pt[1] - 3, y1: rows[1] - 1 },
    { x0: geo.badgeTip + 1, y0: rows[1] + 1, x1: pt[2] - 3, y1: f.end },
  ];
}

/**
 * Onde o texto de cada faixa é escrito (escala-base), centralizado na altura dela. O selo da
 * coleção sobe para dentro da última faixa na moldura atual (`stampTop`, o alto dele): ali o texto
 * acaba antes dele, como no inglês (Coralhelm Commander, LCC 148).
 */
export function levelerBoxes(f: LevelerFrame, textX0: number, stampTop: number | null = null): Rect[] {
  const { geo, rows, pt } = f;
  const gap = 10;
  const last = Math.min(geo.bottom - 3, stampTop === null ? Infinity : stampTop - LEVELER_STAMP_CLEAR);
  return [
    { x0: textX0, y0: geo.top + 3, x1: pt[0] - gap, y1: rows[0] - 3 },
    { x0: geo.levelX, y0: rows[0] + 3, x1: pt[1] - gap, y1: rows[1] - 3 },
    { x0: geo.levelX, y0: rows[1] + 3, x1: pt[2] - gap, y1: last },
  ];
}

/** Folga do texto até o alto do selo da coleção. */
const LEVELER_STAMP_CLEAR = 4;

/**
 * A palavra de cada selo ("LEVEL"), para apagar e escrever "NÍVEL" no lugar (escala-base). Sai a
 * área inteira das letras, com o contorno claro delas (`word`), preenchida pelo selo em volta
 * (`rect`); o número logo abaixo (`number`) fica fora das fontes do preenchimento. Só as letras
 * escuras e o contorno, cada um pela cor, deixavam traços das hastes do "LEVEL" entre as letras
 * do "NÍVEL" (Coralhelm Commander, ROE 57; Beastbreaker of Bala Ged, ROE 178).
 */
export function levelerWords(f: LevelerFrame): { rect: Rect; word: Rect; number: Rect }[] {
  const { word } = f.geo;
  return f.words.map(([top, bottom]) => ({
    rect: { x0: word.x0 - 3, y0: top - 5, x1: word.x1 + 3, y1: bottom + 4 },
    word: { x0: word.x0, y0: top - 3, x1: word.x1, y1: bottom + 3 },
    number: { x0: word.x0 - 3, y0: bottom + 4, x1: word.x1 + 3, y1: bottom + 30 },
  }));
}

/**
 * Onde a palavra de cada selo é escrita (escala-base): o meio dela, a linha de base e a altura das
 * maiúsculas do "LEVEL" impresso, que o "NÍVEL" segue.
 */
export function levelerWordSpots(f: LevelerFrame): { x: number; base: number; cap: number; width: number }[] {
  const { word } = f.geo;
  return f.words.map(([top, bottom]) => ({
    x: (word.x0 + word.x1) / 2,
    base: bottom + 1,
    cap: bottom + 1 - top,
    width: word.x1 - word.x0 - 6,
  }));
}
