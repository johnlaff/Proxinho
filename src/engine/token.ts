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
import { maskRegions } from "./erase";

export const TOKEN = {
  /** faixa do nome: fios em y ≈ 50 e 109, nome centralizado em versalete */
  title: { erase: { x0: 60, y0: 57, x1: 685, y1: 104 }, centerY: 81, x0: 70, x1: 675, size: 36 },
  /** o tipo começa em x ≈ 62, como nas cartas comuns; a barra vai até a borda, e o apagador começa em 50 */
  typeX: 62,
  typeEraseX0: 50,
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
  const lo = Math.round(TOKEN.barMin * fy);
  const hi = Math.round(TOKEN.barMax * fy);
  // `tight`: o par mais justo ganha antes da nota (no fio fraco, a borda de baixo da
  // arte, uns 12 px acima, marcava mais que o fio de verdade)
  const search = (minTop: number, minBottom: number, tight: boolean) => {
    let best: { score: number; a: number; b: number } | null = null;
    for (let a = from; a <= to; a++) {
      if (top[a] < minTop) continue;
      for (let b = a + lo; b <= Math.min(a + hi, to); b++) {
        if (bottom[b] < minBottom) continue;
        const score = Math.min(top[a], bottom[b]);
        const h = b - a;
        const better = !best
          ? true
          : tight
            ? h < best.b - best.a || (h === best.b - best.a && score > best.score)
            : // empate: fica o par mais justo (a arte escura logo acima do fio também "passa")
              score > best.score || (score === best.score && h <= best.b - best.a);
        if (better) best = { score, a, b };
      }
    }
    return best;
  };
  // Ficha de duas cores com papel claro em cima de metade da barra (Espírito branco e
  // preto, EVE): ali o fio de cima some no papel. Sem par nenhum, aceita o fio de cima
  // em metade da largura quando o de baixo atravessa a carta quase inteira.
  const best = search(0.85, 0.85, false) ?? search(0.5, 0.97, true);
  if (!best) return null;
  return { y0: best.a / fy, y1: best.b / fy };
}

/**
 * Onde começa a ponta arredondada da barra de tipo (escala-base): o fio de cima segue escuro
 * até a ponta arredondada. O símbolo da coleção fica sempre antes dela; procurar
 * além confundia a ponta com o símbolo e apagava um pedaço dele (Golem EOC, Murf TTRK).
 */
export function findTokenBarEnd(img: ImageData, bar: TokenBar): number {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const lum = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  };
  let best = 0;
  for (let dy = -2; dy <= 2; dy++) {
    const y = Math.round(bar.y0 * fy) + dy;
    if (y < 0 || y >= img.height) continue;
    let x = Math.round(560 * fx);
    let gap = 0;
    let end = x;
    for (; x < img.width; x++) {
      if (lum(x, y) < 90) {
        end = x;
        gap = 0;
      } else if (++gap > Math.max(3, Math.round(6 * fx))) break;
    }
    best = Math.max(best, end / fx);
  }
  // o fio de cima ainda acompanha o começo da curva da ponta (~9 px): desconta.
  // Sem fio reconhecível, a medida das fichas comuns.
  return best > 640 && best < BASE_W - 20 ? best - 9 : 690;
}

/**
 * Fio claro (brilho) no pé da caixa, logo acima da borda escura. Em algumas fichas a
 * borda de baixo é mais baixa e o brilho fica dentro da área apagada: sumia, e só o
 * pedaço protegido ao lado do P/R sobrava. Devolve o y (escala-base) da primeira linha
 * do brilho, ou `null`.
 */
export function findBoxHighlight(img: ImageData, boxBottom: number): number | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const rowLums = (y: number) => {
    const iy = Math.round(y * fy);
    const out: number[] = [];
    for (let x = Math.round(100 * fx); x < Math.round(500 * fx); x += 2) out.push(lum(img.data, (iy * img.width + x) * 4));
    return out;
  };
  const rowMean = (y: number) => {
    const l = rowLums(y);
    return l.reduce((a, b) => a + b, 0) / l.length;
  };
  const mid = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1];
  // o papel de referência é a mediana de cada linha, não a média: com a última linha de
  // texto descendo até aqui (emblema do Daretti) a tinta puxava a média para baixo, o
  // papel comum passava por "brilho" e a área apagada encurtava para cima das letras
  const ref: number[] = [];
  for (let y = boxBottom - 40; y < boxBottom - 22; y++) ref.push(mid(rowLums(y)));
  const paper = mid(ref);
  let top: number | null = null;
  for (let y = Math.round(boxBottom) - 1; y > boxBottom - 16; y--) {
    if (rowMean(y) > paper + 18) top = y;
    else if (top !== null) break;
  }
  return top;
}

