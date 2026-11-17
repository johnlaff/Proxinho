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

/** Onde apagar e escrever numa ficha, a partir da barra encontrada. */
export interface TokenLayout {
  /** nome (faixa do alto) */
  title: Rect;
  /** linha de tipo */
  type: Rect & { centerY: number };
  /** caixa de texto; `null` nas fichas sem texto (a barra fica no pé) */
  box: { erase: Rect; text: Rect } | null;
}

export function tokenLayout(bar: TokenBar, setLeft: number, boxBottom: number): TokenLayout {
  const setX = Math.min(Math.max(setLeft, 560), 650);
  // nas fichas sem texto a barra desce até y ≈ 850 e abaixo dela só há arte
  const hasBox = bar.y1 < 860 && boxBottom - bar.y1 > 40;
  return {
    title: TOKEN.title.erase,
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
