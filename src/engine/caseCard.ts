/**
 * Moldura de Caso (Murders at Karlov Manor, 2024), ADR 0046.
 *
 * É a coluna da Classe sem as barras: a arte à esquerda e a coluna de texto à direita (do fio
 * escuro em x ≈ 371 ao de x ≈ 687, de y ≈ 122 a 866), com a barra de tipo no pé. A coluna tem
 * três partes, separadas por um fio cinza de 2 px (~110 no meio, esmaecendo até o papel de
 * x ≈ 400 a 660): a habilidade do Caso, "To solve — …" com o lembrete e "Solved — …". O inglês
 * deixa a mesma folga em volta de cada parte.
 *
 * O português é mais comprido e cada parte cresce de um jeito: como nas Classes, os fios mudam
 * de lugar. O motor recorta um fio da imagem, apaga a coluna inteira (as letras e os fios) e
 * cola o fio onde o texto em PT pede, com a folga dividida por igual.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas nas 24 impressões de papel
 * com texto (MKM, MKC e as promos de PMKM; a Case of the Lost Witness, MBC 62, não tem texto em PT).
 */
import { BASE_H, BASE_W } from "./geometry";

export const CASE = {
  /** primeira e última linha do papel da coluna (a sombra do fio de cima acaba em 121; o filete claro do pé começa em 866) */
  top: 123,
  bottom: 865,
  /**
   * o fio entre as partes: uma linha com `share` ou mais das colunas `x0` a `x1` (o meio dele,
   * longe das pontas que esmaecem) `dark` tons abaixo do papel. Nenhuma linha de letras escurece
   * tanto da largura.
   */
  rule: { x0: 470, x1: 590, dark: 40, share: 0.85 },
  /** o fio recortado: `above` linhas acima da primeira linha escura e `below` abaixo (nas promos reamostradas ele ocupa 3 ou 4) */
  strip: { above: 2, below: 6 },
  /** o que sai como fio no apagamento, em volta da primeira linha escura */
  force: { above: 1, below: 4 },
  /** folga mínima entre o texto e o fio, o alto ou o pé da coluna (o inglês tem de 16 a 22) */
  minGap: 10,
  /** onde o texto começa e acaba, a partir do fio da esquerda e do bisel da direita */
  text: { left: 9, right: 6 },
};

/** Número de partes do Caso: a habilidade, "Para Solucionar" e "Solucionado". */
export const CASE_PARTS = 3;

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Os fios entre as partes (escala-base, a primeira linha escura de cada um), de cima para baixo:
 * linhas da coluna em que o meio do fio fica bem abaixo do papel. Linhas escuras seguidas (até 3
 * px de distância) são o mesmo fio.
 */
export function caseRules(img: ImageData, paper: number): number[] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const R = CASE.rule;
  const a = Math.round(R.x0 * fx);
  const b = Math.round(R.x1 * fx);
  const out: number[] = [];
  let last = -Infinity;
  for (let y = Math.round((CASE.top + 10) * fy); y < Math.round((CASE.bottom - 10) * fy); y++) {
    let n = 0;
    for (let x = a; x < b; x++) if (lum(img.data, (y * img.width + x) * 4) < paper - R.dark) n++;
    if (n < (b - a) * R.share) continue;
    if (y - last > 3 * fy) out.push(y / fy);
    last = y;
  }
  return out;
}

/** O texto em PT do Caso, partido nas três partes da coluna. */
export interface CaseText {
  /** cada parte, com o índice de cada linha em `text_pt` (para as palavras de habilidade) */
  parts: { text: string; lines: number[] }[];
}

/**
 * Parte o texto em PT: a habilidade do Caso (as linhas antes de "Para Solucionar —"), a linha de
 * "Para Solucionar —" (com o lembrete) e as de "Solucionado —" em diante. `null` sem as duas, fora
 * de ordem ou com uma parte vazia: o texto não bate com a moldura.
 */
export function caseText(text: string | null | undefined): CaseText | null {
  const lines = (text ?? "").split("\n");
  const solve = lines.findIndex((l) => /^Para [Ss]olucionar —/.test(l));
  const solved = lines.findIndex((l) => /^Solucionado —/.test(l));
  if (solve < 1 || solved !== solve + 1 || solved >= lines.length) return null;
  const idx = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
  const parts = [idx(0, solve), [solve], idx(solved, lines.length)].map((ls) => ({ text: ls.map((i) => lines[i]).join("\n"), lines: ls }));
  if (parts.some((p) => !p.text.trim())) return null;
  return { parts };
}

/** Altura do fio recortado (escala-base). */
export const RULE_HEIGHT = CASE.strip.above + CASE.strip.below;

/**
 * Onde ficam os fios (escala-base, a primeira linha escura de cada um) com as partes medindo
 * `heights`, entre `top` e `bottom`: a folga livre se divide por igual acima e abaixo de cada
 * parte, como no inglês. Devolve também o alto de cada texto. `null` quando a folga fica abaixo
 * de `CASE.minGap`.
 */
export function casePlan(heights: number[], top = CASE.top, bottom = CASE.bottom): { rules: number[]; tops: number[] } | null {
  const n = heights.length;
  if (n < 2) return null;
  const free = bottom - top - heights.reduce((a, b) => a + b, 0) - (n - 1) * RULE_HEIGHT;
  const gap = free / (2 * n);
  if (gap < CASE.minGap) return null;
  const rules: number[] = [];
  const tops: number[] = [];
  let y = top;
  heights.forEach((h, i) => {
    tops.push(Math.round(y + gap));
    y += h + 2 * gap;
    if (i < n - 1) {
      rules.push(Math.round(y + CASE.strip.above));
      y += RULE_HEIGHT;
    }
  });
  return { rules, tops };
}
