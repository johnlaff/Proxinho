/**
 * Moldura das naves e planetas com Posicionar (Station, desde Edge of Eternities, 2025).
 *
 * A caixa de texto é a da carta comum, translúcida, com a arte aparecendo por trás. Embaixo do
 * texto principal vem uma faixa por nível ("2+", "8+"), cada uma mais escura que a de cima, com
 * a mesma arte atrás. Cada faixa tem um selo redondo com o nível, meio para fora da caixa à
 * esquerda, no meio da altura dela; a última, nas criaturas, tem a caixa de P/R à direita, na
 * mesma altura do selo. As faixas são do tamanho do texto: a última vai até o pé da caixa e o
 * selo de cada uma fica no meio dela.
 *
 * O texto em PT não tem a explicação do "Posicionar" (nunca saiu impressa em PT) e ocupa menos
 * linhas no alto. Como nas artes estendidas, que já vêm sem a explicação, as faixas mudam de
 * lugar: o motor tira o escurecimento delas, apaga as letras, os selos e a caixa de P/R com a
 * rede neural, escurece de novo as faixas onde o texto em PT pede e cola selos e P/R no meio
 * delas.
 *
 * Medidas na escala-base de 745 × 1040 (PNG do Scryfall), conferidas nas artes de moldura
 * preta de EOE, EOC, TRK, TRC e nas promos.
 */
import type { RegionMask } from "./erase";
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const STATION = {
  /** miolo da caixa: logo abaixo do fio da barra de tipo até o fio claro do pé */
  box: { y0: 656, y1: 956 },
  /** colunas que a faixa escurece: a caixa, do fio da esquerda (49 a 54) ao da direita (688 a 693) */
  band: { x0: 55, x1: 688 },
  /** onde o texto começa: o principal e o das faixas (depois do selo); onde acaba */
  text: { main: 66, level: 90, right: 680 },
  /** selo do nível: centro em x e raio de fora (o anel claro); o miolo escuro tem uns 23 */
  badge: { cx: 49.5, r: 30 },
  /**
   * colunas refeitas na vertical onde estavam os selos (a moldura da esquerda) e onde começa o
   * que se refaz embaixo da caixa de P/R (a beira sombreada da caixa, de 684 a 687, o fio e a
   * moldura da direita, até o anel)
   */
  frame: { left: [16, 55] as const, right: 684 },
  /**
   * a caixa de P/R: até onde o miolo escuro vai para os lados (a moldura escura à direita, a
   * partir de 694, emendava com ele) e a folga do recorte em volta do miolo de cada linha: dos
   * lados, o anel e a beira cinza dele vão até 7 px depois do miolo (com um retângulo de cantos
   * arredondados medido no alto e no pé do miolo, mais curto que no meio, a ponta do anel ficava
   * cortada, uma beira reta com um fio claro, The Seriema); em cima, o anel tem 6; embaixo, o
   * anel e a sombra descem 8 (com a folga só do anel, a moldura refeita pegava o anel claro e
   * ficava um risco claro embaixo do P/R). Na moldura (a partir de `frame`), fica de fora do
   * recorte o que tem a cor da moldura acima ou abaixo da caixa, a até `near` tons: o anel escuro
   * das molduras de artefato passa por miolo, a folga ia até a moldura e levava o escuro dela
   * para o meio da arte que desce pelo lado (Entropic Battlecruiser)
   */
  pt: { x0: 590, x1: 699, side: 8, top: 7, bottom: 9, frame: 694, near: 28 },
  /**
   * a faixa de papel logo acima do selo da coleção que fica fora do buraco da rede neural (a
   * última linha em inglês acaba 8 px ou mais acima do aro dele)
   */
  stampGap: 5,
  /**
   * o fim do texto da última faixa (a caixa da linha, que já tem o pé das letras) fica até aqui
   * acima do retângulo do selo da coleção (que começa 4 px acima do aro): a linha de base fica uns
   * 13 px acima do aro, como no inglês
   */
  stampClear: 4,
  /**
   * a mancha da máscara a partir de `area` px que fica de fora se não tem tinta (`inkOnly`), e a
   * folga em volta dela onde se mede o papel
   */
  ink: { area: 60, pad: 6 },
  /** a faixa mais baixa que cabe o selo com folga (o inglês tem de 75 a 100) */
  minBand: 66,
  /** folga mínima entre o texto e o começo ou o fim da faixa */
  minGap: 6,
};

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export interface StationText {
  /** o texto antes dos níveis (com o "Posicionar") */
  main: string;
  /** cada nível: o rótulo do selo ("9+") e as habilidades dele */
  levels: { label: string; text: string }[];
}