/**
 * Selo de promoção (oval com arte holográfica, embaixo no centro, ex.: fichas de FNM)
 * ou a aba triangular das fichas de dupla face, que invadem o pé da caixa de texto. Ele aparece claro na borda preta logo abaixo da
 * caixa. Devolve o retângulo do selo dentro da caixa (escala-base) para não ser
 * apagado, ou `null`. `maxRise` limita a altura: nas cartas o texto desce até perto do
 * selo, e letra em cima dele não pode virar "selo" (ficava sem apagar). `reach` é até
 * onde procurar a borda preta abaixo da caixa (algumas molduras têm uma faixa clara antes dela).
 */
export function findStamp(img: ImageData, boxBottom: number, maxRise = 60, reach = 20): Rect | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const lum = (x: number, y: number) => {
    const i = (Math.round(y * fy) * img.width + Math.round(x * fx)) * 4;
    return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  };
  const rowMean = (y: number, x0: number, x1: number) => {
    let s = 0;
    for (let x = x0; x < x1; x++) s += lum(x, y);
    return s / (x1 - x0);
  };
  // primeira linha da borda preta abaixo da caixa
  let border = -1;
  for (let y = Math.round(boxBottom); y < Math.min(BASE_H - 2, boxBottom + reach); y++) {
    if (rowMean(y, 100, 300) < 60) {
      border = y + 3;
      break;
    }
  }
  // o selo destoa da borda preta (a aba de duas faces pode ser cinza-escura: compara
  // com a própria borda, não com um valor fixo)
  if (border < 0) return null;
  const black = rowMean(border, 100, 300);
  if (rowMean(border, 345, 400) < black + 25) return null;
  const lit = black + 20;
  // largura do selo nessa linha, a partir do centro. O miolo pode ter desenho escuro
  // bem no meio (a mão do selo de Strixhaven): pula trechos escuros de até 24 px, senão
  // a largura ficava zero e a cúpula escura em volta do selo saía cortada de um lado
  let x0 = 372;
  let x1 = 372;
  for (let x = 371, gap = 0; x > 250 && gap <= 24; x--)
    if (lum(x, border) > lit) {
      x0 = x;
      gap = 0;
    } else gap++;
  for (let x = 373, gap = 0; x < 495 && gap <= 24; x++)
    if (lum(x, border) > lit) {
      x1 = x;
      gap = 0;
    } else gap++;
  // topo: sobe enquanto o miolo destoa do papel da caixa ao lado (o selo tem um aro
  // claro: só para depois de seis linhas seguidas iguais ao papel). Conta a fração de
  // pixels diferentes, não a média: uma linha de texto passando por cima do selo
  // mudava a média e "esticava" o selo até ela, que ficava sem apagar.
  // (toda a largura do selo: o miolo de um selo holográfico é claro como o papel, e
  // só olhando o meio a busca parava antes da cúpula escura em volta dele)
  const cx = (x0 + x1) / 2;
  const half = Math.max(6, (x1 - x0) / 2);
  let top = border;
  let same = 0;
  for (let y = border - 1; y > Math.max(boxBottom - 60, border - maxRise) && same < 6; y--) {
    const side: number[] = [];
    for (let x = 150; x < 280; x += 2) side.push(lum(x, y));
    side.sort((a, b) => a - b);
    const paper = side[side.length >> 1];
    let off = 0;
    let all = 0;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++, all++) if (Math.abs(lum(x, y) - paper) > 25) off++;
    if (off < all * 0.5) same++;
    else {
      same = 0;
      top = y;
    }
  }
  // a aba triangular é mais larga no alto que na linha da borda: mede a largura em
  // cada linha do selo (até o papel voltar por três pixels seguidos) e fica com a maior
  let l = x0;
  let r = x1;
  for (let y = top; y < border; y++) {
    const side: number[] = [];
    for (let x = 150; x < 280; x += 2) side.push(lum(x, y));
    side.sort((a, b) => a - b);
    const paper = side[side.length >> 1];
    // linha em que o "papel" ao lado tem letras (o pé da última linha de texto) não
    // serve de referência: a mediana caía no cinza da borda delas, o papel de verdade
    // virava "selo" e a largura ia até o limite; o pé de um ")" ao lado do selo ficava
    // protegido, sem apagar (Thundering Raiju, NEO)
    if (side.filter((v) => Math.abs(v - paper) <= 25).length < side.length * 0.8) continue;
    const reachOut = (dir: number) => {
      let x = cx;
      let calm = 0;
      let last = cx;
      while (calm < 3 && x > 200 && x < 545) {
        x += dir;
        if (Math.abs(lum(x, y) - paper) > 25) {
          calm = 0;
          last = x;
        } else calm++;
      }
      return last;
    };
    l = Math.min(l, reachOut(-1));
    r = Math.max(r, reachOut(1));
  }
  // (com limite: uma letra encostada no selo não pode puxar a proteção por cima dela)
  return { x0: Math.max(x0 - 45, Math.min(x0 - 22, l - 6)), y0: top - 4, x1: Math.min(x1 + 45, Math.max(x1 + 22, r + 6)), y1: border };
}

