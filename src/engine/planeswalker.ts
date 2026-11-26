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
import { shadeProfile, shadeRatio } from "./station";

/** Com 4 habilidades ou mais, a linha de tipo sobe e a caixa fica mais alta. */
export function isTallPlaneswalker(paragraphs: number): boolean {
  return paragraphs >= 4;
}

/**
 * Fração da largura (x 80–660) cruzada pelos fios escuros de cima e de baixo de uma
 * linha de tipo (`bar`, escala-base), procurados a até 8 px da medida.
 */
function typeBarRims(img: ImageData, bar: { y0: number; y1: number }): number {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(80 * fx);
  const x1 = Math.round(660 * fx);
  const d = Math.max(2, Math.round(4 * fy));
  // fio na linha `y`: bem mais escura que a linha `y + dir·d`, dentro da barra
  const rim = (y: number, dir: number) => {
    const ref = y + dir * d;
    if (y < 0 || ref < 0 || y >= img.height || ref >= img.height) return 0;
    let hit = 0;
    for (let x = x0; x < x1; x++) if (lum(img.data, (ref * img.width + x) * 4) - lum(img.data, (y * img.width + x) * 4) > 30) hit++;
    return hit / (x1 - x0);
  };
  const best = (at: number, dir: number) => {
    let out = 0;
    for (let y = Math.round((at - 8) * fy); y <= Math.round((at + 8) * fy); y++) out = Math.max(out, rim(y, dir));
    return out;
  };
  return Math.min(best(bar.y0, 1), best(bar.y1, -1));
}

/**
 * A moldura é a alta? Medida na imagem, pelos fios da linha de tipo (y ≈ 520 e 574 na
 * alta, 590 e 646 na normal). Contar as habilidades em PT não basta: Vivien, Protetora
 * dos Monstros (IKO) tem quatro, com as duas estáticas num bloco só, na caixa normal, e
 * a caixa alta "achava" faixas por cima da linha de tipo. `null` quando nenhuma das duas
 * linhas aparece (aí vale a contagem).
 */
export function measureTallPlaneswalker(img: ImageData): boolean | null {
  const normal = typeBarRims(img, PW.type.normal);
  const tall = typeBarRims(img, PW.type.tall);
  if (Math.max(normal, tall) < 0.7) return null;
  return tall > normal;
}

/**
 * Fio de baixo da caixa de texto (escala-base), entre y ≈ 948 e 960: a primeira linha
 * bem mais escura que a de 3 px acima em 60% da largura (x 150–550). O texto em inglês
 * pode descer até ele (a vírgula do "this way, shuffle." no Grão-mestre das Flores, AFR):
 * apagar só até `PW.area.bottom` deixava o pé dela. `null` sem fio (caixa escura).
 */
export function measureBoxBottom(img: ImageData): number | null {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(150 * fx);
  const x1 = Math.round(550 * fx);
  const d = Math.max(2, Math.round(3 * fy));
  for (let y = Math.round(PW.area.bottom * fy); y <= Math.round(965 * fy) && y < img.height; y++) {
    let hit = 0;
    for (let x = x0; x < x1; x++) if (lum(img.data, ((y - d) * img.width + x) * 4) - lum(img.data, (y * img.width + x) * 4) > 35) hit++;
    if (hit >= (x1 - x0) * 0.6) return y / fy;
  }
  return null;
}

export const PW = {
  title: { centerY: 63, erase: { y0: 40, y1: 88 } },
  type: {
    normal: { centerY: 617, y0: 590, y1: 646 },
    tall: { centerY: 547, y0: 520, y1: 574 },
  },
  area: { normalTop: 656, tallTop: 586, bottom: 944 },
  /** texto das habilidades de lealdade começa depois do escudo e dos dois-pontos */
  loyaltyText: { x0: 138, erase: 132 },
  staticText: { x0: 104, erase: 96 },
  textRight: 680,
  eraseRight: 687,
  /** caixa da lealdade inicial, no canto de baixo à direita */
  loyaltyBox: { x0: 606, y0: 917, x1: 745, y1: 1040 },
};

