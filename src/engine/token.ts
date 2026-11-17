/**
 * Geometria da moldura de ficha (2015 em diante), medida nos PNGs do Scryfall
 * (745 × 1040). Diferente das cartas comuns, a linha de tipo das fichas muda de
 * altura conforme o tamanho do texto: sobe nas fichas com muitas habilidades e
 * desce quase até o pé nas fichas sem texto. Por isso ela é procurada na imagem.
 *
 * A barra de tipo é emoldurada por dois fios escuros finos, ~58 px um do outro,
 * que atravessam quase toda a largura da carta. O fio de cima é mais escuro que
 * o interior da barra logo abaixo dele; o de baixo, mais escuro que o interior
 * logo acima. Conferido em fichas de FDN, LCI, BLB e C21 (claras e escuras).
 *
 * A moldura de ficha de 2003 a 2014 tem a mesma barra e a mesma caixa; muda o
 * nome, numa faixa oval escura e mais estreita, em letras douradas, e a caixa
 * de P/R, um pouco mais à esquerda. Emblemas usam a moldura de ficha.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const TOKEN = {
  /** faixa do nome: fios em y ≈ 50 e 109, nome centralizado em versalete */
  title: { erase: { x0: 60, y0: 57, x1: 685, y1: 104 }, centerY: 81, x0: 70, x1: 675, size: 36 },
  /** o tipo começa em x ≈ 62, como nas cartas comuns */
  typeX: 62,
  typeSize: 30,
  /** caixa do poder/resistência, no pé à direita (não pode ser apagada) */
  ptBox: { x0: 570, y0: 916, x1: BASE_W, y1: BASE_H },
  /** pé da caixa de texto quando o fio de baixo não aparece */
  boxBottom: 958,
  /** a barra tem ~58 px de altura entre os fios */
  barMin: 52,
  barMax: 66,
} as const;

/** Barra de tipo encontrada, na escala-base. */
export interface TokenBar {
  y0: number;
  y1: number;
}

const lum = (d: Uint8ClampedArray, i: number) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

/**
 * Fração da largura (x 80–660) em que a linha `y` é bem mais escura que a
 * linha `y + dy` (o interior da barra).
 */
function edgeScore(img: ImageData, y: number, dy: number, x0: number, x1: number): number {
  const ref = y + dy;
  if (y < 0 || ref < 0 || ref >= img.height || y >= img.height) return 0;
  let hit = 0;
  for (let x = x0; x < x1; x++) {
    if (lum(img.data, (ref * img.width + x) * 4) - lum(img.data, (y * img.width + x) * 4) > 30) hit++;
  }
  return hit / (x1 - x0);
}

/**
 * Procura a barra de tipo da ficha. Devolve `null` quando nenhum par de fios
 * atravessa ao menos 85% da largura (outra moldura, imagem inesperada).
 */
export function findTokenBar(img: ImageData): TokenBar | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const x0 = Math.round(80 * fx);
  const x1 = Math.round(660 * fx);
  const d = Math.max(2, Math.round(4 * fy));
  const from = Math.round(300 * fy);
  const to = Math.min(img.height - d - 1, Math.round(1000 * fy));
  const top = new Float32Array(to + 1);
  const bottom = new Float32Array(to + 1);
  for (let y = from; y <= to; y++) {
    top[y] = edgeScore(img, y, d, x0, x1);
    bottom[y] = edgeScore(img, y, -d, x0, x1);
  }
  let best: { score: number; a: number; b: number } | null = null;
  const lo = Math.round(TOKEN.barMin * fy);
  const hi = Math.round(TOKEN.barMax * fy);
  for (let a = from; a <= to; a++) {
    if (top[a] < 0.85) continue;
    for (let b = a + lo; b <= Math.min(a + hi, to); b++) {
      const score = Math.min(top[a], bottom[b]);
      // empate: fica o par mais justo (a arte escura logo acima do fio também "passa")
      if (score >= 0.85 && (!best || score > best.score || (score === best.score && b - a <= best.b - best.a))) best = { score, a, b };
    }
  }
  if (!best) return null;
  return { y0: best.a / fy, y1: best.b / fy };
}

/**
 * Pé da caixa de texto (escala-base): o primeiro fio escuro abaixo da barra,
 * à esquerda da caixa de P/R. Sem fio (moldura diferente), usa a medida padrão.
 */
export function findTokenBoxBottom(img: ImageData, bar: TokenBar): number {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const d = Math.max(2, Math.round(4 * fy));
  const x0 = Math.round(80 * fx);
  const x1 = Math.round(540 * fx);
  for (let y = Math.round((bar.y1 + 30) * fy); y < Math.min(img.height, Math.round(1000 * fy)); y++) {
    if (edgeScore(img, y, -d, x0, x1) > 0.7) return y / fy;
  }
  return TOKEN.boxBottom;
}

/** Faixa do nome na moldura de 2003 (oval escura entre x ≈ 145 e 600). */
export const TOKEN_2003 = {
  title: { erase: { x0: 152, y0: 60, x1: 593, y1: 104 }, centerY: 82, x0: 165, x1: 580, size: 32 },
  ptBox: { x0: 546, y0: 916, x1: BASE_W, y1: BASE_H },
} as const;