const LEVEL = /^(\d+\+) \| (.*)$/;

/**
 * Separa o texto em PT (com os níveis marcados pelo pipeline como o Oracle: "9+ | Voar,
 * iniciativa") no texto principal e nas habilidades de cada nível. `null` sem nível, sem texto
 * principal ou com nível vazio: a carta sai na original.
 */
export function stationText(text: string | null | undefined): StationText | null {
  if (!text) return null;
  const main: string[] = [];
  const levels: { label: string; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const m = LEVEL.exec(line);
    if (m) levels.push({ label: m[1], lines: [m[2]] });
    else if (levels.length) levels[levels.length - 1].lines.push(line);
    else main.push(line);
  }
  if (!levels.length || !main.join("").trim() || levels.some((l) => !l.lines.join("").trim())) return null;
  return { main: main.join("\n"), levels: levels.map((l) => ({ label: l.label, text: l.lines.join("\n") })) };
}

/**
 * Pé da caixa (escala-base): a primeira linha preta da borda abaixo dela (mediana de x 100 a
 * 300 abaixo de 60), menos o fio claro de 8 px. `null` quando não acha a borda.
 */
export function stationBottom(img: ImageData): number | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  for (let y = 935; y < 990; y++) {
    const v: number[] = [];
    const yy = Math.round(y * fy);
    for (let x = Math.round(100 * fx); x < Math.round(300 * fx); x += 2) v.push(lum(img.data, (yy * img.width + x) * 4));
    v.sort((a, b) => a - b);
    if (v[v.length >> 1] < 60) return y - 8;
  }
  return null;
}

/**
 * Os selos dos níveis (escala-base): o centro de cada um, de cima para baixo. O miolo do selo é
 * escuro num anel de raio 21 a 22 em volta do centro, rente à borda dele (o miolo tem 23 a 24),
 * e só os arcos de cima e de baixo contam: os números brancos ficam a até 10 px acima e abaixo
 * do centro, mas com dois algarismos e o "+" vão quase de um lado ao outro do miolo ("10+",
 * "20+": com o anel inteiro, ou com raio 18, o Dawnsire e o The Eternity Elevator saíam na
 * original). Cada selo dá uma faixa de linhas seguidas com os arcos escuros: o centro é o meio
 * dela.
 */
export function stationBadges(img: ImageData, from: number = STATION.box.y0, to: number = STATION.box.y1): number[] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const points: [number, number][] = [];
  for (const r of [21, 22])
    for (let a = 0; a < 48; a++) {
      const sin = Math.sin((a / 48) * 2 * Math.PI);
      if (Math.abs(sin) >= 0.6) points.push([Math.cos((a / 48) * 2 * Math.PI) * r, sin * r]);
    }
  const dark = (cy: number) => {
    let n = 0;
    for (const [dx, dy] of points) {
      const x = Math.round((STATION.badge.cx + dx) * fx);
      const y = Math.round((cy + dy) * fy);
      if (y >= 0 && y < img.height && lum(img.data, (y * img.width + x) * 4) < 95) n++;
    }
    return n / points.length;
  };
  const centers: number[] = [];
  let run: number[] = [];
  const close = () => {
    if (run.length >= 2) centers.push(Math.round((run[0] + run[run.length - 1]) / 2));
    run = [];
  };
  for (let y = from + 20; y <= to - 20; y++) {
    if (dark(y) >= 0.95) run.push(y);
    else close();
  }
  close();
  return centers;
}

/**
 * As faixas a partir dos selos (escala-base): cada selo fica no meio da sua faixa e a última
 * vai até o pé da caixa, então os limites saem de baixo para cima. Devolve o alto de cada faixa,
 * ou `null` quando uma faixa sai menor que o selo ou passa do alto da caixa (não é a moldura).
 */
export function stationBands(centers: number[], bottom: number, top: number = STATION.box.y0): number[] | null {
  const tops: number[] = [];
  let below = bottom;
  for (let i = centers.length - 1; i >= 0; i--) {
    const t = 2 * centers[i] - below;
    if (below - t < 2 * STATION.badge.r || t <= top + 10) return null;
    tops.unshift(t);
    below = t;
  }
  return tops;
}