/**
 * O selo das cartas (o da M15 e o da sem borda): procura a borda preta a partir de y = 948,
 * com até 26 px de subida. Na sem borda a caixa é escura até o pé, abaixo de 60 tons: a
 * "borda preta" era achada ainda dentro da caixa, ali o selo não acendia e a carta ficava
 * sem proteção nenhuma no selo; o aro claro em volta dele era apagado e o remendo deixava um
 * degrau no aro (Reassembling Skeleton, SLD 1406, e mais 22 de 183 amostras). Sem selo assim,
 * tenta de novo a partir do pé medido da caixa (`boxBottom`, escala-base).
 */
export function findCardStamp(img: ImageData, boxBottom?: number): Rect | null {
  return findStamp(img, 948, 26, 30) ?? (boxBottom === undefined ? null : findStamp(img, boxBottom, 26, 30));
}

/**
 * A proteção do selo seguindo o contorno dele, linha a linha (em pixels da imagem). O
 * retângulo de `findStamp` tem folga para os lados, e a cúpula escura em volta do selo
 * sobe em curva: nos cantos de cima do retângulo fica papel, e ali cai o pé da última
 * linha de texto, que ficava protegido, sem apagar (os pés do "l." de "control." ao lado
 * do selo da Dança Macabra, AFC). Protege, em cada linha, a largura do que destoa do papel
 * e se liga à borda preta abaixo da caixa (a cúpula, o selo, a borda), com 3 px de folga,
 * mais o que fica a até 14 px disso (o fio cinza do chanfro em volta da aba de Final
 * Fantasy, solto da aba por uma fresta de papel: Chave da Cidade, FIC). Acima da cúpula,
 * a largura da primeira linha dela (o aro claro do selo nem sempre destoa do papel). O pé
 * de uma letra mais longe, separado da cúpula por papel, fica de fora.
 */