export interface PwRow {
  y0: number;
  y1: number;
  /** tem escudo de custo (habilidade de lealdade) */
  loyalty: boolean;
  /** quantos parágrafos do texto vão nesta faixa (mais de um só nas estáticas juntas) */
  paragraphs: number;
  /** centro (y) do escudo de custo, nas habilidades de lealdade */
  icon?: number;
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Centros (y, na escala-base) dos escudos de lealdade, de cima para baixo.
 * Olha só a ponta direita do escudo (x ≈ 93–104): ali não há número branco
 * dentro, e a moldura preta dos planeswalkers pretos já acabou (a caixa de
 * texto começa em x ≈ 90).
 */
export function findLoyaltyIcons(img: ImageData, top: number, bottom: number, darkMax = 40): number[] {
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
    for (let x = x0; x < x1; x++) if (lum(img.data, (y * img.width + x) * 4) < darkMax) dark++;
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

/**
 * Tom do fundo de cada linha da caixa (mediana dos pixels claros). As linhas com texto
 * em inglês ficam com 0, sem medida: o contorno suavizado das letras puxa a mediana para
 * baixo, e a beira de cada linha de texto parecia uma divisa entre faixas mais forte que
 * a de verdade, quando as faixas quase não mudam de tom (Nissa dos Ramos Umbrosos, ZNR).
 * Caixa escura (mais da metade dos pixels) não é texto: fica como está.
 */
function backgroundProfile(img: ImageData, top: number, bottom: number): Map<number, number> {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const out = new Map<number, number>();
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
    const iy = Math.min(img.height - 1, Math.round(y * fy));
    const vals: number[] = [];
    let samples = 0;
    for (let x = 140; x < 640; x += 3) {
      const v = lum(img.data, (iy * img.width + Math.round(x * fx)) * 4);
      samples++;
      if (v > 100) vals.push(v);
    }
    const ink = samples - vals.length;
    vals.sort((a, b) => a - b);
    out.set(y, vals.length && !(ink >= 4 && ink < samples / 2) ? vals[vals.length >> 1] : 0);
  }
  return out;
}

/**
 * Onde, entre `a` e `b`, o fundo muda de tom (divisa entre duas faixas). A divisa fica
 * sempre fora das linhas de texto. Sem mudança visível, fica no meio do maior vão sem
 * texto (o espaço entre as duas habilidades em inglês) ou, sem vão, no meio.
 */
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
    // poucas linhas sem texto de um lado: não dá para comparar
    return n >= 4 ? s / n : NaN;
  };
  let edge = -1;
  let score = 4; // abaixo disso não há divisa visível
  let middle = (a + b) / 2;
  let run = 0;
  let gap = 0;
  for (let y = Math.round(a); y <= Math.round(b); y++) {
    if (!profile.get(y)) {
      run = 0;
      continue;
    }
    run++;
    if (run > gap) {
      gap = run;
      middle = Math.round(y - (run - 1) / 2);
    }
    const d = Math.abs(mean(y - 10, y) - mean(y, y + 10));
    if (d > score) {
      score = d;
      edge = y;
    }
  }
  return edge >= 0 ? edge : middle;
}

/**
 * Divide a caixa em faixas, uma por parágrafo do texto em português.
 * Devolve `null` quando a imagem não bate com o texto (mais escudos que
 * habilidades): nesse caso a carta sai como está.
 */
