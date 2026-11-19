/**
 * Moldura sem borda (borderless) padrão, a das Secret Lair, das coleções de Commander e
 * das variantes sem borda das coleções normais desde 2020: a arte ocupa a carta inteira e
 * nome, tipo e regras ficam em barras e numa caixa translúcidas, escuras, com letra branca,
 * cada uma com um aro fino. Os lugares do texto são os da moldura M15 (`m15Layout`); muda o
 * fundo, que é a própria arte vista através da caixa (ver ADR 0012).
 *
 * As medidas estão na escala-base (745 × 1040), conferidas em amostras de SLD, FDN, LTR,
 * HOB/HOC, MSH, SPG, FIN, TLA e TLE.
 */
import { boxMean, morph, ptBoxLeft, ptBoxTop } from "./erase";
import { BASE_H, BASE_W, type Rect } from "./geometry";

const luminance = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Onde procurar o aro da caixa de texto (escala-base). */
export const BORDERLESS = {
  /** linhas em que os lados do aro são conferidos (fora o selo e a caixa de P/R) */
  sideRows: { y0: 690, y1: 900 },
  /** o lado de dentro do aro esquerdo fica entre x ≈ 52 e 57; o direito, entre 685 e 694 */
  left: { x0: 46, x1: 64 },
  right: { x0: 680, x1: 700 },
  /** o aro de cima termina em y ≈ 645–650 e o de baixo começa em y ≈ 954–958 */
  top: { y0: 636, y1: 668 },
  bottom: { y0: 938, y1: 966 },
  /** o aro de cima da barra do nome fica entre y ≈ 38 e 56; o de baixo, entre 97 e 116 */
  titleTop: { y0: 30, y1: 75 },
  titleBottom: { y0: 92, y1: 130 },
  /** colunas em que o topo e o pé do aro são conferidos (fora o selo e a caixa de P/R) */
  rowCols: [
    { x0: 100, x1: 290 },
    { x0: 460, x1: 560 },
  ],
} as const;

/**
 * Fração das `n` linhas (ou colunas) em que `diff` (o degrau de tom) passa de 15, no
 * sentido da maioria: o aro da moldura é o mesmo de cima a baixo, a arte não.
 */
function stepFraction(n: number, diff: (i: number) => number): number {
  let up = 0;
  let down = 0;
  for (let i = 0; i < n; i++) {
    const d = diff(i);
    if (d > 15) up++;
    else if (d < -15) down++;
  }
  return n ? Math.max(up, down) / n : 0;
}

/**
 * A caixa de texto da moldura sem borda, por dentro do aro (escala-base), ou `null` quando
 * a imagem não tem o aro dos dois lados. Os lados são a coluna em que a imagem muda de tom
 * de repente (3 px) em pelo menos 80% das linhas, no mesmo sentido; o topo e o pé, a linha
 * em que isso acontece em pelo menos 80% das colunas. A barra do nome também tem de estar no
 * alto, com os dois aros. Sem isso não é a moldura padrão: as artes sem caixa nenhuma (TLE,
 * com o texto solto sobre a arte), as estilizadas e as dos terrenos de Edge of Eternities
 * (Stellar Sights), que têm a caixa com aro mas o nome logo acima dela e o tipo dentro,
 * saem na original.
 */
export function borderlessBox(img: ImageData): Rect | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const X = (v: number) => Math.round(v * fx);
  const Y = (v: number) => Math.round(v * fy);
  const d = Math.max(2, X(3));
  const lumAt = (x: number, y: number) => luminance(img.data, (y * img.width + x) * 4);
  const rows: number[] = [];
  for (let y = Y(BORDERLESS.sideRows.y0); y < Y(BORDERLESS.sideRows.y1); y += 2) rows.push(y);
  // o aro tem dois degraus, o de fora (arte → aro) e o de dentro (aro → caixa): à esquerda
  // vale o último, à direita o primeiro
  const column = (from: number, to: number, last: boolean) => {
    let found = -1;
    for (let x = X(from); x < X(to); x++) {
      if (stepFraction(rows.length, (i) => lumAt(x + d, rows[i]) - lumAt(x, rows[i])) < 0.8) continue;
      found = x;
      if (!last) break;
    }
    return found;
  };
  const left = column(BORDERLESS.left.x0, BORDERLESS.left.x1, true);
  const right = column(BORDERLESS.right.x0, BORDERLESS.right.x1, false);
  if (left < 0 || right < 0) return null;
  const cols: number[] = [];
  for (const c of BORDERLESS.rowCols) for (let x = X(c.x0); x < X(c.x1); x += 2) cols.push(x);
  const row = (from: number, to: number, last: boolean) => {
    let found = -1;
    for (let y = Y(from); y < Y(to); y++) {
      if (stepFraction(cols.length, (i) => lumAt(cols[i], y + d) - lumAt(cols[i], y)) < 0.8) continue;
      found = y;
      if (!last) break;
    }
    return found;
  };
  if (row(BORDERLESS.titleTop.y0, BORDERLESS.titleTop.y1, false) < 0) return null;
  if (row(BORDERLESS.titleBottom.y0, BORDERLESS.titleBottom.y1, false) < 0) return null;
  // o topo é o último degrau do aro de cima; o pé, o primeiro do aro de baixo
  const top = row(BORDERLESS.top.y0, BORDERLESS.top.y1, true);
  const bottom = row(BORDERLESS.bottom.y0, BORDERLESS.bottom.y1, false);
  const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    // (o degrau fica entre x e x + d: a caixa começa 2 px depois dele, e o aro direito, no x
    // dele; a sombra de dentro do aro às vezes passa por degrau, mas as letras começam em 64)
    x0: clampTo((left + d + 2) / fx, 52, 59),
    x1: clampTo((right - 1) / fx, 684, 694),
    // (o topo fica rente ao aro: a primeira linha em inglês começa logo abaixo dele, e um
    // resto do aro que entre na conta não vira letra, ver whiteTextMask)
    y0: top >= 0 ? (top + d - 1) / fy : 650,
    y1: bottom >= 0 ? (bottom - 1) / fy : 953,
  };
}