/** Onde apagar e escrever numa ficha, a partir da barra encontrada. */
export interface TokenLayout {
  /** nome (faixa do alto): onde apagar e onde escrever */
  title: Rect;
  name: { centerY: number; x0: number; x1: number; size: number };
  /** caixa de P/R, que nunca é apagada */
  pt: Rect;
  /** linha de tipo */
  type: Rect & { centerY: number };
  /** caixa de texto; `null` nas fichas sem texto (a barra fica no pé) */
  box: { erase: Rect; text: Rect } | null;
}

export function tokenLayout(bar: TokenBar, setLeft: number, boxBottom: number, frame: string | null = "2015"): TokenLayout {
  const setX = Math.min(Math.max(setLeft, 560), 650);
  // nas fichas sem texto a barra desce até y ≈ 850 e abaixo dela só há arte
  const hasBox = bar.y1 < 860 && boxBottom - bar.y1 > 40;
  const f = frame === "2003" ? TOKEN_2003 : TOKEN;
  const { erase, ...name } = f.title;
  return {
    title: erase,
    name,
    pt: f.ptBox,
    type: { x0: 50, y0: bar.y0 + 5, x1: setX - 6, y1: bar.y1 - 4, centerY: (bar.y0 + bar.y1) / 2 },
    box: hasBox
      ? {
          erase: { x0: 56, y0: bar.y1 + 5, x1: 690, y1: boxBottom - 3 },
          text: { x0: 68, y0: bar.y1 + 12, x1: 677, y1: boxBottom - 10 },
        }
      : null,
  };
}

/** Partes do nome em versalete: maiúsculas grandes, o resto em maiúsculas menores. */
export function smallCaps(name: string): { text: string; big: boolean }[] {
  const out: { text: string; big: boolean }[] = [];
  for (const ch of name) {
    const big = ch !== ch.toLowerCase() || !/\p{L}/u.test(ch);
    const last = out[out.length - 1];
    if (last && last.big === big) last.text += ch.toUpperCase();
    else out.push({ text: ch.toUpperCase(), big });
  }
  return out;
}

/** Placa escura do nome nas fichas de 2003, na escala-base, com as cores de fundo e das letras. */
export interface Plaque {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** cor de fundo de cada linha (de y0 a y1, na escala da imagem) */
  rows: [number, number, number][];
  /** cor das letras douradas, "rgb(r,g,b)" */
  ink: string;
}

/**
 * Acha a placa do nome das fichas de 2003: um retângulo escuro de pontas
 * arredondadas, centrado, cuja largura acompanha o nome. Anda do centro para os
 * lados enquanto a coluna tiver bastante pixel da cor do fundo da placa (as
 * letras douradas ocupam pouco de cada janela de colunas).
 */
export function findPlaque2003(img: ImageData): Plaque | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const W = img.width;
  const d = img.data;
  const ys = { a: Math.round(63 * fy), b: Math.round(99 * fy) };
  const cx = Math.round((BASE_W / 2) * fx);
  // cor do fundo: mediana dos pixels escuros do miolo
  const core: number[][] = [];
  for (let y = ys.a; y < ys.b; y++)
    for (let x = cx - Math.round(40 * fx); x < cx + Math.round(40 * fx); x++) {
      const i = (y * W + x) * 4;
      core.push([d[i], d[i + 1], d[i + 2], lum(d, i)]);
    }
  core.sort((a, b) => a[3] - b[3]);
  const bg = core[Math.floor(core.length * 0.3)];
  if (!bg || bg[3] > 90) return null; // a placa é escura
  const near = (i: number) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 60;
  const colScore = (x: number) => {
    let n = 0;
    for (let y = ys.a; y < ys.b; y++) if (near((y * W + x) * 4)) n++;
    return n / (ys.b - ys.a);
  };
  const win = Math.max(6, Math.round(14 * fx));
  const walk = (dir: 1 | -1) => {
    const scores: number[] = [];
    let x = cx;
    const limit = dir > 0 ? Math.round(640 * fx) : Math.round(105 * fx);
    while (dir > 0 ? x < limit : x > limit) {
      scores.push(colScore(x));
      if (scores.length >= win) {
        const avg = scores.slice(-win).reduce((a, b) => a + b, 0) / win;
        if (avg < 0.12) return x - dir * win; // a janela inteira já está fora da placa
      }
      x += dir;
    }
    return null;
  };
  const left = walk(-1);
  const right = walk(1);
  if (left === null || right === null || right - left < 120 * fx) return null;
  // fundo de cada linha (mediana dos pixels próximos da cor da placa), para repintar sem o nome
  const y0 = Math.round(61 * fy);
  const y1 = Math.round(99 * fy);
  const rows: [number, number, number][] = [];
  const bright: number[][] = [];
  for (let y = y0; y < y1; y++) {
    const px: number[][] = [];
    for (let x = left; x < right; x++) {
      const i = (y * W + x) * 4;
      if (near(i)) px.push([d[i], d[i + 1], d[i + 2]]);
      else if (y >= ys.a && y < ys.b && lum(d, i) > bg[3] + 90) bright.push([d[i], d[i + 1], d[i + 2]]);
    }
    const med = (c: number) => (px.length ? px.map((p) => p[c]).sort((a, b) => a - b)[px.length >> 1] : bg[c]);
    rows.push([med(0), med(1), med(2)]);
  }
  const avg = (c: number) => (bright.length ? Math.round(bright.reduce((n, p) => n + p[c], 0) / bright.length) : 214);
  return { x0: left / fx, x1: right / fx, y0: y0 / fy, y1: y1 / fy, rows, ink: `rgb(${avg(0)},${avg(1)},${avg(2)})` };
}