export function planeswalkerRows(
  img: ImageData,
  paragraphs: number,
  loyalty?: number,
  tall = isTallPlaneswalker(paragraphs),
  /** quantas estáticas vêm antes e depois das habilidades de lealdade, quando o texto diz */
  sides?: { above: number; below: number },
): PwRow[] | null {
  const top = tall ? PW.area.tallTop : PW.area.normalTop;
  const bottom = PW.area.bottom;
  let icons = findLoyaltyIcons(img, top, bottom);
  // Alguns escudos são cinza, não pretos (Ellywick AFR: só o +1 é preto). Quando o
  // texto diz quantas habilidades de lealdade há e a conta não bate, tenta de novo
  // aceitando escudos mais claros; se ainda não bater, desiste (a carta sai como está)
  // em vez de escrever habilidade de lealdade como se fosse estática.
  if (loyalty !== undefined && icons.length !== loyalty) {
    icons = findLoyaltyIcons(img, top, bottom, 110);
    if (icons.length !== loyalty) return null;
  } else if (loyalty === undefined) {
    // sem os custos no texto (Arena): fica com a leitura mais clara se ela achar mais
    // escudos e ainda couber no número de parágrafos
    const light = findLoyaltyIcons(img, top, bottom, 110);
    if (light.length > icons.length && light.length <= paragraphs) icons = light;
  }
  const statics = paragraphs - icons.length;
  if (!icons.length || statics < 0) return null;
  const profile = backgroundProfile(img, top, bottom);
  const first = icons[0];
  const last = icons[icons.length - 1];
  // estáticas vão para onde há espaço livre: em cima (a maioria) ou embaixo. As de um
  // mesmo lado formam um bloco só, como na carta: dividir o bloco em faixas iguais
  // apertava o texto longo numa faixa baixa e a letra de todas encolhia (A Imperatriz
  // Errante, NEO). Sem espaço para mais uma, a estática entra no bloco que já existe:
  // o reforço e o "Quando … entrar" do Jace, Mago dos Espelhos (ZNR) dividem um bloco
  let above = 0;
  let below = 0;
  if (sides) {
    // o texto diz onde fica cada estática (os custos vêm do Oracle): só confere o espaço
    if (sides.above + sides.below !== statics) return null;
    if ((sides.above && first - top <= 75) || (sides.below && bottom - last <= 75)) return null;
    above = sides.above;
    below = sides.below;
  } else
    for (let i = 0; i < statics; i++) {
      if (first - top - above * 70 > 75) above++;
      else if (bottom - last - below * 70 > 75) below++;
      else if (above) above++;
      else if (below) below++;
      else return null;
    }
  const rows: PwRow[] = [];
  let y = top;
  if (above) {
    // a faixa do escudo tem pouca folga em volta dele: a divisa fica logo acima
    const end = findBoundary(profile, Math.max(top + 30, first - 70), first - 22);
    rows.push({ y0: top, y1: end, loyalty: false, paragraphs: above });
    y = end;
  }
  const end = below ? findBoundary(profile, last + 22, Math.min(bottom - 30, last + 70)) : bottom;
  for (let i = 0; i < icons.length; i++) {
    const y1 = i < icons.length - 1 ? findBoundary(profile, icons[i] + 22, icons[i + 1] - 22) : end;
    rows.push({ y0: y, y1, loyalty: true, paragraphs: 1, icon: icons[i] });
    y = y1;
  }
  if (below) rows.push({ y0: end, y1: bottom, loyalty: false, paragraphs: below });
  return rows;
}

/**
 * Divisas que mudam de lugar (ver `planeswalkerBounds`): a divisa fica a pelo menos `iconClear`
 * do centro do escudo (o escudo tem até 52 px de altura, e a divisa tem 5 px de rampa), ou onde
 * estava, se já estava mais perto; e a faixa que muda de altura tem `pad` a mais em volta do
 * texto, além dos 3 px de `rowRects`.
 */
export const PW_PLAN = { iconClear: 30, pad: 4 };

/**
 * As divisas entre as faixas (escala-base, de cima para baixo, uma a menos que as faixas) para a
 * faixa `i` ter pelo menos `need[i]` de altura, cada uma o mais perto possível de onde está na
 * imagem. O texto em PT é mais comprido que o inglês e cada habilidade cresce de um jeito: com as
 * divisas do inglês, a faixa mais apertada encolhia a letra de todas, com espaço sobrando nas
 * outras (Will Kenrith, Kaito Shizuki). Os escudos ficam onde estão: a divisa não passa da folga
 * em volta deles. `null` quando não há como.
 */