/**
 * Centro (y, escala da imagem) da faixa de letras de uma barra sem borda, ou `null`. Numa
 * barra clara com brilho (Ancient Gold Dragon, CLB 365) a letra branca quase não foge da
 * mediana da linha, e a medida das barras opacas (`textBandCenter`) não achava o nome, uns
 * 8 px mais alto que o padrão: o alto das letras em inglês ficava acima do português. Aqui
 * cada linha conta as viradas de tom fortes (mais de 30) de um pixel ao vizinho na
 * horizontal: a letra tem muitas, de qualquer cor; os aros são lisos na horizontal. A
 * faixa é o maior trecho seguido de linhas com mais da metade do máximo, de 10 a 26 px.
 */
export function letterBandCenter(img: ImageData, rect: Rect): number | null {
  const x0 = Math.round(rect.x0);
  const x1 = Math.round(rect.x1);
  const y0 = Math.round(rect.y0);
  const y1 = Math.round(rect.y1);
  if (x1 - x0 < 2 || y1 <= y0) return null;
  const counts: number[] = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    let prev = luminance(img.data, (y * img.width + x0) * 4);
    for (let x = x0 + 1; x < x1; x++) {
      const v = luminance(img.data, (y * img.width + x) * 4);
      if (Math.abs(v - prev) > 30) n++;
      prev = v;
    }
    counts.push(n / (x1 - x0 - 1));
  }
  const max = Math.max(...counts);
  if (max < 0.05) return null;
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= counts.length; i++) {
    const on = i < counts.length && counts[i] > max / 2;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1];
      start = -1;
    }
  }
  if (!best) return null;
  const h = (best[1] - best[0]) / (img.height / BASE_H);
  if (h < 10 || h > 26) return null;
  return y0 + (best[0] + best[1]) / 2;
}

/**
 * A aba do nome de jogo nas cartas com nome de crossover (escala-base): presa embaixo da
 * barra do nome, de y ≈ 118 a 143, com o nome em inglês em itálico branco, centrado em x ≈
 * 372. Medidas da Secret Lair (Skeletor no Tinybones, Clive's Invictus Blade no Blade of
 * Selves, Best Served Cold no Wrath of the Skies). Em algumas a aba inteira fica uns pixels
 * mais alta (3 px no Yojimbo e no Westley da Secret Lair): ver `subtitleShift`.
 */
export const SUBTITLE = {
  /** por dentro dos aros da aba (o de cima é o pé da barra do nome) */
  y0: 118,
  y1: 143,
  /** onde procurar as letras: por dentro dos lados inclinados da aba (x ≈ 155–590) */
  x0: 175,
  x1: 570,
  /** linha de base e centro das letras (o alto das maiúsculas fica em 120, como no inglês) */
  baseline: 136,
  centerX: 372.5,
  size: 23.5,
  /** largura máxima do nome em PT, dentro da aba */
  maxWidth: 360,
  /**
   * a letra é quase branca: abaixo disso é arte vista através da aba (a folha cinza do
   * Awesome Android, MSC); com a letra tingida da digitalização (lilás no Shards of Narsil
   * de LTC, até 210), o limiar desce para 70 tons abaixo do mais claro dela, até 110
   */
  ink: 170,
} as const;

/**
 * Quantos pixels (escala-base) a aba do nome de crossover está acima (negativo) ou abaixo da
 * medida padrão, pelo aro de baixo dela: duas linhas escuras (mediana da linha) entre o fundo
 * da aba e a arte, padrão em y = 143. Vale a primeira dupla mais escura que as duas
 * vizinhanças, por pelo menos 8 tons; sem ela, 0. Com a aba 3 px mais alta (Yojimbo, SLD 7004), o retângulo
 * padrão pegava o aro de baixo e a lua branca logo abaixo dele: pedaços da lua viravam
 * "letra" e a rede neural apagava dois trechos do aro.
 */