/** A caixa de P/R: o retângulo do recorte e o miolo escuro, linha a linha (escala-base). */
export interface PtBox extends Rect {
  /** a primeira linha do miolo */
  top: number;
  /** onde o miolo começa e acaba em cada linha, de cima para baixo (a última coluna escura) */
  spans: [number, number][];
}

/**
 * A caixa de P/R na faixa de baixo (escala-base), na altura do selo `center`: o miolo escuro de
 * ponta a ponta (x 600 a 690) 18 linhas acima e 18 abaixo do centro, fora dos números (o "3/10"
 * do Entropic Battlecruiser vai até 680), e dali para cima e para baixo as linhas com o meio
 * escuro (x 612 a 680; com as pontas, o canto arredondado do miolo ficava de fora, e o recorte
 * deixava o anel de cima para trás). Em cada linha o miolo vai de 606 para a esquerda e de 684 para a direita
 * enquanto for escuro; a linha que começa num número fica com o miolo da vizinha. Devolve o
 * retângulo com a folga do anel, ou `null` sem caixa de P/R (as naves que não viram criatura e
 * os planetas).
 */
export function stationPt(img: ImageData, center: number): PtBox | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const darkAt = (x: number, y: number) => lum(img.data, (Math.round(y * fy) * img.width + Math.round(x * fx)) * 4) < 95;
  const darkRow = (y: number, x0: number, x1: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (darkAt(x, y)) n++;
    return n / (x1 - x0) > 0.9;
  };
  const inner = (y: number) => darkRow(y, 612, 680);
  if (!darkRow(center - 18, 600, 690) || !darkRow(center + 18, 600, 690)) return null;
  let y0 = center - 18;
  while (y0 > center - 40 && inner(y0 - 1)) y0--;
  let y1 = center + 18;
  while (y1 < center + 40 && inner(y1 + 1)) y1++;
  const spans: ([number, number] | null)[] = [];
  for (let y = y0; y <= y1; y++) {
    if (!darkAt(606, y) || !darkAt(684, y)) {
      spans.push(null);
      continue;
    }
    let l = 606;
    while (l > STATION.pt.x0 && darkAt(l - 1, y)) l--;
    let r = 684;
    while (r < STATION.pt.x1 && darkAt(r + 1, y)) r++;
    spans.push([l, r]);
  }
  // as linhas com número nas pontas ficam com o miolo da vizinha mais perto
  const filled = spans.map((s, i) => {
    for (let d = 0; !s && d < spans.length; d++) s = spans[i - d] ?? spans[i + d] ?? null;
    return s ?? ([606, 684] as [number, number]);
  });
  const { side, top, bottom } = STATION.pt;
  return {
    x0: Math.min(...filled.map((s) => s[0])) - side,
    y0: y0 - top,
    x1: Math.max(...filled.map((s) => s[1])) + 1 + side,
    y1: y1 + 1 + bottom,
    top: y0,
    spans: filled,
  };
}

/**
 * A forma do recorte da caixa de P/R (escala da imagem, `fx` e `fy` a partir da escala-base):
 * tudo a até `side` colunas do miolo de cada linha para os lados, `top` linhas acima e `bottom`
 * abaixo, com a borda suavizada. Segue a ponta abaulada do anel; o resto do retângulo (os cantos
 * e a moldura ao lado) fica de fora.
 */
export function ptShape(pt: PtBox, fx: number, fy: number) {
  const { side, top, bottom } = STATION.pt;
  return (x: number, y: number) => {
    const bx = x / fx;
    const by = y / fy;
    let best = Infinity;
    const from = Math.max(0, Math.floor(by - bottom) - 1 - pt.top);
    const to = Math.min(pt.spans.length - 1, Math.ceil(by + top) + 1 - pt.top);
    for (let i = from; i <= to; i++) {
      const row = pt.top + i;
      const [l, r] = pt.spans[i];
      const dx = Math.max(l - bx, 0, bx - (r + 1));
      const dy = by < row ? (row - by) / top : by > row + 1 ? (by - row - 1) / bottom : 0;
      best = Math.min(best, Math.hypot(dx / side, dy));
    }
    return Math.max(0, Math.min(1, ((1 - best) * side) / 1.5 + 0.5));
  };
}

