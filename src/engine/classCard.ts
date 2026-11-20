/**
 * Moldura de Classe (desde Adventures in the Forgotten Realms, 2021).
 *
 * É a Saga espelhada: a arte à esquerda e a coluna de texto à direita (x ≈ 375 a 683), com a
 * barra de tipo no pé. No alto da coluna, o lembrete ("(Gain the next level as a sorcery…)")
 * numa caixa de altura fixa, acima de um fio fino em y ≈ 206; embaixo, a habilidade do nível
 * 1 e uma barra por nível, cada uma com a habilidade dele abaixo. A barra é uma linha preta na
 * largura toda da coluna (com um chanfro em "v" no meio) e um degradê cinza de uns 48 px,
 * com o custo à esquerda e "Level 2" à direita.
 *
 * O português é mais comprido e cada nível cresce de um jeito: como na carta impressa em PT
 * (Classe: Ladino), as barras mudam de lugar. O motor recorta cada barra da imagem (com o
 * custo, sem o "Level N"), apaga a coluna e cola as barras onde o texto em PT pede.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas nas 70 artes de moldura
 * preta (AFR, CLB, BLB, BLC, SOC, TMT e as promos).
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const CLASS = {
  /** a caixa do lembrete, entre o pé da barra do nome e o fio fino */
  reminder: { y0: 121 },
  /** onde o fio fino abaixo do lembrete é procurado (fica em 204 a 208) */
  rule: { y0: 196, y1: 216 },
  /** pé da coluna, logo acima do fio de cima da barra de tipo */
  bottom: 867,
  /** a barra de nível em volta da linha preta: o brilho acima dela e o fim do degradê abaixo */
  bar: { above: 6, below: 51 },
  /** folga mínima entre o texto e o fio ou a barra (o inglês tem de 25 a 30) */
  minGap: 8,
  /** onde o texto começa e acaba, a partir da coluna e do bisel da direita */
  text: { left: 8, right: 6 },
  /** fio de cima da barra de tipo (como na Saga) */
  type: { y0: 862, y1: 900 },
};

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export interface ClassColumn {
  /** fio escuro entre a arte e a coluna */
  left: number;
  /** fio escuro da moldura à direita */
  right: number;
  /** onde começa o bisel cinza antes do fio da direita (a linha das barras passa por ele) */
  bevel: number;
  /** tom do papel da coluna */
  paper: number;
}

/**
 * A coluna de texto (escala-base): o fio da esquerda é a coluna mais escura (mediana das
 * linhas 150 a 850) entre x 355 e 400; o da direita, entre 678 e 700; o bisel vai do fio da
 * direita para a esquerda enquanto a coluna fica 12 tons ou mais abaixo do papel. `null` quando
 * os fios não são escuros de verdade (não é a moldura de Classe).
 */
export function classColumn(img: ImageData): ClassColumn | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const y0 = Math.round(150 * fy);
  const y1 = Math.round(850 * fy);
  const col = new Float32Array(y1 - y0);
  const median = (x: number) => {
    for (let y = y0; y < y1; y++) col[y - y0] = lum(img.data, (y * img.width + x) * 4);
    return col.slice().sort()[col.length >> 1];
  };
  const darkest = (a: number, b: number) => {
    let best = Infinity;
    let at = -1;
    for (let x = Math.round(a * fx); x <= Math.round(b * fx); x++) {
      const m = median(x);
      if (m < best) {
        best = m;
        at = x;
      }
    }
    return { at, best };
  };
  const l = darkest(355, 400);
  const r = darkest(678, 700);
  if (l.best >= 90 || r.best >= 90) return null;
  const papers: number[] = [];
  for (let x = l.at + Math.round(10 * fx); x < r.at - Math.round(20 * fx); x += 4) papers.push(median(x));
  const paper = papers.sort((a, b) => a - b)[papers.length >> 1];
  let bevel = r.at;
  while (bevel - 1 > l.at && median(bevel - 1) < paper - 12) bevel--;
  return { left: l.at / fx, right: r.at / fx, bevel: bevel / fx, paper };
}