export function stampShape(img: ImageData, stamp: Rect): Rect[] {
  const fx = img.width / BASE_W;
  const X0 = Math.max(0, Math.round(stamp.x0));
  const X1 = Math.min(img.width, Math.round(stamp.x1));
  const Y0 = Math.max(0, Math.round(stamp.y0));
  const Y1 = Math.min(img.height, Math.round(stamp.y1));
  const w = X1 - X0;
  const h = Y1 - Y0;
  if (w <= 0 || h <= 0) return [stamp];
  const lum = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  };
  const side: number[] = [];
  for (let y = Y0; y < Y1; y++) for (let x = Math.round(150 * fx); x < Math.round(280 * fx); x += 2) side.push(lum(x, y));
  side.sort((a, b) => a - b);
  const paper = side[side.length >> 1];
  // manchas (vizinhança de 4) do que destoa do papel
  const label = new Int32Array(w * h).fill(-1);
  let count = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (label[s] >= 0 || Math.abs(lum(X0 + (s % w), Y0 + Math.floor(s / w)) - paper) <= 25) continue;
    label[s] = count;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && label[j] < 0 && Math.abs(lum(X0 + (j % w), Y0 + Math.floor(j / w)) - paper) > 25) {
          label[j] = count;
          stack.push(j);
        }
    }
    count++;
  }
  // a mancha da borda preta (as que tocam a última linha) e a largura dela em cada linha
  const base = new Uint8Array(count);
  for (let x = 0; x < w; x++) if (label[(h - 1) * w + x] >= 0) base[label[(h - 1) * w + x]] = 1;
  const lo = new Int32Array(h).fill(w);
  const hi = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (label[y * w + x] >= 0 && base[label[y * w + x]]) {
        lo[y] = Math.min(lo[y], x);
        hi[y] = Math.max(hi[y], x);
      }
  // as outras manchas entram quando chegam a até 14 px dela, nas linhas vizinhas
  const near = Math.round(14 * fx);
  const keep = Uint8Array.from(base);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = label[y * w + x];
      if (l < 0 || keep[l]) continue;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++)
        if (hi[yy] >= 0 && x >= lo[yy] - near && x <= hi[yy] + near) {
          keep[l] = 1;
          break;
        }
    }
  const pad = Math.max(1, Math.round(3 * fx));
  const spans: ([number, number] | null)[] = [];
  for (let y = 0; y < h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++) {
      const l = label[y * w + x];
      if (l >= 0 && keep[l]) {
        if (a < 0) a = x;
        b = x;
      }
    }
    spans.push(a < 0 ? null : [a, b]);
  }
  const first = spans.findIndex((s) => s !== null);
  if (first < 0) return [stamp];
  const out: Rect[] = [];
  for (let y = 0; y < h; y++) {
    // cada linha cobre também as duas de cima e as duas de baixo (a borda suavizada)
    let a = Infinity;
    let b = -Infinity;
    for (let j = Math.max(first, y - 2); j <= Math.min(h - 1, Math.max(first, y + 2)); j++) {
      const s = spans[j];
      if (!s) continue;
      a = Math.min(a, s[0]);
      b = Math.max(b, s[1]);
    }
    if (a > b) continue;
    out.push({ x0: Math.max(X0, X0 + a - pad), y0: Y0 + y, x1: Math.min(X1, X0 + b + 1 + pad), y1: Y0 + y + 1 });
  }
  return out;
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
  // A borda de baixo continua escura por várias linhas. O fio fino entre as regras e o
  // flavor (Boo, AFR) também escurece a largura toda, mas o papel volta logo abaixo: ele
  // passava por pé da caixa, o flavor ficava fora do apagamento e saía em inglês. O
  // escuro é medido contra o papel 2d acima: logo abaixo do fio do flavor pode vir um
  // filete claro, e contra ele o papel comum também parecia borda (SLD 1681).
  const darker = (y: number, ref: number) => edgeScore(img, y, ref - y, x0, x1);
  const persists = (y: number) => {
    let dark = 0;
    for (let k = 3; k <= 6; k++) if (darker(y + Math.round(k * fy), y - 2 * d) > 0.5) dark++;
    return dark >= 3;
  };
  for (let y = Math.round((bar.y1 + 30) * fy); y < Math.min(img.height, Math.round(1000 * fy)); y++) {
    if (darker(y, y - d) > 0.7 && persists(y)) return y / fy;
  }
  return TOKEN.boxBottom;
}

/**
 * Moldura de 2003: faixa do nome numa oval escura entre x ≈ 145 e 600, e a barra de tipo
 * mais curta, com a ponta esquerda arredondada e um fio escuro em "(" de x ≈ 52 a 59. O
 * papel começa em x ≈ 60 (62 nas linhas de cima e de baixo, pela curva) e o tipo em inglês
 * em x ≈ 71, igual em THS, M14, SOM e ALA. Apagando a partir de 50, como na moldura nova,
 * o fio entrava na máscara e a ponta da barra virava um retângulo claro.
 */
export const TOKEN_2003 = {
  title: { erase: { x0: 152, y0: 60, x1: 593, y1: 104 }, centerY: 82, x0: 165, x1: 580, size: 32 },
  typeX: 70,
  typeEraseX0: 64,
  ptBox: { x0: 546, y0: 916, x1: BASE_W, y1: BASE_H },
} as const;