export function planeswalkerBounds(rows: PwRow[], need: number[]): number[] | null {
  const n = rows.length;
  const top = rows[0].y0;
  const bottom = rows[n - 1].y1;
  const clear = (icon: number, at: number) => Math.min(PW_PLAN.iconClear, Math.abs(at - icon));
  // a divisa `i` fica entre a faixa i − 1 e a faixa i
  const lo = (i: number) => {
    const icon = rows[i - 1].icon;
    return icon === undefined ? -Infinity : icon + clear(icon, rows[i].y0);
  };
  const hi = (i: number) => {
    const icon = rows[i].icon;
    return icon === undefined ? Infinity : icon - clear(icon, rows[i].y0);
  };
  const min = [top];
  for (let i = 1; i < n; i++) min[i] = Math.max(lo(i), min[i - 1] + need[i - 1]);
  const max: number[] = [];
  max[n] = bottom;
  for (let i = n - 1; i >= 1; i--) max[i] = Math.min(hi(i), max[i + 1] - need[i]);
  if (n === 1) return need[0] <= bottom - top ? [] : null;
  for (let i = 1; i < n; i++) if (min[i] > max[i]) return null;
  const out: number[] = [];
  let prev = top;
  for (let i = 1; i < n; i++) {
    prev = Math.round(Math.min(Math.max(rows[i].y0, min[i], prev + need[i - 1]), max[i]));
    out.push(prev);
  }
  return out;
}

/**
 * Onde a faixa de baixo começa a escurecer (ou clarear) a de cima, na imagem já sem o texto
 * (escala da imagem): a linha em que o tom (a mediana de cada linha, x 110 a 680) passa do meio
 * entre o da faixa de cima e o da de baixo, perto da maior mudança a até 8 px da divisa medida
 * (`at`, escala-base). É o meio da rampa de `shadeProfile`: com a rampa fora do lugar, a divisa
 * antiga deixava um risco. `null` sem mudança de tom visível (as duas faixas do mesmo tom).
 */
export function bandEdge(img: ImageData, at: number): number | null {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(110 * fx);
  const x1 = Math.round(680 * fx);
  const med = new Map<number, number>();
  const row = (y: number) => {
    if (!med.has(y)) {
      const v: number[] = [];
      for (let x = x0; x < x1; x += 2) v.push(lum(img.data, (Math.min(img.height - 1, Math.max(0, y)) * img.width + x) * 4));
      v.sort((a, b) => a - b);
      med.set(y, v[v.length >> 1]);
    }
    return med.get(y)!;
  };
  const mean = (from: number, to: number) => {
    let sum = 0;
    for (let y = from; y <= to; y++) sum += row(y);
    return sum / (to - from + 1);
  };
  const c = Math.round(at * fy);
  let best = -1;
  let score = 3; // abaixo disso não há divisa visível
  for (let y = c - Math.round(8 * fy); y <= c + Math.round(8 * fy); y++) {
    const d = Math.abs(mean(y + 2, y + 4) - mean(y - 4, y - 2));
    if (d > score) {
      score = d;
      best = y;
    }
  }
  if (best < 0) return null;
  const mid = (mean(best - 9, best - 5) + mean(best + 5, best + 9)) / 2;
  for (let y = best - 4; y < best + 4; y++) {
    const a = row(y) - mid;
    const b = row(y + 1) - mid;
    if (a === 0) return y;
    if (a * b < 0) return Math.round(y + a / (a - b));
  }
  return best;
}