export function subtitleShift(img: ImageData): number {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const x0 = Math.round(SUBTITLE.x0 * fx);
  const x1 = Math.round(SUBTITLE.x1 * fx);
  const med = (yb: number) => {
    const y = Math.round(yb * fy);
    const row = new Float32Array(x1 - x0);
    for (let x = x0; x < x1; x++) row[x - x0] = luminance(img.data, (y * img.width + x) * 4);
    return row.sort()[row.length >> 1];
  };
  // (a primeira dupla de cima para baixo: logo abaixo do aro a arte pode ter outra linha
  // escura, a beira da lua do Yojimbo, e com mais contraste)
  for (let y = SUBTITLE.y1 - 6; y <= SUBTITLE.y1 + 4; y++)
    if (Math.min(med(y - 2), med(y + 3)) - Math.max(med(y), med(y + 1)) >= 8) return y - SUBTITLE.y1;
  return 0;
}

/**
 * As letras do nome de jogo na aba das cartas com nome de crossover, como retângulo a apagar
 * (escala-base), ou `null` se não há aba com letras brancas ali. Em cada linha, letra é o que
 * passa 60 tons da mediana da linha (o fundo escuro da aba) e o limiar `ink` (ver
 * `SUBTITLE.ink`), que vai junto no resultado para a máscara; as colunas com letra
 * dão as pontas, com 4 px de folga; o alto e o pé seguem a aba (`subtitleShift`). A arte
 * aparece através da aba em algumas molduras (a mão cinza atrás do Awesome Android da
 * Marvel, MSC): as linhas de mediana acima de 110 ficam de fora da conta, e só se forem mais
 * de um terço a área não é aba. O nome é centrado: fica o grupo de colunas do meio, com os
 * vizinhos a até 28 px (uma lâmpada da arte no fim da aba, longe do nome, não entra), e o
 * espelho dele do outro lado do meio da carta.
 */
export function subtitleLetters(img: ImageData): (Rect & { ink: number }) | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const x0 = Math.round(SUBTITLE.x0 * fx);
  const x1 = Math.round(SUBTITLE.x1 * fx);
  const w = x1 - x0;
  const hits = new Uint16Array(w);
  const dy = subtitleShift(img);
  // (do alto das maiúsculas à linha de base: as descendentes chegam perto do aro de baixo)
  const y0 = Math.round((121 + dy) * fy);
  const y1 = Math.round((135 + dy) * fy);
  // limiar das letras: 70 tons abaixo do mais claro da aba (o 99,5º percentil), de 110 a 170
  const all: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) all.push(luminance(img.data, (y * img.width + x) * 4));
  all.sort((a, b) => a - b);
  const ink = Math.min(SUBTITLE.ink, Math.max(110, all[Math.floor(all.length * 0.995)] - 70));
  let light = 0;
  for (let y = y0; y < y1; y++) {
    const row = new Float32Array(w);
    for (let x = 0; x < w; x++) row[x] = luminance(img.data, (y * img.width + x0 + x) * 4);
    const med = Float32Array.from(row).sort()[w >> 1];
    if (med > 110) {
      light++;
      continue;
    }
    for (let x = 0; x < w; x++) if (row[x] > Math.max(med + 60, ink)) hits[x]++;
  }
  if (light * 3 > y1 - y0) return null;
  // grupos de colunas com letra, unidos por vãos de até 28 px (o espaço entre as palavras e,
  // nas letras foil, os trechos mais escuros do traço)
  const gap = Math.round(28 * fx);
  const runs: [number, number][] = [];
  for (let x = 0; x < w; x++) {
    if (hits[x] < 2) continue;
    const last = runs[runs.length - 1];
    if (last && x - last[1] <= gap) last[1] = x;
    else runs.push([x, x]);
  }
  if (!runs.length) return null;
  // o grupo mais perto do meio da carta
  const mid = Math.round(SUBTITLE.centerX * fx) - x0;
  const dist = ([a, b]: [number, number]) => (mid < a ? a - mid : mid > b ? mid - b : 0);
  const [ra, rb] = runs.reduce((best, r) => (dist(r) < dist(best) ? r : best));
  let cols = 0;
  for (let x = ra; x <= rb; x++) if (hits[x] >= 2) cols++;
  if (cols < 10 * fx || rb - ra < 30 * fx) return null;
  // o nome é centrado: o retângulo vai até o espelho do lado achado (no foil arco-íris do Dr.
  // Ian Malcolm, SLD, só a metade da direita do nome passava do limiar, e a outra ficava)
  const a = Math.max(0, Math.min(ra, 2 * mid - rb));
  const b = Math.min(w - 1, Math.max(rb, 2 * mid - ra));
  return { x0: (x0 + a) / fx - 4, y0: SUBTITLE.y0 + dy, x1: (x0 + b + 1) / fx + 4, y1: SUBTITLE.y1 + dy, ink };
}