/** Onde apagar e escrever numa ficha, a partir da barra encontrada. */
export interface TokenLayout {
  /** nome (faixa do alto): onde apagar e onde escrever */
  title: Rect;
  name: { centerY: number; x0: number; x1: number; size: number };
  /** caixa de P/R, que nunca é apagada */
  pt: Rect;
  /** símbolo da coleção, protegido do apagador */
  symbol: Rect;
  /** linha de tipo: onde apagar e, em `x`, onde o tipo em português começa */
  type: Rect & { centerY: number; x: number };
  /** caixa de texto; `null` nas fichas sem texto (a barra fica no pé) */
  box: { erase: Rect; text: Rect } | null;
}

export function tokenLayout(
  bar: TokenBar,
  setLeft: number,
  boxBottom: number,
  frame: string | null = "2015",
  barEnd = 690,
  highlight: number | null = null,
): TokenLayout {
  const setX = Math.min(Math.max(setLeft, 560), 650);
  // nas fichas sem texto a barra desce até y ≈ 850 e abaixo dela só há arte
  const hasBox = bar.y1 < 860 && boxBottom - bar.y1 > 40;
  const f = frame === "2003" ? TOKEN_2003 : TOKEN;
  const { erase, ...name } = f.title;
  return {
    title: erase,
    name,
    pt: f.ptBox,
    symbol: { x0: setX - 1, y0: bar.y0 + 3, x1: barEnd, y1: bar.y1 - 3 },
    type: { x0: f.typeEraseX0, y0: bar.y0 + 5, x1: setX - 6, y1: bar.y1 - 4, centerY: (bar.y0 + bar.y1) / 2, x: f.typeX },
    box: hasBox
      ? {
          erase: { x0: 56, y0: bar.y1 + 5, x1: 683, y1: Math.min(boxBottom - 6, (highlight ?? BASE_H) - 1) },
          text: { x0: 68, y0: bar.y1 + 12, x1: 677, y1: boxBottom - 10 },
        }
      : null,
  };
}

/**
 * Caixa de P/R a proteger do apagador. Emblemas e fichas sem P/R (Tesouro) não têm a caixa:
 * o canto de baixo também é texto em inglês e precisa ser apagado.
 */
export function tokenPtBox(layout: Pick<TokenLayout, "pt">, pt: string | null | undefined): Rect | null {
  return pt === null ? null : layout.pt;
}

/**
 * O nome em inglês da ficha (`span`, escala-base) é alinhado à esquerda, como o das
 * cartas? Algumas fichas da Secret Lair têm a moldura de carta, com nome próprio na
 * esquerda ("The Black Beast of Aaargh", o Marit Lage da SLD 1681): em versalete
 * centralizado o português destoava do resto. Começa perto da ponta da barra e o meio
 * fica longe do meio dela.
 */
export function titleIsLeftAligned(span: { x0: number; x1: number }, bar: { x0: number; x1: number }): boolean {
  return span.x0 < bar.x0 + 30 && Math.abs((span.x0 + span.x1) / 2 - (bar.x0 + bar.x1) / 2) > 60;
}

/**
 * O título em inglês de um emblema (largura `measured`, medida na imagem) é a palavra
 * "Emblem" (emblemas até 2019) ou o nome do planeswalker? `word` e `name` são as larguras
 * dos dois no corpo do nosso título; o impresso é ~1,25 vez maior, até a largura da barra
 * (`room`), onde os nomes compridos são apertados. Fica com a mais perto, em proporção.
 */
export function titleIsEmblemWord(measured: number, word: number, name: number, room = Infinity): boolean {
  const off = (w: number) => Math.abs(Math.log(measured / Math.min(w * 1.25, room)));
  return off(word) < off(name);
}

/**
 * As linhas de texto da máscara de uma caixa, cada uma com o começo e o fim (em pixels, a partir
 * do lado esquerdo da máscara): as faixas de linhas cheias de letra com 8 px de altura ou mais.
 * Em cada linha, um pingo solto a mais de 40 px das letras fica de fora (ver `textCentered`).
 */
