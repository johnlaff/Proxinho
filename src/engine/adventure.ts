/**
 * Moldura de Aventura (Throne of Eldraine, 2019, em diante; o Presságio de Tarkir: Dragonstorm
 * tem as mesmas medidas). Nome, tipo, custo e P/R são os da M15; a caixa de texto é um livro
 * aberto. Na página da esquerda vêm a barra do nome da aventura (com o custo dela no fim), a
 * barra do tipo ("Feitiço — Aventura") e as regras da aventura; na da direita, as regras e o
 * flavor da criatura. As medidas são da escala-base (745 × 1040), conferidas em ELD, WOE, CLB,
 * HOB, MOC, FIN e TDM.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const median = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1] ?? 0;

export const ADVENTURE = {
  /** barra do nome da aventura: letra branca sobre a barra escura, custo de mana no fim (`center`: o meio das letras em inglês) */
  name: { x0: 50, y0: 655, x1: 366, y1: 697, x: 62, center: 679, size: 27 },
  /** barra do tipo da aventura, logo abaixo, também de letra branca */
  type: { x0: 50, y0: 701, x1: 362, y1: 745, x: 62, center: 725, size: 26 },
  /**
   * o custo da aventura acaba em x ≈ 356; cada símbolo ocupa ~31,5 px (com o vão), e os híbridos
   * e phyrexianos, desenhados maiores, ~35,5 px (os quatro {G/W} do Bring Back, ELD 212, começam
   * em x = 213)
   */
  costRight: 356,
  costSymbol: 31.5,
  costHybrid: 35.5,
  /** página da esquerda, abaixo das barras; o topo, o pé e a lombada são medidos (`adventureBook`) */
  left: { x0: 52, textX0: 62, textX1: 352, textBottom: 940 },
  /** página da direita: as regras e o flavor da criatura, com a caixa de P/R no canto */
  right: { y0: 656, x1: 690, textX0: 396, textX1: 682, textY0: 664 },
  /**
   * Do pé da página para cima até aqui, só o que se liga às letras de cima sai (a sombra do pé
   * da página não é letra; o pé de uma letra da última linha é)
   */
  attachedBelow: 946,
  /** maior corpo do texto das páginas (o inglês fica entre 24 e 30) */
  maxSize: 30,
  /**
   * digitalização clara demais: papel da página da esquerda a partir de `paper` e menos de
   * `contrast` tons entre a barra do nome e o mais claro das letras dela (percentil 99). Nas
   * promos de pré-estreia que saíam com o inglês por baixo, papel de 242 a 251 e contraste de 25
   * a 49; nas outras, papel até 235 (com contraste de 65 para cima) ou contraste a partir de 54
   * (com papel até 226)
   */
  washed: { paper: 238, contrast: 52 },
  /**
   * limiar da máscara das duas barras, abaixo do 28 das barras do nome e do tipo: com 28, pontas
   * suavizadas das letras (20 a 28 tons acima de uma barra cinza clara) ficavam fora da máscara e
   * o remendo da linha saía como um risco claro atravessando o nome em PT (Birthright Boon da
   * pré-estreia de WOE)
   */
  barThreshold: 20,
} as const;

/** O livro achado na imagem (escala-base). */
export interface AdventureBook {
  /** primeira linha de papel abaixo da barra do tipo, na página da esquerda */
  leftTop: number;
  /** a coluna mais escura da lombada, entre as páginas */
  spine: number;
  /** primeira linha abaixo do papel das páginas (a sombra do pé do livro) */
  bottom: number;
}

/**
 * Confere na imagem a moldura de Aventura: a lombada (uma coluna escura entre as páginas, mais
 * escura que o papel dos dois lados em quase todas as linhas) e as barras da aventura (bem mais
 * escuras que o papel da página da esquerda, abaixo delas). Devolve o topo do papel da página da
 * esquerda, a coluna da lombada e o pé das páginas; sem as duas pistas, `null`, e a carta sai na
 * original.
 */
