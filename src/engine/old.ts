/**
 * Moldura antiga (ADR 0031): a das cartas de Mirage (1996) a Scourge (2003), das edições básicas
 * de 5ª a 7ª, de Portal e Starter, e das reimpressões "retrô" (Time Spiral Remastered, Modern
 * Horizons 2 e 3, Dominaria Remastered, The Brothers' War...). O Scryfall a chama de `1997`.
 *
 * Não há barra lisa: o nome e o tipo são letras brancas com sombra preta, direto sobre a moldura
 * texturizada (mármore, pedra, folhagem), e a caixa de texto é um painel com bisel, de papel com
 * textura na cor da carta. Medidas em 78 impressões de 40 coleções (escala de 745 × 1040):
 *
 * - nome: primeira letra em x ≈ 80, linha de base em ≈ 81 (83 nas retrô de 2021 em diante), na
 *   Goudy Medieval de ≈ 42,5 px (a largura de "Catastrophe" e "Quirion Elves" na MagicMedieval);
 * - custo: círculos de ≈ 37 px, um a cada 40, o último acabando em x ≈ 687;
 * - tipo: primeira letra em x ≈ 80, linha de base em ≈ 608 (606 nas retrô), numa serifada como a
 *   MPlantin de ≈ 32,5 px (as maiúsculas de 22 px pedem 31,7; a largura das palavras, 33);
 * - símbolo da coleção: na ponta direita da linha de tipo, começando entre x ≈ 590 e 650;
 * - caixa: de x 74–77 a 666–670 e de y 618–623 a 921–927 por fora (930 nas retrô), com bisel de
 *   7 a 9 px; o texto em inglês vai de x 93 a 649 e de y 635 a 911;
 * - sombra das letras: 2 px para a direita e 2 para baixo, preta, por cima da moldura a ~60%.
 */
import { BASE_W, type Rect } from "./geometry";

export const OLD = {
  /** onde se procuram as letras do nome (até o custo) e do tipo (até o símbolo) */
  name: { x0: 74, y0: 46, y1: 101, x: 80, baseline: 81, size: 42.5 },
  type: { x0: 74, y0: 574, x1: 700, y1: 621, x: 80, baseline: 608, size: 32.5 },
  /** custo de mana: o último círculo acaba em x ≈ 687, um a cada 40 px */
  cost: { right: 690, pitch: 40 },
  /** a caixa por fora (o apagamento é recolhido até o bisel de dentro, ver insideBoxSides) */
  box: { x0: 78, y0: 622, x1: 666, y1: 922 },
  /** folga do texto em PT até o bisel de dentro da caixa: esquerda, cima, direita, baixo */
  boxPad: { x0: 9, y0: 5, x1: 9, y1: 3 },
  /** o símbolo da coleção nunca começa antes disso; sem símbolo achado, o tipo vai até `typeEnd` */
  symbolMin: 575,
  typeEnd: 640,
  shadow: 2,
  ink: "rgb(242, 240, 234)",
  shadowInk: "rgba(0, 0, 0, 0.7)",
};

/** Onde começa o custo de mana no alto: cada símbolo ocupa 40 px, o último acabando em 690. */
export function oldCostLeft(manaCost: string | null | undefined): number {
  const n = manaCost?.match(/\{[^}]+\}/g)?.length ?? 0;
  return n ? OLD.cost.right - OLD.cost.pitch * n : 700;
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** As letras brancas com sombra de uma linha da moldura antiga, medidas na imagem. */
export interface OldLetters {
  /** letras e sombra, com 2 px de folga, na grade de `rect` */
  mask: Uint8Array;
  rect: Rect;
  /** trechos de colunas com letra (o vão entre palavras não separa), em pixels da imagem */
  blocks: { x0: number; x1: number }[];
  /** última linha com um quarto das letras da linha mais cheia (a linha de base), ou `null` */
  baseline: number | null;
}

/**
 * Acha as letras brancas com sombra preta numa linha da moldura antiga. O tom da moldura é a
 * mediana de cada fatia de 24 px (as letras ocupam menos de um terço dela); letra é o que fica
 * bem mais claro que ela e quase sem cor, e sombra é o que fica bem mais escuro logo abaixo e à
 * direita de uma letra (a textura escura da moldura, longe das letras, fica).
 */
