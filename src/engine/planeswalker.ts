/**
 * Moldura de planeswalker (2015 em diante).
 *
 * Diferente da carta comum, a caixa de texto é dividida em faixas, uma por
 * habilidade, e as de lealdade têm o custo num escudo à esquerda ("+1", "−3").
 * A altura de cada faixa muda de carta para carta (depende do texto em inglês),
 * então ela é medida na própria imagem:
 *
 * 1. os escudos de lealdade são blocos pretos que avançam até x ≈ 106;
 * 2. a divisa entre duas faixas é onde o fundo muda de tom (as faixas alternam
 *    claro e um pouco mais escuro);
 * 3. habilidades sem custo (estáticas) ficam acima do primeiro escudo ou abaixo
 *    do último, onde houver espaço.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas em KLD,
 * WAR, C18, BRO, J22 e outras coleções.
 */
import type { Rect } from "./geometry";

/** Com 4 habilidades ou mais, a linha de tipo sobe e a caixa fica mais alta. */
export function isTallPlaneswalker(paragraphs: number): boolean {
  return paragraphs >= 4;
}

export const PW = {
  title: { centerY: 63, erase: { y0: 40, y1: 88 } },
  type: {
    normal: { centerY: 617, y0: 590, y1: 646 },
    tall: { centerY: 547, y0: 520, y1: 574 },
  },
  area: { normalTop: 656, tallTop: 586, bottom: 944 },
  /** texto das habilidades de lealdade começa depois do escudo e dos dois-pontos */
  loyaltyText: { x0: 138, erase: 129 },
  staticText: { x0: 104, erase: 96 },
  textRight: 680,
  eraseRight: 687,
  /** caixa da lealdade inicial, no canto de baixo à direita */
  loyaltyBox: { x0: 606, y0: 912, x1: 745, y1: 1040 },
};

export interface PwRow {
  y0: number;
  y1: number;
  /** tem escudo de custo (habilidade de lealdade) */
  loyalty: boolean;
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Centros (y, na escala-base) dos escudos de lealdade, de cima para baixo.
 * Olha só a ponta direita do escudo (x ≈ 93–104): ali não há número branco
 * dentro, e a moldura preta dos planeswalkers pretos já acabou (a caixa de
 * texto começa em x ≈ 90).
 */
export function findLoyaltyIcons(img: ImageData, top: number, bottom: number): number[] {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(93 * fx);
  const x1 = Math.round(104 * fx);
  // números de dois dígitos ("−12") invadem a ponta: basta um terço escuro
  const need = (x1 - x0) * 0.35;
  const runs: [number, number][] = [];
  let start = -1;
  const y1 = Math.round(bottom * fy);
  for (let y = Math.round(top * fy); y < y1; y++) {
    let dark = 0;
    for (let x = x0; x < x1; x++) if (lum(img.data, (y * img.width + x) * 4) < 40) dark++;
    if (dark >= need && start < 0) start = y;
    if (dark < need && start >= 0) {
      runs.push([start, y]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, y1]);
  // junta pedaços do mesmo escudo partidos pelo número
  const merged: [number, number][] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < 14 * fy && r[1] - last[0] <= 52 * fy) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  return merged.filter(([a, b]) => b - a >= 18 * fy && b - a <= 52 * fy).map(([a, b]) => (a + b) / 2 / fy);
}

/** Tom do fundo de cada linha da caixa (mediana dos pixels claros, sem o texto). */
function backgroundProfile(img: ImageData, top: number, bottom: number): Map<number, number> {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const out = new Map<number, number>();
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
    const iy = Math.min(img.height - 1, Math.round(y * fy));
    const vals: number[] = [];
    for (let x = 140; x < 640; x += 3) {
      const v = lum(img.data, (iy * img.width + Math.round(x * fx)) * 4);
      if (v > 100) vals.push(v);
    }
    vals.sort((a, b) => a - b);
    out.set(y, vals.length ? vals[vals.length >> 1] : 0);
  }
  return out;
}