export function adventureBook(img: ImageData): AdventureBook | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const at = (x: number, y: number) => lum(img.data, (y * img.width + x) * 4);
  const rowMedian = (x0: number, x1: number, y: number) => {
    const row: number[] = [];
    for (let x = Math.round(x0 * fx); x < Math.round(x1 * fx); x++) row.push(at(x, y));
    return median(row);
  };
  // papel de cada página (a mediana das linhas: as letras ocupam bem menos da metade)
  const leftRows: number[] = [];
  let spine = 0;
  let rows = 0;
  const sx0 = Math.round(360 * fx);
  const cols: number[][] = Array.from({ length: Math.round(384 * fx) - sx0 }, () => []);
  for (let yb = 770; yb <= 930; yb += 4) {
    const y = Math.round(yb * fy);
    const l = rowMedian(70, 330, y);
    const r = rowMedian(400, 660, y);
    leftRows.push(l);
    let low = 255;
    cols.forEach((c, i) => {
      const v = at(sx0 + i, y);
      c.push(v);
      low = Math.min(low, v);
    });
    rows++;
    if (low < Math.min(l, r) - 40) spine++;
  }
  if (spine < rows * 0.7) return null;
  const paper = median(leftRows);
  // a barra do tipo: as linhas do meio dela, na largura da página
  const barRows: number[] = [];
  for (let yb = 708; yb <= 738; yb += 2) barRows.push(rowMedian(70, 330, Math.round(yb * fy)));
  if (paper - median(barRows) < 35) return null;
  // as letras brancas do nome da aventura quase somem nas digitalizações claras demais (promos de
  // pré-estreia de ELD e CLB: Chop Down, Cast Off, Ysgard's Call): o apagamento não as pegava e o
  // inglês ficava por baixo do português. Com o papel quase branco e pouco contraste entre a
  // barra e o mais claro dela, sai a original.
  const name: number[] = [];
  for (let y = Math.round(662 * fy); y < Math.round(690 * fy); y++)
    for (let x = Math.round(62 * fx); x < Math.round(300 * fx); x++) name.push(at(x, y));
  name.sort((a, b) => a - b);
  const contrast = name[Math.floor(name.length * 0.99)] - name[Math.floor(name.length / 2)];
  if (paper >= ADVENTURE.washed.paper && contrast < ADVENTURE.washed.contrast) return null;
  // o papel começa logo abaixo da barra (e do filete da caixa, no Presságio de TDM)
  let leftTop: number | null = null;
  for (let yb = 740; yb <= 768 && leftTop === null; yb++) {
    const y = Math.round(yb * fy);
    if (rowMedian(70, 330, y) >= paper - 20 && rowMedian(70, 330, y + Math.max(1, Math.round(fy))) >= paper - 20) leftTop = yb;
  }
  if (leftTop === null) return null;
  // a lombada: a coluna de tom mediano mais escuro (de 372 a 375 nas coleções conferidas)
  const colMedians = cols.map((c) => median(c));
  const darkest = colMedians.indexOf(Math.min(...colMedians));
  // o pé das páginas: a sombra escura logo abaixo do papel (entre 955 e 960)
  let bottom = 956;
  for (let yb = 944; yb <= 975; yb++) {
    if (rowMedian(70, 330, Math.round(yb * fy)) < paper - 30) {
      bottom = yb;
      break;
    }
  }
  return { leftTop, spine: Math.round((sx0 + darkest) / fx), bottom };
}

/**
 * Onde começa o custo de mana da aventura, no fim da barra do nome dela. Contados como os outros,
 * os símbolos híbridos deixavam o apagamento comer o primeiro deles e o nome em PT encostava nele.
 */
export function adventureCostLeft(manaCost: string | null | undefined): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  return ADVENTURE.costRight - symbols.reduce((w, s) => w + (s.includes("/") ? ADVENTURE.costHybrid : ADVENTURE.costSymbol), 0);
}