/**
 * Muda as divisas de lugar na imagem já sem o texto: cada faixa escurece (ou clareia) a de cima
 * por um tanto por canal (`shadeRatio`, medido na divisa original); nas linhas entre a divisa
 * original e a nova, o tom da faixa de antes vira o da faixa de agora. `from` e `to` são as
 * divisas (escala-base); `skip` são os retângulos que ficam como estão (a caixa da lealdade
 * inicial). As colunas são as da caixa, por dentro dos fios (x 90 a 688).
 */
export function moveBands(img: ImageData, top: number, bottom: number, from: number[], to: number[], skip: Rect[] = []): void {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(90 * fx);
  const x1 = Math.round(688 * fx);
  const y0 = Math.round(top * fy);
  const y1 = Math.round(bottom * fy);
  const edges: number[] = [];
  const moved: number[] = [];
  const ratios: [number, number, number][] = [];
  from.forEach((b, i) => {
    const edge = bandEdge(img, b);
    if (edge === null || to[i] === b) return;
    edges.push(edge - y0);
    moved.push(Math.round(edge + (to[i] - b) * fy) - y0);
    ratios.push(shadeRatio(img, edge, x0, x1));
  });
  if (!edges.length) return;
  const old = shadeProfile(y1 - y0, edges, ratios);
  const now = shadeProfile(y1 - y0, moved, ratios);
  const sk = skip.map((r) => ({ x0: r.x0 * fx, y0: r.y0 * fy, x1: r.x1 * fx, y1: r.y1 * fy }));
  for (let y = y0; y < y1; y++) {
    const k = [0, 1, 2].map((c) => now[c][y - y0] / old[c][y - y0]);
    if (k.every((v) => Math.abs(v - 1) < 1e-4)) continue;
    for (let x = x0; x < x1; x++) {
      if (sk.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) continue;
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = img.data[i + c] * k[c];
    }
  }
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

/**
 * Onde escrever o texto (de altura `height`) de uma faixa: centrado no escudo, como na
 * carta, sem sair da faixa. Centrado na faixa, o texto curto da última habilidade (a
 * faixa vai até o pé da caixa) ficava abaixo do escudo (Liliana, −7). Com o canto da
 * lealdade inicial (`notch`) o texto só sobe: as linhas foram quebradas para desviar
 * dele com o texto no meio da faixa.
 */
export function alignOnIcon(text: Rect, height: number, icon: number | undefined, notch: boolean): Rect {
  if (icon === undefined) return text;
  const mid = (text.y0 + text.y1) / 2;
  let c = Math.min(Math.max(icon, text.y0 + height / 2), text.y1 - height / 2);
  if (notch) c = Math.min(c, mid);
  if (height >= text.y1 - text.y0) c = mid;
  return { ...text, y0: c - height / 2, y1: c + height / 2 };
}

/** Tira o custo de lealdade do começo do parágrafo ("+1: …", "[−3]: …"), que já está no escudo. */
export function stripLoyaltyCost(paragraph: string): string {
  return paragraph.replace(/^\s*\[?[+−–-]?(?:\d+|X)\]?\s*:\s*/u, "");
}

/**
 * Para cada habilidade (como em `splitAbilities`), se ela tem custo de lealdade. As
 * estáticas antes da primeira ficam em cima dos escudos, as depois da última, embaixo.
 */
export function abilityKinds(text: string | null): boolean[] {
  return (text ?? "")
    .replace(/([.”"])\s*(?=[+−–-](?:\d+|X):)/gu, "$1\n")
    .split("\n")
    .filter((t) => t.trim())
    .map((t) => /^\s*\[?[+−–-]?(?:\d+|X)\]?\s*:/u.test(t));
}

/** Quantas habilidades de lealdade ("+1: …", "−2: …") o texto tem. */
export function countLoyaltyAbilities(text: string | null): number {
  return (text ?? "")
    .replace(/([.”"])\s*(?=[+−–-](?:\d+|X):)/gu, "$1\n")
    .split("\n")
    .filter((t) => /^\s*\[?[+−–-]?(?:\d+|X)\]?\s*:/u.test(t)).length;
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