/** Se o ponto (escala da imagem) está no miolo escuro da caixa de P/R. */
export function ptCore(pt: PtBox, fx: number, fy: number) {
  return (x: number, y: number) => {
    const span = pt.spans[Math.floor(y / fy) - pt.top];
    return Boolean(span) && x / fx >= span[0] && x / fx < span[1] + 1;
  };
}

/**
 * Quanto cada faixa escurece a de cima, por canal (escala da imagem): a mediana da razão entre
 * as linhas logo abaixo do limite (`y` + 3 a 5) e logo acima (`y` − 5 a − 3), nas colunas sem
 * letra (as duas mais claras que a mediana da linha menos 20). A arte por trás é a mesma dos
 * dois lados do limite: a razão é só o escurecimento da faixa (~0,87 nas molduras brancas; nas
 * coloridas, cada canal de um jeito).
 */
export function shadeRatio(img: ImageData, y: number, x0: number, x1: number): [number, number, number] {
  const above: number[][] = [];
  const below: number[][] = [];
  for (let x = x0; x < x1; x++) {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    for (let d = 3; d <= 5; d++)
      for (let c = 0; c < 3; c++) {
        a[c] += img.data[((y - d) * img.width + x) * 4 + c] / 3;
        b[c] += img.data[((y + d) * img.width + x) * 4 + c] / 3;
      }
    above.push(a);
    below.push(b);
  }
  const l = (v: number[]) => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  const med = (v: number[]) => v.slice().sort((p, q) => p - q)[v.length >> 1];
  const la = med(above.map(l));
  const lb = med(below.map(l));
  const ok = above.map((a, i) => l(a) > la - 20 && l(below[i]) > lb - 20);
  return [0, 1, 2].map((c) => {
    const r = above.flatMap((a, i) => (ok[i] && a[c] > 8 ? [below[i][c] / a[c]] : []));
    return r.length ? Math.min(1.3, Math.max(0.5, med(r))) : 1;
  }) as [number, number, number];
}

/**
 * Escurecimento por linha (escala da imagem) com as faixas que começam em `tops`, cada uma com
 * a razão `ratios[i]` sobre a de cima: 1 acima da primeira e, em cada limite, uma rampa de 5
 * linhas (o limite da moldura é suave).
 */
export function shadeProfile(height: number, tops: number[], ratios: [number, number, number][]): Float32Array[] {
  const out = [0, 1, 2].map(() => new Float32Array(height).fill(1));
  for (let c = 0; c < 3; c++) {
    let k = 1;
    let y = 0;
    tops.forEach((t, i) => {
      const next = k * ratios[i][c];
      for (; y < height && y < t - 2; y++) out[c][y] = k;
      for (; y < height && y <= t + 2; y++) out[c][y] = k + ((next - k) * (y - (t - 2) + 1)) / 6;
      k = next;
    });
    for (; y < height; y++) out[c][y] = k;
  }
  return out;
}

/**
 * Multiplica (ou divide, com `lift`) cada pixel das colunas `x0` a `x1` das linhas `y0` a `y1`
 * pelo escurecimento da linha (`profile`, indexado a partir de `y0`). `skip` diz os pixels que
 * ficam como estão (o selo da coleção holográfico no pé da caixa).
 */
export function applyShade(
  img: ImageData,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  profile: Float32Array[],
  lift = false,
  skip: Rect[] = [],
): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (skip.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) continue;
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const k = profile[c][y - y0];
        img.data[i + c] = lift ? img.data[i + c] / k : img.data[i + c] * k;
      }
    }
}

/**
 * Guarda os pixels dos retângulos e devolve a função que os põe de volta. Tirar o escurecimento
 * corta em 255 o que é mais claro que o escurecimento deixa (o aro branco do selo da coleção
 * impresso por cima dele), e pôr de novo deixa esse pixel cinza: o alto do aro, na faixa de
 * papel acima do selo que a rede neural vê, saía com um degrau cinza (Lumen-Class Frigate,
 * promo). Na última faixa o escurecimento é o mesmo antes e depois, e o original volta igual.
 */
export function holdPixels(img: ImageData, rects: Rect[]): () => void {
  const pieces = rects.map((r) => cutPiece(img, r, () => 1));
  return () => pieces.forEach((p) => pastePiece(img, p, 0));
}