export function oldLetters(img: ImageData, rect: Rect): OldLetters {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const unit = img.width / BASE_W;
  const d = img.data;
  const L = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
      L[y * w + x] = lum(d, i);
      sat[y * w + x] = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    }
  // tom da moldura: mediana de cada fatia, interpolada entre os centros delas
  const step = Math.max(8, Math.round(24 * unit));
  const centers: number[] = [];
  const tones: number[] = [];
  for (let x0 = 0; x0 < w; x0 += step) {
    const x1 = Math.min(w, x0 + step);
    const vals: number[] = [];
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) vals.push(L[y * w + x]);
    centers.push((x0 + x1 - 1) / 2);
    tones.push(medianOf(vals));
  }
  const bg = new Float32Array(w);
  for (let x = 0, j = 0; x < w; x++) {
    while (j < centers.length - 2 && x > centers[j + 1]) j++;
    if (centers.length === 1 || x <= centers[0]) bg[x] = tones[0];
    else if (x >= centers[centers.length - 1]) bg[x] = tones[tones.length - 1];
    else {
      const t = (x - centers[j]) / (centers[j + 1] - centers[j]);
      bg[x] = tones[j] * (1 - t) + tones[j + 1] * t;
    }
  }
  // letra: bem mais clara que a moldura (até 45 tons; nas molduras claras, como a branca, o
  // que der até o branco) e quase sem cor
  const core = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const lift = Math.max(22, Math.min(45, (255 - bg[x]) * 0.55));
      if (L[k] >= bg[x] + lift && L[k] >= 150 && sat[k] <= 70) core[k] = 1;
    }
  // Traço claro comprido na horizontal é o bisel da moldura (o filete claro do alto da moldura,
  // o da arte e o da caixa, logo acima e abaixo das letras), não letra: a perna do "p" encosta
  // no bisel da arte, e a rede neural refazia o bisel em manchas (Standardize, ONS 116)
  const maxRun = Math.round(45 * unit);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w;) {
      if (!core[y * w + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && core[y * w + e]) e++;
      if (e - x > maxRun) core.fill(0, y * w + x, y * w + e);
      x = e;
    }
  // e só ficam as manchas que passam pela faixa das letras. A faixa é medida só com as manchas
  // altas (6 px ou mais): os pedaços do bisel partido pela textura são baixos e, somados, enchiam
  // a linha dele mais que as letras, e a faixa descia até o bisel (Standardize, ONS 116). Ela é o
  // trecho de linhas em volta da mais cheia com um quarto ou mais dela (o corpo das minúsculas)
  type Comp = { pix: number[]; x0: number; x1: number; y0: number; y1: number };
  const comps: Comp[] = [];
  const seen = new Uint8Array(w * h);
  const tall = Math.round(6 * unit);
  const count = new Uint16Array(h);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!core[s0] || seen[s0]) continue;
    const c: Comp = { pix: [s0], x0: w, x1: -1, y0: h, y1: -1 };
    seen[s0] = 1;
    for (let j = 0; j < c.pix.length; j++) {
      const q = c.pix[j];
      const x = q % w;
      const y = (q - x) / w;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const r = yy * w + xx;
          if (core[r] && !seen[r]) {
            seen[r] = 1;
            c.pix.push(r);
          }
        }
    }
    comps.push(c);
    if (c.y1 - c.y0 + 1 >= tall) for (const q of c.pix) count[Math.floor(q / w)]++;
  }
  let peak = 0;
  for (let y = 1; y < h; y++) if (count[y] > count[peak]) peak = y;
  let bandTop = peak;
  let bandBottom = peak;
  while (bandTop > 0 && count[bandTop - 1] >= count[peak] * 0.25) bandTop--;
  while (bandBottom < h - 1 && count[bandBottom + 1] >= count[peak] * 0.25) bandBottom++;
  const inBand = (c: Comp) => count[peak] > 0 && c.y0 <= bandBottom && c.y1 >= bandTop;
  // O pingo do "i" e a ponta de cima de uma haste que a textura separou da letra ficam fora da
  // faixa, mas são letra: sem apagar, sobravam como um pingo ao lado do português (o pingo do
  // "Suntail", JUD 28; a ponta do "l" de "Elemental", SCG 7). Fica a mancha pequena, dentro da
  // altura das letras, a até 6 px de uma letra e sobre ela; o bisel fica abaixo do pé e acima do
  // alto das letras
  const letterComps = comps.filter((c) => inBand(c) && c.y1 - c.y0 + 1 >= tall && c.x1 - c.x0 < 40 * unit);
  const letterTop = Math.min(...letterComps.map((c) => c.y0));
  const letterBottom = Math.max(...letterComps.map((c) => c.y1));
  const near = Math.round(6 * unit);
  const reachX = Math.round(2 * unit);
  const isMark = (c: Comp) =>
    c.x1 - c.x0 < 12 * unit &&
    c.y0 >= letterTop - 1 &&
    c.y1 <= letterBottom + 1 &&
    letterComps.some((l) => c.x1 >= l.x0 - reachX && c.x0 <= l.x1 + reachX && Math.max(l.y0 - c.y1, c.y0 - l.y1) <= near);
  for (const c of comps) if (!inBand(c) && !isMark(c)) for (const q of c.pix) core[q] = 0;
  // sombra: escura, com letra a até 4 px acima e à esquerda
  const reach = Math.max(2, Math.round(4 * unit));
  const shadow = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (core[k] || L[k] > bg[x] - 30) continue;
      let near = false;
      for (let dy = 0; dy <= reach && !near; dy++)
        for (let dx = 0; dx <= reach && !near; dx++) {
          if (!dx && !dy) continue;
          const yy = y - dy;
          const xx = x - dx;
          if (yy >= 0 && xx >= 0 && core[yy * w + xx]) near = true;
        }
      if (near) shadow[k] = 1;
    }
  // colunas com letra, em trechos (o vão entre palavras, até 12 px, não separa)
  const cols = new Uint16Array(w);
  const rows = new Uint16Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (core[y * w + x]) {
        cols[x]++;
        rows[y]++;
      }
  const blocks: { x0: number; x1: number }[] = [];
  const join = Math.round(12 * unit);
  for (let x = 0; x < w; x++) {
    if (cols[x] < 2) continue;
    const last = blocks[blocks.length - 1];
    if (last && x - last.x1 <= join) last.x1 = x + 1;
    else blocks.push({ x0: x, x1: x + 1 });
  }
  let top = 0;
  for (let y = 0; y < h; y++) top = Math.max(top, rows[y]);
  let baseline: number | null = null;
  if (top > 0) for (let y = 0; y < h; y++) if (rows[y] >= top * 0.25) baseline = rect.y0 + y + 1;
  // máscara: letra e sombra, com 2 px de folga (a borda suavizada das letras)
  const grow = Math.max(1, Math.round(2 * unit));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!core[y * w + x] && !shadow[y * w + x]) continue;
      for (let yy = Math.max(0, y - grow); yy <= Math.min(h - 1, y + grow); yy++)
        mask.fill(1, yy * w + Math.max(0, x - grow), yy * w + Math.min(w, x + grow + 1));
    }
  return {
    mask,
    rect,
    blocks: blocks.filter((b) => b.x1 - b.x0 >= 3 * unit).map((b) => ({ x0: rect.x0 + b.x0, x1: rect.x0 + b.x1 })),
    baseline,
  };
}