/** A faixa da coluna onde as linhas são medidas (escala da imagem): sem o fio da esquerda e sem o bisel. */
function span(img: ImageData, col: ClassColumn): [number, number] {
  const fx = img.width / BASE_W;
  return [Math.round((col.left + 6) * fx), Math.round((col.bevel - 2) * fx)];
}

/**
 * O fio fino abaixo do lembrete (escala-base): a primeira linha entre 196 e 216 com metade ou
 * mais da coluna abaixo de 200 (o fio é cinza e esmaece nas pontas). `null` sem ele.
 */
export function classRule(img: ImageData, col: ClassColumn): number | null {
  const fy = img.height / BASE_H;
  const [a, b] = span(img, col);
  for (let y = Math.round(CLASS.rule.y0 * fy); y < Math.round(CLASS.rule.y1 * fy); y++) {
    let n = 0;
    for (let x = a; x < b; x++) if (lum(img.data, (y * img.width + x) * 4) < 200) n++;
    if (n >= (b - a) * 0.5) return y / fy;
  }
  return null;
}

/**
 * As linhas pretas das barras de nível (escala-base, a primeira linha escura de cada uma), de
 * cima para baixo: linhas entre 215 e 850 com 85% ou mais da coluna abaixo de 100 (o chanfro
 * do meio fica de fora da linha, uns 7%). Letra nenhuma escurece a largura toda.
 */
export function classBars(img: ImageData, col: ClassColumn): number[] {
  const fy = img.height / BASE_H;
  const [a, b] = span(img, col);
  const out: number[] = [];
  let last = -Infinity;
  for (let y = Math.round(215 * fy); y < Math.round(850 * fy); y++) {
    let n = 0;
    for (let x = a; x < b; x++) if (lum(img.data, (y * img.width + x) * 4) < 100) n++;
    if (n < (b - a) * 0.85) continue;
    if (y - last > 3 * fy) out.push(y / fy);
    last = y;
  }
  return out;
}

/** Linha de nível do texto em PT: "{2}{U}: Nível 2" (o custo fica na barra, como na imagem). */
const LEVEL = /^((?:\{[^}]+\})+): Nível (\d+\+?)$/;

export interface ClassText {
  /** o lembrete do alto (o texto oficial das Classes impressas em PT, que o pipeline põe) */
  reminder: string;
  /** a habilidade de cada nível, a do nível 1 primeiro, com o índice de cada linha em `text_pt` */
  sections: { text: string; lines: number[] }[];
  /** o rótulo de cada barra ("Nível 2"), de cima para baixo */
  levels: string[];
}

/**
 * Separa o texto em PT da Classe em lembrete, habilidades e rótulos das barras. `null` sem o
 * lembrete no alto, sem nível nenhum ou com um nível vazio.
 */
export function classText(text: string | null): ClassText | null {
  const lines = (text ?? "").split("\n").map((x) => x.trim());
  if (!lines[0]?.startsWith("(")) return null;
  const sections: { text: string[]; lines: number[] }[] = [{ text: [], lines: [] }];
  const levels: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const m = LEVEL.exec(lines[i]);
    if (m) {
      levels.push(`Nível ${m[2]}`);
      sections.push({ text: [], lines: [] });
    } else {
      sections[sections.length - 1].text.push(lines[i]);
      sections[sections.length - 1].lines.push(i);
    }
  }
  if (!levels.length || sections.some((s) => !s.text.length)) return null;
  return { reminder: lines[0], sections: sections.map((s) => ({ text: s.text.join("\n"), lines: s.lines })), levels };
}

/** Altura da barra recortada (escala-base): do brilho acima da linha preta ao fim do degradê. */
export const BAR_HEIGHT = CLASS.bar.above + CLASS.bar.below;