/** Um pedaço da imagem com transparência por pixel (selo ou caixa de P/R). */
export interface Piece {
  x0: number;
  y0: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  alpha: Float32Array;
}

/**
 * Recorta o retângulo `r` (escala da imagem) com a transparência de `shape(x, y)` (1 dentro,
 * 0 fora, o meio na borda suavizada).
 */
export function cutPiece(img: ImageData, r: Rect, shape: (x: number, y: number) => number): Piece {
  const x0 = Math.round(r.x0);
  const y0 = Math.round(r.y0);
  const width = Math.round(r.x1) - x0;
  const height = Math.round(r.y1) - y0;
  const data = new Uint8ClampedArray(width * height * 4);
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + width) * 4), y * width * 4);
    for (let x = 0; x < width; x++) alpha[y * width + x] = shape(x0 + x + 0.5, y0 + y + 0.5);
  }
  return { x0, y0, width, height, data, alpha };
}

/** Cola o pedaço `dy` linhas abaixo (ou acima) de onde ele foi recortado. */
export function pastePiece(img: ImageData, piece: Piece, dy: number): void {
  for (let y = 0; y < piece.height; y++) {
    const yy = piece.y0 + y + dy;
    if (yy < 0 || yy >= img.height) continue;
    for (let x = 0; x < piece.width; x++) {
      const a = piece.alpha[y * piece.width + x];
      if (!a) continue;
      const i = (yy * img.width + piece.x0 + x) * 4;
      const j = (y * piece.width + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c] * (1 - a) + piece.data[j + c] * a);
    }
  }
}

/** Disco de raio `r` em volta de (cx, cy), com a borda suavizada em 1,5 px. */
export function disk(cx: number, cy: number, r: number) {
  return (x: number, y: number) => Math.max(0, Math.min(1, (r - Math.hypot(x - cx, y - cy)) / 1.5 + 0.5));
}

/**
 * A forma `shape` com a moldura de fora (escala da imagem, `r` o retângulo do recorte): da
 * coluna `frameX` em diante, fora do miolo (`core`), o pixel com a cor da mesma coluna logo
 * acima ou logo abaixo do retângulo (a até `near` tons em cada canal) não é anel, é moldura ou
 * a arte que desce por ela. O miolo fica sempre: o escuro dele é quase o da moldura. Medida uma
 * vez, antes de mexer na imagem.
 */
export function withoutFrame(
  img: ImageData,
  r: Rect,
  shape: (x: number, y: number) => number,
  core: (x: number, y: number) => boolean,
  frameX: number,
  near: number,
) {
  const x0 = Math.round(r.x0);
  const y0 = Math.round(r.y0);
  const width = Math.round(r.x1) - x0;
  const height = Math.round(r.y1) - y0;
  const above = Math.max(0, y0 - 3);
  const below = Math.min(img.height - 1, y0 + height + 2);
  const alpha = new Float32Array(width * height);
  const close = (i: number, j: number) =>
    Math.abs(img.data[i] - img.data[j]) <= near &&
    Math.abs(img.data[i + 1] - img.data[j + 1]) <= near &&
    Math.abs(img.data[i + 2] - img.data[j + 2]) <= near;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const xx = x0 + x;
      const i = ((y0 + y) * img.width + xx) * 4;
      const frame =
        xx >= frameX && !core(xx + 0.5, y0 + y + 0.5) && (close(i, (above * img.width + xx) * 4) || close(i, (below * img.width + xx) * 4));
      alpha[y * width + x] = frame ? 0 : shape(xx + 0.5, y0 + y + 0.5);
    }
  return (x: number, y: number) => {
    const xx = Math.floor(x) - x0;
    const yy = Math.floor(y) - y0;
    return xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : alpha[yy * width + xx];
  };
}

/**
 * Refaz as colunas `x0` a `x1` das linhas `y0` a `y1` (escala da imagem) misturando, em cada
 * coluna, a linha logo acima e a logo abaixo: a moldura dos lados da caixa (fio preto, faixa
 * colorida e fios claros) é vertical, e o selo ou a caixa de P/R que saiu deixava um buraco nela.
 * Com `inside` (a forma do recorte), só o que estava dentro dele, cada trecho da coluna entre o
 * pixel de fora logo acima e o logo abaixo; o resto fica como está.
 */