export function textLines(m: { rect: Rect; mask: Uint8Array }, fx: number): { left: number; right: number }[] {
  const w = m.rect.x1 - m.rect.x0;
  const h = m.rect.y1 - m.rect.y0;
  if (!m.mask.length || w <= 0 || h <= 0) return [];
  const perRow = new Uint16Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) perRow[y] += m.mask[y * w + x];
  // linhas de texto: faixas de linhas cheias de letra (um quarto da mais cheia), emendando
  // vãos de até 2 px. Entre as linhas sobram o pé das letras e a marca-d'água do emblema
  const full = Math.max(2, Math.max(...perRow) * 0.25);
  const lines: [number, number][] = [];
  const gap = Math.max(2, Math.round(2 * fx));
  let a = -1;
  let last = -1;
  for (let y = 0; y < h; y++) {
    if (perRow[y] < full) continue;
    if (a < 0) a = y;
    else if (y - last > gap + 1) {
      lines.push([a, last]);
      a = y;
    }
    last = y;
  }
  if (a >= 0) lines.push([a, last]);
  const ext: { left: number; right: number }[] = [];
  for (const [y0, y1] of lines) {
    if (y1 - y0 + 1 < 8 * fx) continue;
    const col = new Uint16Array(w);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) col[x] += m.mask[y * w + x];
    // trechos de colunas separados por mais de 40 px; fica o de mais letra, com os vizinhos
    // a menos disso. Um pingo da textura longe das letras (as bolhas da caixa da ficha
    // Pássaro de P03) fazia o "Flying" do meio "começar" na margem: saía à esquerda
    const far = Math.round(40 * fx);
    const runs: { left: number; right: number; ink: number }[] = [];
    for (let x = 0; x < w; x++) {
      if (col[x] < 2) continue;
      const r = runs[runs.length - 1];
      if (r && x - r.right <= far) {
        r.right = x;
        r.ink += col[x];
      } else runs.push({ left: x, right: x, ink: col[x] });
    }
    if (!runs.length) continue;
    const main = runs.reduce((a, b) => (b.ink > a.ink ? b : a));
    // (um pedaço pequeno fica de fora; dois blocos grandes de texto, os dois contam)
    const kept = runs.filter((r) => r === main || r.ink >= main.ink * 0.25);
    ext.push({ left: Math.min(...kept.map((r) => r.left)), right: Math.max(...kept.map((r) => r.right)) });
  }
  return ext;
}

/**
 * O texto em inglês da caixa (máscara das letras) está centralizado? Com duas linhas ou
 * mais: centralizado, o começo muda de uma linha para outra e o meio fica no lugar
 * (emblemas do Domri Rade, MM3, e do Basri Ket, M21); alinhado à esquerda, o começo fica
 * (Sephiroth, FIN). Uma linha só conta como centralizada quando começa bem depois da
 * margem e o meio dela cai no meio da caixa (Wrenn and Seven, INR: o português quebra em
 * duas linhas, e elas saem centralizadas como a do original). Uma linha só que começa na
 * margem e acaba bem antes do fim é alinhada à esquerda (Druida Elfo, CMM; Boo, AFR): o
 * português, em uma linha, saía centralizado. `null` quando não dá para dizer (sem
 * linha, ou uma linha comprida que vai de um lado ao outro). Com `margin` (escala-base), o
 * texto alinhado à esquerda começa no máximo a `margin` px do lado da caixa, e o que começa
 * depois disso é centralizado, mesmo com as linhas da mesma largura (o "Destroy target /
 * enchantment." do Wane, INV 296) ou numa linha só (o "Destroy target land." do Suffering).
 */
export function textCentered(m: { rect: Rect; mask: Uint8Array }, fx: number, margin?: number): boolean | null {
  const w = m.rect.x1 - m.rect.x0;
  const ext = textLines(m, fx);
  if (!ext.length) return null;
  if (ext.length === 1) {
    const { left, right } = ext[0];
    const off = Math.abs((left + right) / 2 - w / 2);
    if (margin !== undefined && left > margin * fx) return true;
    if (left > 30 * fx && off < 12 * fx) return true;
    return left <= 30 * fx && off > 40 * fx ? false : null;
  }
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
  const lefts = spread(ext.map((e) => e.left));
  const mids = spread(ext.map((e) => (e.left + e.right) / 2));
  if (lefts > 12 * fx && mids < lefts / 2) return true;
  // (alinhado à esquerda, as linhas começam na margem; linhas de mesma largura longe
  // dela são centralizadas que por acaso começam juntas: não dá para dizer)
  const first = Math.min(...ext.map((e) => e.left));
  if (margin !== undefined) return first > margin * fx;
  return first <= 30 * fx ? false : null;
}