/** Limiar de Otsu de um histograma de 256 tons: o que melhor separa dois grupos. */
export function otsu(hist: Uint32Array): number {
  let total = 0;
  let sum = 0;
  for (let v = 0; v < 256; v++) {
    total += hist[v];
    sum += v * hist[v];
  }
  let w0 = 0;
  let s0 = 0;
  let best = 0;
  let at = 0;
  for (let v = 0; v < 256; v++) {
    w0 += hist[v];
    s0 += v * hist[v];
    const w1 = total - w0;
    if (!w0 || !w1) continue;
    const d = s0 / w0 - (sum - s0) / w1;
    const between = w0 * w1 * d * d;
    if (between > best) {
      best = between;
      at = v;
    }
  }
  return at;
}

/**
 * Máscara das letras brancas de uma caixa translúcida sem borda (1 = apagar), na grade de
 * `rect` (inteiro). A máscara das caixas de papel (`textMask`) marca tudo o que foge do
 * fundo, e a cor diferente perto das letras: sobre a arte vista através da caixa, ela
 * pegava a arte inteira em volta das linhas (os robôs do Ultron, a gravura do Shivan
 * Dragon da Secret Lair), e a rede neural refazia tudo isso como um borrão. Aqui a letra é
 * o que passa do limiar de Otsu da caixa (a arte escurecida pela caixa fica de um lado, a
 * letra branca do outro) e também do fundo da vizinhança por 30 tons (numa caixa clara,
 * como a dourada do Fabled Passage da Secret Lair, o Otsu cai no meio da arte). Os
 * símbolos de mana têm o círculo claro e o desenho escuro no meio: o miolo fechado pela
 * letra ou pelo círculo, pequeno, entra junto, e o contorno escuro colado nas letras também.
 * A borda suavizada vem na folga que quem chama dá (`combineMasks`). `floor` é o mínimo do limiar: na
 * aba do nome de crossover, onde a letra é quase branca, quem chama sobe para 170 (com 110,
 * a folha cinza da arte ao lado do nome do Awesome Android, MSC, era apagada inteira).
 * `twoTone` (a caixa): com arte clara atrás de parte dela, o limiar vai para entre essa
 * arte e a letra (ver abaixo).
 */
export function whiteTextMask(img: ImageData, rect: Rect, protect: Rect[] = [], floor = 110, twoTone = false): Uint8Array {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const n = w * h;
  if (w <= 0 || h <= 0) return new Uint8Array(0);
  const unit = img.width / BASE_W;
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = luminance(img.data, ((rect.y0 + y) * img.width + rect.x0 + x) * 4);
      lum[y * w + x] = v;
      hist[Math.round(v)]++;
    }
  let t = Math.min(230, Math.max(floor, otsu(hist)));
  // Arte de duas cores atrás da caixa, uma delas clara (metade vermelha e metade cinza, de
  // 100 a 165 tons, no Adult Gold Dragon, AFR 297): o Otsu separava o vermelho do cinza, e o
  // cinza inteiro passava por letra; a rede neural refazia a metade da caixa lisa, sem o
  // desenho. Quando o grupo claro é na maior parte cinza (mediana abaixo de 170; com as
  // letras ele fica acima de 200), o limiar é o Otsu de dentro dele, entre o cinza e a letra.
  // Só na caixa (`twoTone`): nas barras o grupo claro tem os aros e o brilho da barra, e o
  // limiar subia para 200 nos nomes, perto do branco das letras.
  const upper = new Uint32Array(256);
  let count = 0;
  for (let v = Math.ceil(t + 1e-6); v < 256; v++) count += upper[v] = hist[v];
  let acc = 0;
  let median = 255;
  for (let v = 0; v < 256; v++)
    if ((acc += upper[v]) * 2 >= count) {
      median = v;
      break;
    }
  if (twoTone && count && median < 170) t = Math.min(230, Math.max(t, otsu(upper)));
  const keep = new Float32Array(n);
  for (let k = 0; k < n; k++) keep[k] = lum[k] < t ? 1 : 0;
  const bg = boxMean(lum, keep, w, h, Math.max(8, Math.round(24 * unit)));
  const core = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (lum[k] > Math.max(t, bg[k] + 30)) core[k] = 1;
  // Traço claro comprido na horizontal é desenho da moldura, não letra (o traço mais longo
  // de uma letra, o travessão, tem uns 30 px): o aro da caixa, quando o topo medido fica
  // rente a ele, e o aro que sobe em volta do selo triangular de LTR, separado do selo por
  // uma faixa cinza da cor da caixa (Shadow of the Enemy)
  const maxRun = Math.round(60 * unit);
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
  // miolos fechados e pequenos (o desenho escuro dentro do círculo dos símbolos, o "o")
  const maxSide = Math.round(30 * unit);
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (core[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    let open = false;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    for (let j = 0; j < comp.length; j++) {
      const k = comp[j];
      const x = k % w;
      const y = (k - x) / w;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) open = true;
      for (const q of [k - 1, k + 1, k - w, k + w]) {
        if (q < 0 || q >= n || seen[q] || core[q]) continue;
        if ((q === k - 1 && x === 0) || (q === k + 1 && x === w - 1)) continue;
        seen[q] = 1;
        comp.push(q);
      }
    }
    if (!open && x1 - x0 < maxSide && y1 - y0 < maxSide) for (const k of comp) core[k] = 2;
  }
  const out = morph(
    core.map((v) => (v ? 1 : 0)),
    w,
    h,
    Math.max(1, Math.round(unit)),
    true,
  );
  // O contorno escuro que a digitalização deixa colado na letra (0 a 6 tons num fundo de 20,
  // no Shards of Narsil de LTC) ficava na beira do buraco, e a rede neural o espalhava para
  // dentro: as letras apagadas voltavam como letras escuras. O que fica a até 3 px da máscara
  // e é 8 tons mais escuro que o fundo da vizinhança entra junto.
  const ring = morph(out, w, h, Math.max(2, Math.round(3 * unit)), true);
  for (let k = 0; k < n; k++) if (ring[k] && !out[k] && lum[k] < bg[k] - 8) out[k] = 1;
  for (const p of protect)
    for (let y = Math.max(Math.round(p.y0), rect.y0); y < Math.min(Math.round(p.y1), rect.y1); y++)
      for (let x = Math.max(Math.round(p.x0), rect.x0); x < Math.min(Math.round(p.x1), rect.x1); x++)
        out[(y - rect.y0) * w + x - rect.x0] = 0;
  return out;
}