export function restoreFrame(
  img: ImageData,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  inside?: (x: number, y: number) => number,
): void {
  const covered = (x: number, y: number) => !inside || inside(x + 0.5, y + 0.5) > 0;
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1;) {
      if (!covered(x, y)) {
        y++;
        continue;
      }
      let end = y;
      while (end < y1 && covered(x, end)) end++;
      const above = Math.max(0, y - (inside ? 1 : 2));
      const below = Math.min(img.height - 1, end + (inside ? 0 : 1));
      const a = (above * img.width + x) * 4;
      const b = (below * img.width + x) * 4;
      for (let yy = y; yy < end; yy++) {
        const t = (yy - above) / (below - above);
        const i = (yy * img.width + x) * 4;
        for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[a + c] * (1 - t) + img.data[b + c] * t);
      }
      y = end;
    }
  }
}

/**
 * Uma cópia da imagem com a caixa espelhada para fora dos dois lados (`pad` colunas antes de
 * `xl` e depois de `xr`, nas linhas `y0` a `y1`, escala da imagem), e as máscaras espelhadas
 * junto. O buraco dos selos e da caixa de P/R encosta na beira da caixa: com a moldura ao lado,
 * a rede neural puxava o escuro da beira para dentro dele (um quadrado cinza onde estava o P/R
 * do Entropic Battlecruiser); com o espelho, ela só vê arte em volta. Da cópia só volta a caixa.
 */
export function mirrorSides(
  img: ImageData,
  masks: RegionMask[],
  y0: number,
  y1: number,
  xl: number,
  xr: number,
  pad: number,
): { img: ImageData; masks: RegionMask[] } {
  const data = new Uint8ClampedArray(img.data);
  const out =
    typeof ImageData === "undefined"
      ? ({ width: img.width, height: img.height, data, colorSpace: img.colorSpace } as ImageData)
      : new ImageData(data, img.width, img.height);
  const holeAt = (x: number, y: number) =>
    masks.some((m) => {
      const r = m.rect;
      return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && m.mask[(y - r.y0) * (r.x1 - r.x0) + x - r.x0] > 0;
    });
  const side = (from: number, to: number, mirror: (x: number) => number): RegionMask => {
    const w = to - from;
    const mask = new Uint8Array(w * (y1 - y0));
    for (let y = y0; y < y1; y++)
      for (let x = from; x < to; x++) {
        const sx = mirror(x);
        const i = (y * img.width + x) * 4;
        const j = (y * img.width + sx) * 4;
        for (let c = 0; c < 4; c++) out.data[i + c] = img.data[j + c];
        if (holeAt(sx, y)) mask[(y - y0) * w + x - from] = 1;
      }
    return { rect: { x0: from, y0, x1: to, y1 }, mask, polarity: "dark" };
  };
  return {
    img: out,
    masks: [
      ...masks,
      side(Math.max(0, xl - pad), xl, (x) => 2 * xl - 1 - x),
      side(xr, Math.min(img.width, xr + pad), (x) => 2 * xr - 1 - x),
    ],
  };
}

/** As máscaras só nas colunas `x0` a `x1` (o resto vira papel conhecido para a rede neural). */
export function clipMasks(masks: RegionMask[], x0: number, x1: number): RegionMask[] {
  return masks.map((m) => {
    const w = m.rect.x1 - m.rect.x0;
    if (m.rect.x0 >= x0 && m.rect.x1 <= x1) return m;
    const mask = m.mask.slice();
    for (let i = 0; i < mask.length; i++) {
      const x = m.rect.x0 + (i % w);
      if (x < x0 || x >= x1) mask[i] = 0;
    }
    return { ...m, mask };
  });
}

/**
 * Só a tinta das letras: as manchas grandes da máscara sem nenhum ponto bem mais escuro que o
 * papel em volta saem dela. A caixa é translúcida, e uma pedra escura da arte atrás passava por
 * letra e sumia no preenchimento (EOE 85). As letras são pretas e a parte mais escura delas fica
 * abaixo de `ratio` do papel; a pedra, uns 35 tons abaixo de 185. Manchas pequenas ficam como
 * estão (ponto, vírgula, pé de letra solto).
 */