/**
 * Onde ficam as barras (escala-base, a linha preta de cada uma) com as habilidades medindo
 * `heights` (a do nível 1 primeiro), entre `top` (o fio do lembrete) e `bottom` (o pé da
 * coluna). A folga livre se divide por igual acima e abaixo de cada habilidade, como na carta
 * impressa: cada texto fica no meio da sua faixa. Devolve também o alto de cada texto. `null`
 * quando a folga fica abaixo de `CLASS.minGap`.
 */
export function classPlan(heights: number[], top: number, bottom: number): { bars: number[]; tops: number[] } | null {
  const n = heights.length;
  if (n < 2) return null;
  const free = bottom - top - heights.reduce((a, b) => a + b, 0) - (n - 1) * BAR_HEIGHT;
  const gap = free / (2 * n);
  if (gap < CLASS.minGap) return null;
  const bars: number[] = [];
  const tops: number[] = [];
  let y = top;
  heights.forEach((h, i) => {
    tops.push(Math.round(y + gap));
    y += h + 2 * gap;
    if (i < n - 1) {
      bars.push(Math.round(y + CLASS.bar.above));
      y += BAR_HEIGHT;
    }
  });
  return { bars, tops };
}

/**
 * Onde fica o "Level N" na barra (escala-base): a ponta direita e o centro da tinta escura na
 * metade direita da barra, entre a linha preta e o fim do degradê. Sem tinta, a posição da
 * carta comum (10 px antes do bisel, 25 px abaixo da linha).
 */
export function classLabel(img: ImageData, col: ClassColumn, line: number): { rect: Rect; right: number; center: number } {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const rect = { x0: (col.left + col.bevel) / 2 + 30, y0: line + 10, x1: col.bevel - 2, y1: line + CLASS.bar.below - 4 };
  let right = -1;
  let rowMin = Infinity;
  let rowMax = -1;
  for (let y = Math.round(rect.y0 * fy); y < Math.round(rect.y1 * fy); y++)
    for (let x = Math.round(rect.x0 * fx); x < Math.round(rect.x1 * fx); x++) {
      if (lum(img.data, (y * img.width + x) * 4) >= 110) continue;
      right = Math.max(right, x);
      rowMin = Math.min(rowMin, y);
      rowMax = Math.max(rowMax, y);
    }
  if (right < 0) return { rect, right: col.bevel - 10, center: line + 25 };
  return { rect, right: (right + 1) / fx, center: (rowMin + rowMax + 1) / 2 / fy };
}

/** Uma faixa de linhas da imagem (escala da imagem), com as colunas `x0` a `x1`. */
export interface Strip {
  x0: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function cutStrip(img: ImageData, y0: number, y1: number, x0: number, x1: number): Strip {
  const width = x1 - x0;
  const height = y1 - y0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * width * 4);
  return { x0, width, height, data };
}

/**
 * Cola a faixa com o alto na linha `y` (escala da imagem). As `feather` linhas de cima e de
 * baixo se misturam com o que já está ali, em rampa: são papel dos dois lados, e a emenda some.
 */
export function pasteStrip(img: ImageData, strip: Strip, y: number, feather = 3): void {
  for (let r = 0; r < strip.height; r++) {
    const yy = y + r;
    if (yy < 0 || yy >= img.height) continue;
    const edge = Math.min(r, strip.height - 1 - r);
    const a = edge >= feather ? 1 : (edge + 1) / (feather + 1);
    for (let x = 0; x < strip.width; x++) {
      const i = (yy * img.width + strip.x0 + x) * 4;
      const j = (r * strip.width + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c] * (1 - a) + strip.data[j + c] * a);
    }
  }
}

/**
 * Repõe o bisel da direita nas linhas `y0` a `y1` (escala da imagem), copiando a linha `ref`:
 * a linha preta da barra passa por ele, e a barra que muda de lugar deixava um traço ali.
 */
export function restoreBevel(img: ImageData, y0: number, y1: number, x0: number, x1: number, ref: number): void {
  for (let y = y0; y < y1; y++) img.data.copyWithin((y * img.width + x0) * 4, (ref * img.width + x0) * 4, (ref * img.width + x1) * 4);
}