/** As duas barras e as duas páginas, a apagar e a escrever (escala-base). */
export function adventureLayout(book: AdventureBook, manaCost: string | null | undefined) {
  const cost = adventureCostLeft(manaCost);
  const { name, type, left, right } = ADVENTURE;
  const top = book.leftTop + 2;
  return {
    name: { rect: { x0: name.x0, y0: name.y0, x1: Math.min(name.x1, cost - 5), y1: name.y1 }, x: name.x, maxWidth: cost - 6 - name.x },
    type: { rect: { x0: type.x0, y0: type.y0, x1: type.x1, y1: type.y1 }, x: type.x, maxWidth: type.x1 - 8 - type.x },
    // (as páginas vão até a lombada, sem o fio dela: a sombra que escurece o papel até ali sai
    // antes de apagar, ver pageShade; parando antes dela, as letras que chegam perto da lombada
    // deixavam pingos)
    left: {
      erase: { x0: left.x0, y0: top, x1: book.spine - 3, y1: book.bottom } satisfies Rect,
      text: { x0: left.textX0, y0: top + 6, x1: Math.min(left.textX1, book.spine - 16), y1: left.textBottom } satisfies Rect,
    },
    right: {
      erase: { x0: book.spine + 4, y0: right.y0, x1: right.x1, y1: book.bottom } satisfies Rect,
    },
  };
}

/**
 * Tom do papel de cada coluna de uma página (escala da imagem): o percentil 60 da coluna (as
 * letras ocupam bem menos da metade dela), alisado entre colunas vizinhas. O papel escurece em
 * direção à lombada, numa faixa de até 100 px na página da direita; com a máscara medida contra
 * a média em volta, a beira mais escura do retângulo virava "letra" e o remendo, mais claro,
 * deixava um degrau na sombra (ver `shadePage`).
 */
export function pageShade(img: ImageData, rect: Rect): Float32Array {
  const x0 = Math.round(rect.x0);
  const x1 = Math.round(rect.x1);
  const y0 = Math.round(rect.y0);
  const y1 = Math.round(rect.y1);
  const raw = new Float32Array(Math.max(0, x1 - x0));
  const col: number[] = [];
  for (let x = x0; x < x1; x++) {
    col.length = 0;
    for (let y = y0; y < y1; y++) col.push(lum(img.data, (y * img.width + x) * 4));
    col.sort((a, b) => a - b);
    raw[x - x0] = Math.max(1, col[Math.floor(col.length * 0.6)] ?? 1);
  }
  const r = Math.max(2, Math.round((4 * img.width) / BASE_W));
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(raw.length - 1, i + r); j++, n++) sum += raw[j];
    out[i] = sum / n;
  }
  return out;
}

/**
 * Tira a sombra de `pageShade` de uma página: cada coluna é clareada até o tom da coluna mais
 * clara, e a página fica com o papel por igual, como o de uma carta comum. Devolve a função que
 * põe a sombra de volta: o que o apagamento não mexeu volta exatamente como era, e o remendo
 * ganha a sombra da coluna dele. Muda a imagem no lugar. (Escurecer até a coluna mais escura
 * tirava contraste das letras longe da lombada: o {T} cinza do Midgar, FIN 286, saía da máscara
 * e ficava.)
 */
export function shadePage(img: ImageData, rect: Rect, shade: Float32Array): () => void {
  const x0 = Math.round(rect.x0);
  const y0 = Math.round(rect.y0);
  const y1 = Math.round(rect.y1);
  const w = shade.length;
  let ref = 0;
  for (const v of shade) ref = Math.max(ref, v);
  const before = new Uint8ClampedArray(w * Math.max(0, y1 - y0) * 4);
  const flat = new Uint8ClampedArray(before.length);
  for (let y = y0; y < y1; y++)
    for (let i = 0; i < w; i++) {
      const p = (y * img.width + x0 + i) * 4;
      const q = ((y - y0) * w + i) * 4;
      const k = ref / shade[i];
      for (let c = 0; c < 3; c++) {
        before[q + c] = img.data[p + c];
        img.data[p + c] = img.data[p + c] * k;
        flat[q + c] = img.data[p + c];
      }
    }
  return () => {
    for (let y = y0; y < y1; y++)
      for (let i = 0; i < w; i++) {
        const p = (y * img.width + x0 + i) * 4;
        const q = ((y - y0) * w + i) * 4;
        const kept = img.data[p] === flat[q] && img.data[p + 1] === flat[q + 1] && img.data[p + 2] === flat[q + 2];
        for (let c = 0; c < 3; c++) img.data[p + c] = kept ? before[q + c] : (img.data[p + c] * shade[i]) / ref;
      }
  };
}