/** Onde, entre `a` e `b`, o fundo muda de tom (divisa entre duas faixas). */
export function findBoundary(profile: Map<number, number>, a: number, b: number): number {
  const mean = (from: number, to: number) => {
    let s = 0;
    let n = 0;
    for (let y = from; y < to; y++) {
      const v = profile.get(y);
      if (v) {
        s += v;
        n++;
      }
    }
    return n ? s / n : 0;
  };
  let best = (a + b) / 2;
  let score = 4; // abaixo disso não há divisa visível: fica o meio
  for (let y = Math.round(a); y <= Math.round(b); y++) {
    const d = Math.abs(mean(y - 10, y) - mean(y, y + 10));
    if (d > score) {
      score = d;
      best = y;
    }
  }
  return best;
}

/**
 * Divide a caixa em faixas, uma por parágrafo do texto em português.
 * Devolve `null` quando a imagem não bate com o texto (mais escudos que
 * habilidades): nesse caso a carta sai como está.
 */
export function planeswalkerRows(img: ImageData, paragraphs: number): PwRow[] | null {
  const top = isTallPlaneswalker(paragraphs) ? PW.area.tallTop : PW.area.normalTop;
  const bottom = PW.area.bottom;
  const icons = findLoyaltyIcons(img, top, bottom);
  const statics = paragraphs - icons.length;
  if (!icons.length || statics < 0) return null;
  const profile = backgroundProfile(img, top, bottom);
  const first = icons[0];
  const last = icons[icons.length - 1];
  // estáticas vão para onde há espaço livre: em cima (a maioria) ou embaixo
  let above = 0;
  let below = 0;
  for (let i = 0; i < statics; i++) {
    if (first - top - above * 70 > 75) above++;
    else if (bottom - last - below * 70 > 75) below++;
    else return null;
  }
  const rows: PwRow[] = [];
  const edges: number[] = [top];
  if (above) {
    // a faixa do escudo tem pouca folga em volta dele: a divisa fica logo acima
    const end = findBoundary(profile, Math.max(top + 30, first - 70), first - 22);
    for (let i = 1; i < above; i++) edges.push(top + ((end - top) * i) / above);
    edges.push(end);
  }
  for (let i = 0; i < icons.length - 1; i++) edges.push(findBoundary(profile, icons[i] + 22, icons[i + 1] - 22));
  if (below) {
    const start = findBoundary(profile, last + 22, Math.min(bottom - 30, last + 70));
    edges.push(start);
    for (let i = 1; i < below; i++) edges.push(start + ((bottom - start) * i) / below);
  }
  edges.push(bottom);
  for (let i = 0; i < edges.length - 1; i++) {
    const loyalty = i >= above && i < above + icons.length;
    rows.push({ y0: edges[i], y1: edges[i + 1], loyalty });
  }
  return rows;
}

/** Retângulo de texto (onde escrever) e de apagamento de uma faixa. */
export function rowRects(row: PwRow): { text: Rect; erase: Rect } {
  const x = row.loyalty ? PW.loyaltyText : PW.staticText;
  return {
    text: { x0: x.x0, y0: row.y0 + 3, x1: PW.textRight, y1: row.y1 - 3 },
    // sem folga entre faixas: se a divisa cair no meio de uma linha em inglês, ela some inteira
    erase: { x0: x.erase, y0: row.y0, x1: PW.eraseRight, y1: row.y1 },
  };
}

/** Tira o custo de lealdade do começo do parágrafo ("+1: …", "[−3]: …"), que já está no escudo. */
export function stripLoyaltyCost(paragraph: string): string {
  return paragraph.replace(/^\s*\[?[+−–-]?(?:\d+|X)\]?\s*:\s*/u, "");
}

/**
 * Separa o texto em habilidades. O texto impresso em PT às vezes vem sem
 * quebras de linha ("…alvo.−2: Revele…"): quebra antes de cada custo de lealdade.
 */
export function splitAbilities(text: string | null): string[] {
  return (text ?? "")
    .replace(/([.”"])\s*(?=[+−–-](?:\d+|X):)/gu, "$1\n")
    .split("\n")
    .map((t) => stripLoyaltyCost(t).trim())
    .filter(Boolean);
}