/**
 * O fio claro entre as regras e o flavor na caixa sem borda (linhas da imagem). Ele é um
 * traço comprido, e a máscara das letras o deixa de fora (ver `whiteTextMask`); mas o texto
 * em PT não cai nas mesmas alturas, e sem flavor em PT não há fio nenhum: o fio original
 * ficava cortando as linhas em português (Thoughtcast, SPG). Fio é a linha mais clara que as
 * linhas 3 px acima e abaixo em pelo menos metade da largura, sem letra a 2 px dela (as
 * linhas de texto têm de 26 a 45% de pixels acima do limiar das letras; o fio, até 10%),
 * em trechos de até 3 linhas seguidas.
 */
export function boxDividers(img: ImageData, rect: Rect): number[] {
  const x0 = Math.round(rect.x0);
  const x1 = Math.round(rect.x1);
  const y0 = Math.round(rect.y0);
  const y1 = Math.round(rect.y1);
  const w = x1 - x0;
  if (w <= 0 || y1 <= y0) return [];
  const lum = (x: number, y: number) => luminance(img.data, (y * img.width + x) * 4);
  const hist = new Uint32Array(256);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[Math.round(lum(x, y))]++;
  const t = Math.min(230, Math.max(110, otsu(hist)));
  const d = Math.max(2, Math.round((3 * img.height) / BASE_H));
  const rows: number[] = [];
  for (let y = y0 + d + 3; y < y1 - d - 3; y++) {
    let lit = 0;
    let ink = 0;
    for (let x = x0; x < x1; x++) {
      if (lum(x, y) - Math.max(lum(x, y - d), lum(x, y + d)) > 5) lit++;
      for (let k = -2; k <= 2; k++) if (lum(x, y + k) > t) ink++;
    }
    if (lit >= w * 0.5 && ink <= w * 5 * 0.12) rows.push(y);
  }
  const out: number[] = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
    if (j - i < 3) out.push(...rows.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

/**
 * Caixa de P/R da moldura sem borda (escala-base): o topo e o lado esquerdo, para a proteção
 * (`ptProtect`). A caixa tem o mesmo desenho em todas as artes sem borda (lado esquerdo em
 * x ≈ 579 a 582 e topo em y ≈ 923 a 928, conferidos em ~120 criaturas e veículos), mas as
 * medidas das molduras opacas comparam com o papel de cima da caixa de texto, que aqui é a
 * arte: com arte clara no alto e escura no pé, o lado esquerdo saía no começo da busca (545),
 * a proteção começava em 564 e o ponto final da última linha, colado na caixa, ficava em
 * inglês (Shigeki, Jukai Visionary, SLD 2843). O lado é medido contra a arte das mesmas
 * linhas, logo à esquerda (mediana de três linhas abaixo do topo, sem as que param antes de
 * 566); fora de 572 a 590, ou sem medida, vale o desenho (580). O topo medido só vale entre
 * 921 e 930; fora disso, 924.
 */
export function borderlessPtBox(img: ImageData): { top: number; left: number } {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const measured = ptBoxTop(img, 610 * fx, 670 * fx, 905 * fy, 950 * fy, 890 * fy);
  const top = measured === null ? 924 : Math.min(930, Math.max(921, measured / fy));
  const found: number[] = [];
  for (const dy of [10, 14, 18]) {
    const y = Math.round((top + dy) * fy);
    const left = ptBoxLeft(img, y, 545 * fx, 610 * fx, y + Math.round(6 * fy));
    // (perto do começo da busca é letra ou arte, não a caixa)
    if (left !== null && left / fx >= 566) found.push(left / fx);
  }
  found.sort((a, b) => a - b);
  const left = found.length ? found[found.length >> 1] : null;
  return { top, left: left !== null && left >= 572 && left <= 590 ? left : 580 };
}

/**
 * A caixa sem borda é clara demais para a letra branca? A caixa é escura de propósito, mas
 * uma arte muito clara atrás dela (o brilho dourado do Fabled Passage da Secret Lair) deixa
 * a caixa clara, e ali a letra branca só se lê pelo contorno escuro dela: a máscara não
 * acha as letras sem contorno contra o fundo e o português, sem contorno, sumiria. Mediana
 * de luminância acima de 150 (as caixas escuras das amostras ficam entre 20 e 125): a
 * carta sai na original. Basta também uma parte grande da caixa ser clara: no foil do Simian
 * Spirit Guide (SLD 1548★) a metade esquerda é um degradê claro (150 a 166) e a direita,
 * escura; a mediana da caixa fica em 107, mas as letras da esquerda não entravam na máscara
 * e o inglês ficava embaixo do português. Em ladrilhos de 16 px, o fundo de cada um é o 30º
 * percentil (as letras brancas cobrem bem menos que 70% de um ladrilho); com 12% ou mais
 * dos ladrilhos acima de 150, a caixa é clara (nas amostras que dão certo, no máximo 5%).
 */
export function lightBorderlessBox(img: ImageData, box: Rect): boolean {
  const hist = new Uint32Array(256);
  let n = 0;
  const x0 = Math.round(box.x0);
  const y0 = Math.round(box.y0);
  const x1 = Math.round(box.x1);
  const y1 = Math.round(box.y1);
  for (let y = y0; y < y1; y += 3)
    for (let x = x0; x < x1; x += 3) {
      hist[Math.round(luminance(img.data, (y * img.width + x) * 4))]++;
      n++;
    }
  let acc = 0;
  for (let v = 0; v < 256; v++)
    if ((acc += hist[v]) >= n / 2) {
      if (v > 150) return true;
      break;
    }
  const t = Math.max(8, Math.round((16 * img.width) / BASE_W));
  const tile = new Float32Array(t * t);
  let tiles = 0;
  let light = 0;
  for (let y = y0; y + t <= y1; y += t)
    for (let x = x0; x + t <= x1; x += t) {
      let k = 0;
      for (let yy = y; yy < y + t; yy++) for (let xx = x; xx < x + t; xx++) tile[k++] = luminance(img.data, (yy * img.width + xx) * 4);
      tile.sort();
      if (tile[Math.floor(k * 0.3)] > 150) light++;
      tiles++;
    }
  return tiles > 0 && light >= tiles * 0.12;
}

/**
 * O selo de promoção sem borda (o oval holográfico, o triângulo de LTR e de FIN), pixel a
 * pixel, em retângulos de uma linha (escala da imagem). O selo fica no aro de baixo e sobe
 * uns 15 px para dentro da caixa. O retângulo de `findStamp` tem folga dos lados, e a forma
 * das molduras M15 (`stampShape`) guarda 14 px em volta do que se liga à borda preta: na sem
 * borda o ponto final da última linha, ao lado do triângulo do Tellah (FIN), ficava como um
 * pingo branco. Aqui o selo é o que destoa do fundo da caixa (40 tons de cor, medido na
 * faixa logo acima do selo), tem par da mesma cor do outro lado do meio da carta (com 2 px
 * de folga) e se liga, por pixels assim, ao pé da caixa dentro do retângulo; mais o que esse
 * contorno cerca (o brilho de dentro do selo); com 2 px de folga em volta. O
 * aro claro que sobe em volta do selo triangular de LTR
 * fica solto do selo por uma faixa da cor da caixa: ele não vira letra por ser um traço
 * longo (ver whiteTextMask).
 */
export function borderlessStamp(img: ImageData, stamp: Rect, box: Rect): Rect[] {
  const x0 = Math.max(Math.round(stamp.x0), Math.round(box.x0));
  const x1 = Math.min(Math.round(stamp.x1), Math.round(box.x1));
  const y0 = Math.max(Math.round(stamp.y0), Math.round(box.y0));
  const y1 = Math.round(box.y1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return [];
  const unit = img.width / BASE_W;
  // fundo: mediana de cor da faixa logo acima do selo, sem as letras brancas
  const band = Math.max(4, Math.round(8 * unit));
  const ch: number[][] = [[], [], []];
  for (let y = Math.max(0, y0 - band); y < y0; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      if (luminance(img.data, i) > 150) continue;
      for (let c = 0; c < 3; c++) ch[c].push(img.data[i + c]);
    }
  if (!ch[0].length) return [{ x0, y0, x1, y1 }];
  const bg = ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
  const differs = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    const dr = img.data[i] - bg[0];
    const dg = img.data[i + 1] - bg[1];
    const db = img.data[i + 2] - bg[2];
    return dr * dr + dg * dg + db * db > 40 * 40;
  };
  // O selo e o aro que sobe em volta dele são simétricos em torno do meio da carta, também na
  // cor; a letra e a arte, não. Só conta o pixel com par da mesma cor do outro lado (com 2 px
  // de folga): o "l." do fim do flavor do Mana Crypt (SPG), colado no aro verde em volta do
  // selo, entrava na enchente e ficava; e com arte de outra cor atrás da caixa (a mão cinza e
  // o fundo azul da Catra, SLD 2782) a enchente passava pela própria arte até o pé das
  // letras da última linha, e ele ficava como tracinhos brancos.
  // (o eixo do selo pode cair uns pixels fora do meio da imagem, e nas descidas íngremes do
  // aro 2 px de folga não bastam: vale o eixo, até 8 px para cada lado, em que mais pixels
  // que destoam do fundo têm par da mesma cor)
  const slack = Math.max(1, Math.round(2 * unit));
  const same = (i: number, j: number) => {
    const dr = img.data[i] - img.data[j];
    const dg = img.data[i + 1] - img.data[j + 1];
    const db = img.data[i + 2] - img.data[j + 2];
    return dr * dr + dg * dg + db * db <= 45 * 45;
  };
  let mid = img.width - 1;
  let best = -1;
  const reach = Math.round(8 * unit);
  for (let m = img.width - 1 - reach; m <= img.width - 1 + reach; m++) {
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const xx = m - x;
        if (xx >= 0 && xx < img.width && differs(x, y) && same((y * img.width + x) * 4, (y * img.width + xx) * 4)) n++;
      }
    if (n > best) [best, mid] = [n, m];
  }
  const symmetric = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    for (let d = -slack; d <= slack; d++) {
      const xx = mid - x + d;
      if (xx >= 0 && xx < img.width && same(i, (y * img.width + xx) * 4)) return true;
    }
    return false;
  };
  // Arte lisa é simétrica de graça: a faixa vinho lisa entre o aro e a última linha do
  // Underworld Breach (SLD 2045) levava a enchente do aro até as letras, e "this enchantme"
  // ficava em inglês. O aro e o selo têm contorno; um trecho liso só entra se o contorno o
  // cerca (o miolo de um aro grosso, abaixo).
  const flatR = Math.max(1, Math.round(2 * unit));
  const flat = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    for (let dy = -flatR; dy <= flatR; dy++)
      for (let dx = -flatR; dx <= flatR; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
        const j = (yy * img.width + xx) * 4;
        const dr = img.data[i] - img.data[j];
        const dg = img.data[i + 1] - img.data[j + 1];
        const db = img.data[i + 2] - img.data[j + 2];
        if (dr * dr + dg * dg + db * db > 16 * 16) return false;
      }
    return true;
  };
  const part = (x: number, y: number) => differs(x0 + x, y0 + y) && symmetric(x0 + x, y0 + y) && !flat(x0 + x, y0 + y);
  // enchente a partir da linha de baixo (o pé da caixa), por vizinhos de 8
  const flood = (ok: (x: number, y: number) => boolean) => {
    const got = new Uint8Array(w * h);
    const queue: number[] = [];
    for (let x = 0; x < w; x++)
      if (ok(x, h - 1)) {
        got[(h - 1) * w + x] = 1;
        queue.push((h - 1) * w + x);
      }
    while (queue.length) {
      const k = queue.pop()!;
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || got[ny * w + nx]) continue;
          if (!ok(nx, ny)) continue;
          got[ny * w + nx] = 1;
          queue.push(ny * w + nx);
        }
    }
    return got;
  };
  let inside = flood(part);
  // A enchente inteira também é simétrica, não só cada pixel: a beira entre duas cores da
  // arte, simétrica ponto a ponto por acaso, subia de um lado só até as letras (Underworld
  // Breach). Fica o que tem par na enchente do outro lado do eixo, de novo ligado ao pé.
  const mirrored = (x: number, y: number) => {
    for (let d = -slack; d <= slack; d++) {
      const xx = mid - (x0 + x) + d - x0;
      if (xx >= 0 && xx < w && inside[y * w + xx]) return true;
    }
    return false;
  };
  for (let round = 0; round < 20; round++) {
    const kept = flood((x, y) => inside[y * w + x] === 1 && mirrored(x, y));
    if (kept.every((v, k) => v === inside[k])) break;
    inside = kept;
  }
  // O brilho holográfico de dentro do selo não é simétrico: o que o contorno do selo cerca
  // (sem saída pelo alto nem pelos lados do retângulo; embaixo o selo continua) é selo.
  const open = new Uint8Array(w * h);
  const queue: number[] = [];
  const seed = (k: number) => {
    if (inside[k] || open[k]) return;
    open[k] = 1;
    queue.push(k);
  };
  for (let x = 0; x < w; x++) seed(x);
  for (let y = 1; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (queue.length) {
    const k = queue.pop()!;
    const x = k % w;
    const y = (k - x) / w;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const n = ny * w + nx;
      if (inside[n] || open[n]) continue;
      open[n] = 1;
      queue.push(n);
    }
  }
  for (let k = 0; k < w * h; k++) if (!open[k]) inside[k] = 1;
  const r = Math.max(1, Math.round(2 * unit));
  const grown = morph(inside, w, h, r, true);
  // A folga cobre a borda suavizada do selo e do aro, e borda suavizada fica entre a cor do
  // selo e a do fundo, nunca mais clara que os dois. O ponto final do "time." (Roaming Throne,
  // LCI 344) ficava a 1 px da arte rosa que sobe simétrica dos dois lados do selo, e a folga o
  // guardava como um pingo branco. Um pedaço quase branco e sem cor que não tem parte clara do
  // selo (acima de 150) a até 2 px é letra e sai da folga, com a borda dele mais clara que o
  // selo em volta (senão ela ficava como um "c" cinza). O brilho do aro claro, que destoa dos
  // dois lados e não entra na enchente, fica: o aro dele é claro (Adult Gold Dragon, AFR 297).
  const at = (k: number) => ((y0 + Math.floor(k / w)) * img.width + x0 + (k % w)) * 4;
  const white = (k: number) => {
    const i = at(k);
    const span = Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) - Math.min(img.data[i], img.data[i + 1], img.data[i + 2]);
    return luminance(img.data, i) > 200 && span < 40;
  };
  const light = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) if (inside[k] && luminance(img.data, at(k)) > 150) light[k] = 1;
  const nearLight = morph(light, w, h, r, true);
  // o menor sinal impresso, o ponto, tem uns 3 × 3 px brancos; pingo branco de 1 ou 2 px é o
  // grão do brilho do aro ou da arte (o aro em degradê do Pteranodonte, REX 44) e fica
  const minPiece = Math.max(3, Math.round(4 * unit * unit));
  const visited = new Uint8Array(w * h);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (visited[s0] || !grown[s0] || !white(s0)) continue;
    const comp = [s0];
    visited[s0] = 1;
    let keep = false;
    for (let j = 0; j < comp.length; j++) {
      const k = comp[j];
      if (nearLight[k]) keep = true;
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const q = ny * w + nx;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || visited[q] || !white(q)) continue;
          visited[q] = 1;
          comp.push(q);
        }
    }
    if (keep || comp.length < minPiece) continue;
    // o mais claro do selo em volta do pedaço: a borda do pedaço acima disso sai junto
    let ceiling = 0;
    const around = (k: number, visit: (q: number) => void) => {
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) visit(ny * w + nx);
        }
    };
    for (const k of comp)
      around(k, (q) => {
        if (inside[q]) ceiling = Math.max(ceiling, luminance(img.data, at(q)));
      });
    for (const k of comp) {
      grown[k] = 0;
      around(k, (q) => {
        if (!inside[q] && luminance(img.data, at(q)) > ceiling) grown[q] = 0;
      });
    }
  }
  const out: Rect[] = [];
  for (let y = 0; y < h; y++) {
    let a = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && grown[y * w + x];
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        out.push({ x0: x0 + a, y0: y0 + y, x1: x0 + x, y1: y0 + y + 1 });
        a = -1;
      }
    }
  }
  return out;
}