/**
 * Alinhamento do texto em inglês de uma caixa, medido antes de apagar (`textCentered` sobre
 * as letras fortes). Vale para fichas, emblemas e cartas: alguns feitiços curtos têm o
 * texto centrado (Triumphant Reckoning e Counterspell de CMR, Wrath of God de DMR).
 */
export function measureCentered(
  img: ImageData,
  rect: Rect,
  protect: Rect[],
  fx: number,
  polarity?: "dark" | "light",
  margin?: number,
): boolean | null {
  return textCentered(maskRegions(img, [{ rect, threshold: 60, polarity }], protect)[0], fx, margin);
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

/**
 * Trecho de uma linha da placa de 2003 a repintar, em pixels da imagem ([início, fim)).
 * A medida da placa fica perto do lado de dentro do filete; o recuo fixo de 7 px guardava
 * as pontas arredondadas, mas deixava o pé da última letra quando ela chega perto do
 * filete (o "L" de "Elemental", DD1). Cada ponta procura, de 4 px fora da medida para
 * dentro, o filete (dois pixels seguidos fora da cor de fundo da linha; antes dele, arte
 * escura da cor do fundo é pulada) e para no primeiro par de pixels da cor do fundo
 * depois dele. Fica sempre entre o recuo antigo e 2 px além da medida.
 */
export function plaqueRowSpan(img: ImageData, pl: Plaque, i: number): [number, number] {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const y = Math.round(pl.y0 * fy) + i;
  const [r, g, b] = pl.rows[i];
  const near = (x: number) => {
    const j = (y * img.width + x) * 4;
    return Math.abs(img.data[j] - r) + Math.abs(img.data[j + 1] - g) + Math.abs(img.data[j + 2] - b) < 60;
  };
  // dir: para fora da placa. Devolve a última coluna a repintar naquela ponta.
  const end = (edge: number, dir: 1 | -1) => {
    const inner = Math.round(edge - dir * 7 * fx);
    const outer = Math.round(edge + dir * 2 * fx);
    let x = Math.round(edge + dir * 4 * fx);
    // o filete: o primeiro par de pixels fora da cor do fundo (um grão claro solto da
    // arte escura não conta); depois dele, o primeiro par da cor do fundo
    while (x !== inner && (near(x) || near(x - dir))) x -= dir;
    while (x !== inner && !(near(x) && near(x - dir))) x -= dir;
    if (x === inner) return dir > 0 ? inner - 1 : inner; // sem filete reconhecível: o recuo antigo
    return dir > 0 ? Math.min(x, outer) : Math.max(x, outer);
  };
  return [end(pl.x0 * fx, -1), end(pl.x1 * fx, 1) + 1];
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
 * Fim do filete dourado da placa de 2003, andando do centro para um lado. O filete
 * corre por cima e por baixo da placa; fora dela, a arte escura não tem esse ouro
 * (amarelado e claro). Devolve a função que, para cada lado, dá a coluna onde os dois
 * filetes acabam, ou null se não acha os filetes (arte clara e amarelada ao redor).
 */
function plaqueRimEnd(img: ImageData, bgLum: number, cx: number, limitOf: (dir: 1 | -1) => number) {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const W = img.width;
  const d = img.data;
  const gold = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return lum(d, i) > bgLum + 35 && d[i] - d[i + 2] > 35;
  };
  const span = Math.round(40 * fx);
  const rowGold = (y: number) => {
    let n = 0;
    for (let x = cx - span; x < cx + span; x++) if (gold(x, y)) n++;
    return n / (2 * span);
  };
  // o lado de dentro de cada filete: a primeira linha dourada saindo das letras
  // (o de cima fica entre 54 e 59 na escala-base; o de baixo, entre 100 e 106)
  let top: number | null = null;
  for (let y = Math.round(60 * fy); y >= Math.round(46 * fy) && top === null; y--) if (rowGold(y) >= 0.5) top = y;
  let bot: number | null = null;
  for (let y = Math.round(100 * fy); y <= Math.round(112 * fy) && bot === null; y++) if (rowGold(y) >= 0.5) bot = y;
  const band = Math.max(2, Math.round(3 * fy));
  const rimAt = (x: number) => {
    let up = false;
    let down = false;
    for (let k = 0; k <= band; k++) {
      up ||= gold(x, top! - k);
      down ||= gold(x, bot! + k);
    }
    return up && down;
  };
  const win = Math.max(4, Math.round(8 * fx));
  return (dir: 1 | -1): number | null => {
    if (top === null || bot === null) return null;
    const hits: number[] = [];
    const limit = limitOf(dir);
    for (let x = cx; dir > 0 ? x < limit : x > limit; x += dir) {
      hits.push(rimAt(x) ? 1 : 0);
      if (hits.length >= win && hits.slice(-win).reduce((a, b) => a + b, 0) < win * 0.25) return x - dir * win;
    }
    return null;
  };
}

/**
 * Acha a placa do nome das fichas de 2003: um retângulo escuro de pontas
 * arredondadas, com filete dourado, centrado, cuja largura acompanha o nome. Anda
 * do centro para os lados enquanto a coluna tiver bastante pixel da cor do fundo da
 * placa (as letras douradas ocupam pouco de cada janela de colunas).
 *
 * Arte escura ao lado tem a cor do fundo da placa: nas fichas pretas (Zumbi,
 * Demônio, Espírito) a busca não achava o fim e a ficha ficava em inglês; no céu
 * estrelado do Golem e na sombra da ponta do Goblin (10E) ela passava do filete e a
 * placa repintada cobria a ponta arredondada. Por isso conta também onde acaba o
 * filete dourado de cima e de baixo (`plaqueRimEnd`), e a placa é simétrica: um lado
 * que passa do outro (a cor só erra para fora) fica com o filete ou com o espelho.
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
  // até a borda preta da carta: "Elemental Shaman" e "Tuktuk the Returned" têm a placa
  // quase da largura toda
  const limitOf = (dir: 1 | -1) => (dir > 0 ? Math.round(723 * fx) : Math.round(22 * fx));
  const walk = (dir: 1 | -1) => {
    const scores: number[] = [];
    let x = cx;
    const limit = limitOf(dir);
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
  // fim do filete, levado 3 px para fora: o filete acaba no lado de dentro da ponta
  // arredondada, e a cor acaba no lado de fora
  const rimEnd = plaqueRimEnd(img, bg[3], cx, limitOf);
  const rim = (dir: 1 | -1) => {
    const r = rimEnd(dir);
    return r === null ? null : Math.abs(r + dir * 3 * fx - cx);
  };
  // A cor só erra para fora: além da arte escura, a sombra escura do lado de fora da
  // ponta esquerda passava por fundo, e a placa repintada cobria o filete (Goblin e
  // Saproling da 10E). Quando o filete acaba até 20 px antes, vale o filete; se acaba
  // depois, é arte amarela, e vale a cor.
  const sides = ([-1, 1] as const).map((dir) => {
    const c = walk(dir);
    const hc = c === null ? null : Math.abs(c - cx);
    const hr = rim(dir);
    if (hc === null) return hr;
    return hr !== null && hr <= hc && hr >= hc - 20 * fx ? hr : hc;
  });
  if (sides[0] === null && sides[1] === null) return null;
  // simetria: o lado que passa do outro em mais de 10 px ainda errou para fora (o
  // centro da placa varia uns 4 px entre coleções). Ele fica com o fim do filete, se
  // estiver até 20 px para dentro do espelho do outro lado; senão, com o espelho.
  const half = Math.min(...sides.filter((h): h is number => h !== null));
  const [hl, hr] = sides.map((h, k) => {
    if (h !== null && h <= half + 10 * fx) return h;
    const r = rim(k ? 1 : -1);
    return r !== null && r <= half && r >= half - 20 * fx ? r : half;
  });
  const left = cx - hl;
  const right = cx + hr;
  // "Cat" tem a placa de uns 120 px, medida pelo lado de dentro do filete
  if (right - left < 80 * fx) return null;
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