export function inkOnly(img: ImageData, m: RegionMask, minArea: number, pad: number, ratio = 0.6): RegionMask {
  const { x0, y0, x1, y1 } = m.rect;
  const w = x1 - x0;
  const h = y1 - y0;
  const d = img.data;
  const mask = m.mask.slice();
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const hist = new Uint32Array(256);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp: number[] = [];
    let darkest = 255;
    let cx0 = w;
    let cy0 = h;
    let cx1 = 0;
    let cy1 = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const x = k % w;
      const y = (k - x) / w;
      darkest = Math.min(darkest, lum(d, ((y0 + y) * img.width + x0 + x) * 4));
      cx0 = Math.min(cx0, x);
      cx1 = Math.max(cx1, x);
      cy0 = Math.min(cy0, y);
      cy1 = Math.max(cy1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
    }
    if (comp.length < minArea) continue;
    // o papel: a mediana do que não é máscara em volta da mancha
    hist.fill(0);
    let count = 0;
    for (let y = Math.max(0, cy0 - pad); y <= Math.min(h - 1, cy1 + pad); y++)
      for (let x = Math.max(0, cx0 - pad); x <= Math.min(w - 1, cx1 + pad); x++) {
        if (m.mask[y * w + x]) continue;
        hist[Math.round(lum(d, ((y0 + y) * img.width + x0 + x) * 4))]++;
        count++;
      }
    if (!count) continue;
    let paper = 0;
    for (let acc = hist[0]; acc < count / 2 && paper < 255;) acc += hist[++paper];
    if (darkest > paper * ratio) for (const k of comp) mask[k] = 0;
  }
  return { ...m, mask };
}

export interface StationPlan {
  /** alto do texto principal */
  mainTop: number;
  /** cada faixa: onde começa e onde começa o texto dela */
  bands: { top: number; textTop: number }[];
}

/**
 * Distribui a caixa (de `top` a `bottom`) entre o texto principal (`mainH`) e o de cada nível
 * (`levelH`), como o Proxyshop e as artes estendidas: a mesma folga acima e abaixo de cada
 * texto, e cada faixa começa no meio da folga entre o texto de cima e o dela. Faixa mais baixa
 * que `STATION.minBand` fica com essa altura, com o texto no meio, e a folga das outras é
 * refeita. `below` é o mínimo entre o fim do texto da última faixa e o pé da caixa: o selo da
 * coleção sobe para dentro da caixa, e a última linha que passa por cima dele ficava encostada
 * no aro (The Eternity Elevator, The Seriema). Com ele maior que a folga, a última faixa fica com
 * `below` embaixo do texto e a folga das outras é refeita. `null` quando a folga fica menor que
 * `STATION.minGap` (não cabe).
 */
export function stationPlan(mainH: number, levelH: number[], top: number, bottom: number, below = 0): StationPlan | null {
  const n = levelH.length;
  const fixed = new Array<boolean>(n).fill(false);
  let gap = 0;
  const height = (i: number) => levelH[i] + gap + (i === n - 1 ? Math.max(gap, below) : gap);
  for (let pass = 0; pass <= n; pass++) {
    const fixedH = fixed.filter(Boolean).length * STATION.minBand;
    const freeH = mainH + levelH.reduce((s, h, i) => s + (fixed[i] ? 0 : h), 0);
    const blocks = 1 + fixed.filter((f) => !f).length;
    gap = (bottom - top - fixedH - freeH) / (2 * blocks);
    if (!fixed[n - 1] && below > gap) gap = (bottom - top - fixedH - freeH - below) / (2 * blocks - 1);
    let changed = false;
    levelH.forEach((_, i) => {
      if (!fixed[i] && height(i) < STATION.minBand) fixed[i] = changed = true;
    });
    if (!changed) break;
  }
  if (gap < STATION.minGap) return null;
  const mainTop = top + gap;
  let y = mainTop + mainH + gap;
  const bands = levelH.map((h, i) => {
    const size = fixed[i] ? STATION.minBand : height(i);
    // (a última faixa com a altura mínima: o texto no meio dela, ou mais acima, longe do selo)
    let textTop = fixed[i] ? y + (size - h) / 2 : y + gap;
    if (fixed[i] && i === n - 1) textTop = Math.min(textTop, bottom - below - h);
    if (textTop - y < STATION.minGap) return null;
    const band = { top: Math.round(y), textTop: Math.round(textTop) };
    y += size;
    return band;
  });
  if (bands.some((b) => !b)) return null;
  return { mainTop: Math.round(mainTop), bands: bands as StationPlan["bands"] };
}