/**
 * Separa o símbolo da coleção das letras do tipo: o último trecho é o símbolo quando começa
 * depois de `OLD.symbolMin` e um vão de 14 px ou mais o separa do texto (os símbolos com
 * contorno branco passam por letra). Sem contorno branco o símbolo nem aparece nos trechos;
 * aí ele é achado pelo que foge do tom da moldura, da ponta da linha para a esquerda.
 * Devolve o fim do texto em inglês e o começo do símbolo (`null` sem símbolo), em pixels.
 */
export function oldTypeEnds(img: ImageData, letters: OldLetters): { textEnd: number; symbol: number | null } {
  const unit = img.width / BASE_W;
  const blocks = [...letters.blocks];
  let symbol: number | null = null;
  const last = blocks[blocks.length - 1];
  const before = blocks[blocks.length - 2];
  if (last && before && last.x0 >= OLD.symbolMin * unit && last.x0 - before.x1 >= 14 * unit) {
    symbol = last.x0;
    blocks.pop();
  }
  const textEnd = blocks.length ? blocks[blocks.length - 1].x1 : Math.round(OLD.type.x * unit);
  if (symbol === null) symbol = inkFromRight(img, letters.rect, textEnd + Math.round(14 * unit));
  return { textEnd, symbol };
}

/**
 * Começo do desenho mais à direita da linha de tipo, pelo que foge do tom da moldura (40 tons
 * ou mais de brilho, ou 60 de cor) em 3 linhas ou mais da coluna: da ponta (x ≈ 694) para a
 * esquerda, o primeiro trecho de colunas assim, com vãos de até 4 px. Só vale um trecho de 10 a
 * 90 px que começa depois de `from` e de `OLD.symbolMin`.
 */
function inkFromRight(img: ImageData, rect: Rect, from: number): number | null {
  const unit = img.width / BASE_W;
  const d = img.data;
  const y0 = rect.y0 + Math.round(8 * unit);
  const y1 = rect.y1 - Math.round(4 * unit);
  const xEnd = Math.round(694 * unit);
  const xStart = Math.max(from, Math.round(OLD.symbolMin * unit));
  if (xEnd - xStart < 10 * unit) return null;
  // tom da moldura: mediana da faixa entre o fim do texto e o começo da busca
  const ref: number[][] = [[], [], []];
  for (let y = y0; y < y1; y++)
    for (let x = xStart; x < xEnd; x += 2) {
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) ref[c].push(d[i + c]);
    }
  const tone = ref.map(medianOf);
  const toneL = 0.299 * tone[0] + 0.587 * tone[1] + 0.114 * tone[2];
  const inkCol = (x: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * img.width + x) * 4;
      const off = Math.abs(lum(d, i) - toneL) >= 40 || Math.max(...[0, 1, 2].map((c) => Math.abs(d[i + c] - tone[c]))) >= 60;
      if (off && ++n >= 3) return true;
    }
    return false;
  };
  let right = -1;
  for (let x = xEnd; x >= xStart; x--)
    if (inkCol(x)) {
      right = x;
      break;
    }
  if (right < 0) return null;
  let left = right;
  let gap = 0;
  for (let x = right - 1; x >= xStart; x--) {
    if (inkCol(x)) {
      left = x;
      gap = 0;
    } else if (++gap > 4 * unit) break;
  }
  const width = right - left + 1;
  return width >= 10 * unit && width <= 90 * unit ? left : null;
}