/**
 * Ruído fino da arte atrás da caixa sem borda, em tons: o desvio típico (robusto) de cada
 * pixel em relação à média 5 × 5 dele, só no que não é letra branca. Uma arte impressa com
 * retícula grossa (a gravura do Shivan Dragon da Secret Lair, 22 tons; as outras amostras,
 * de 0 a 13) não sai da rede neural: o remendo fica com outra textura e a forma das linhas
 * apagadas aparece em faixas. Acima de 16 tons a carta sai na original.
 */
export function screenNoise(img: ImageData, box: Rect): number {
  const x0 = Math.round(box.x0);
  const y0 = Math.round(box.y0);
  const w = Math.round(box.x1) - x0;
  const h = Math.round(box.y1) - y0;
  if (w <= 0 || h <= 0) return 0;
  const lum = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = luminance(img.data, ((y0 + y) * img.width + x0 + x) * 4);
      lum[y * w + x] = v;
      hist[Math.round(v)]++;
    }
  const t = otsu(hist) - 10;
  const ones = new Float32Array(w * h).fill(1);
  const mean = boxMean(lum, ones, w, h, Math.max(2, Math.round((2 * img.width) / BASE_W)));
  const dev: number[] = [];
  for (let k = 0; k < w * h; k += 2) if (lum[k] < t) dev.push(Math.abs(lum[k] - mean[k]));
  if (!dev.length) return 0;
  dev.sort((a, b) => a - b);
  return dev[dev.length >> 1] * 1.4826;
}
