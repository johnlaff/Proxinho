/**
 * Frente das batalhas (os Cercos de March of the Machine, ADR 0048): a carta de transformar
 * impressa deitada. O motor gira a imagem 90° no sentido horário, como nas Salas (room.ts), e
 * trabalha na carta deitada, de 1040 × 745 na escala-base. A moldura é a das cartas de duas faces
 * da M15, alargada: a barra do nome no alto, com o ícone das de duas faces à esquerda e o custo
 * no fim, a arte, a barra de tipo ("Battle — Siege", com o símbolo da coleção no fim) e a caixa
 * de texto. No canto de baixo da caixa ficam o P/R do verso (cinza, numa ponta de papel que avança
 * para a moldura; a ponta existe também sem P/R) e o escudo da defesa, que avança sobre a moldura.
 * As medidas são da escala-base deitada, conferidas nas 53 frentes de borda preta (MOM, as promos
 * de pré-estreia de PMOM e a reimpressão de INR).
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

export const BATTLE = {
  /** largura e altura da carta deitada (escala-base) */
  width: BASE_H,
  height: BASE_W,
  /**
   * barra do nome: o papel vai de y 37 a 88; a curva da esquerda, depois do ícone, acaba em x ≈ 186
   * e a primeira letra começa em 195; o custo acaba em 968. As maiúsculas do inglês vão de y 50 a 77
   * (o português, escrito em `center`, cai no mesmo lugar)
   */
  name: { x0: 186, x: 196, costRight: 968, y0: 38, y1: 89, center: 64, size: 35 },
  /** cada símbolo do custo ocupa ~38 px com o vão (os híbridos, mais), como na M15 */
  costSymbol: 38,
  costHybrid: 45,
  /**
   * barra de tipo: o papel vai de y 434 a 484; a ponta arredondada da esquerda acaba em x ≈ 125 e
   * a primeira letra começa em 135 (as maiúsculas de y 449 a 472). "Battle — Siege" acaba antes
   * de x 350 e o símbolo da coleção fica entre 905 e 965: o apagamento para bem antes dele
   */
  type: { x0: 125, x1: 620, x: 136, y0: 434, y1: 485, center: 462, size: 30, end: 880 },
  /** os limites do papel da caixa e a parte que fica dentro dela em qualquer impressão */
  box: { x0: 121, y0: 493, x1: 972, y1: 716 },
  boxCore: { x0: 180, y0: 515, x1: 880, y1: 690 },
  /**
   * o texto: o inglês começa em x ≈ 135 e acaba antes de 950, da primeira linha em y ≈ 506 à
   * última antes de 705 (fixo: na moldura branca o lado esquerdo do papel não se distingue dela, e
   * a medida dele vai ao limite)
   */
  text: { x0: 135, y0: 505, x1: 952, y1: 705 },
  maxSize: 34,
  minSize: 15,
  /**
   * o P/R do verso: os algarismos acabam em x 962 e vão de y 607 a 630 (o português é escrito
   * pelo fim da caixa da Beleren, 2 px adiante); a ponta de papel em volta começa em y ≈ 595
   */
  backPt: { right: 964, center: 620.5, top: 595, left: 912 },
  /**
   * o escudo da defesa: a estrela preta vai de x 946 a 1009 e de y 655 a 721 (3 px antes na de
   * INR), com um aro claro e um contorno de ~6 px; `seed` fica no preto da ponta da esquerda,
   * fora do número branco do meio
   */
  shield: { seed: { x: 955, y: 690 }, area: { x0: 900, y0: 630, x1: 1040, y1: 745 }, rim: 6, top: 645, left: 934 },
} as const;

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Percentil `q` (0 a 1) dos tons de um retângulo da carta deitada (escala-base), de 2 em 2 px. */
function percentile(img: ImageData, r: Rect, q: number): number {
  const fx = img.width / BATTLE.width;
  const fy = img.height / BATTLE.height;
  const v: number[] = [];
  for (let y = Math.round(r.y0 * fy); y < Math.round(r.y1 * fy); y += 2)
    for (let x = Math.round(r.x0 * fx); x < Math.round(r.x1 * fx); x += 2) v.push(lum(img.data, (y * img.width + x) * 4));
  v.sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0;
}

/** Mediana de cada linha de `x0` a `x1` (escala-base), a mais escura entre `y0` e `y1`. */
function darkestRow(img: ImageData, x0: number, x1: number, y0: number, y1: number): number {
  let min = 255;
  for (let y = y0; y < y1; y++) min = Math.min(min, percentile(img, { x0, y0: y, x1, y1: y + 1 }, 0.5));
  return min;
}

/**
 * Confere na carta deitada a moldura da batalha: a barra do nome, a de tipo e a caixa claras, o
 * fio escuro abaixo de cada barra (o pé da barra do nome sobre a arte e o fio entre a barra de
 * tipo e a caixa) e o preto do escudo da defesa no canto de baixo. As 53 frentes ficam com as
 * barras acima de 159, a caixa acima de 175, os fios abaixo de 41 e o escudo abaixo de 49. Sem as
 * pistas, a carta sai na original.
 */
export function battleFrame(img: ImageData): boolean {
  if (img.width <= img.height) return false;
  if (percentile(img, { x0: 300, y0: 42, x1: 850, y1: 84 }, 0.8) < 150) return false;
  if (percentile(img, { x0: 400, y0: 438, x1: 880, y1: 480 }, 0.5) < 140) return false;
  if (percentile(img, { x0: 300, y0: 520, x1: 880, y1: 690 }, 0.75) < 150) return false;
  if (darkestRow(img, 300, 880, 88, 100) > 80 || darkestRow(img, 300, 880, 484, 498) > 80) return false;
  if (percentile(img, { x0: 949, y0: 682, x1: 957, y1: 698 }, 0.5) > 80) return false;
  return percentile(img, { x0: 960, y0: 662, x1: 990, y1: 672 }, 0.5) <= 80;
}

/**
 * O papel da caixa de texto, medido na imagem (escala-base): de cada lado, do miolo para fora, até
 * a primeira coluna (ou linha) mais escura que o papel, 3 px para dentro, dentro dos limites de
 * `BATTLE.box`. O fio da moldura branca tem a cor do papel no lado da esquerda (ali a medida vai ao
 * limite, sobre a moldura lisa), mas o bisel cinza do alto e da direita para a medida. O lado da
 * direita é medido acima da ponta do P/R do verso e o pé, antes do escudo.
 */
export function battleBox(img: ImageData): Rect {
  const { box: lim, boxCore: core } = BATTLE;
  const fx = img.width / BATTLE.width;
  const fy = img.height / BATTLE.height;
  const paper = percentile(img, core, 0.8);
  const min = Math.max(120, paper - 30);
  const walk = (from: number, to: number, light: (v: number) => boolean) => {
    const dir = to > from ? 1 : -1;
    let v = from;
    while (v !== to && light(v + dir)) v += dir;
    return v;
  };
  const col = (y0: number, y1: number) => (x: number) => percentile(img, { x0: x, y0, x1: x + 1 / fx, y1 }, 0.8) >= min;
  const row = (y: number) => percentile(img, { x0: 300, y0: y, x1: 880, y1: y + 1 / fy }, 0.8) >= min;
  const inset = 3;
  return {
    x0: Math.min(core.x0, walk(core.x0, lim.x0, col(520, 700)) + inset),
    y0: Math.min(core.y0, walk(core.y0, lim.y0, row) + inset),
    x1: Math.max(core.x1, walk(core.x1, lim.x1, col(510, 585)) - inset),
    y1: Math.max(core.y1, walk(core.y1, lim.y1, row) - inset),
  };
}

/**
 * O escudo da defesa, linha a linha (retângulos na escala da imagem): o preto da estrela, achado
 * pela enchente a partir da ponta da esquerda, com o aro claro e o contorno em volta (`rim`), até
 * o fim da carta. Fica protegido e opaco no apagamento: as letras em inglês chegam a 4 px do aro
 * (a vírgula de "field," no Invasion of Eldraine, MOM 113), e um retângulo do canto as deixava.
 * Sem o preto onde ele fica, devolve `null`.
 */
export function battleShield(img: ImageData): Rect[] | null {
  const S = BATTLE.shield;
  const fx = img.width / BATTLE.width;
  const fy = img.height / BATTLE.height;
  const x0 = Math.round(S.area.x0 * fx);
  const y0 = Math.round(S.area.y0 * fy);
  const x1 = Math.min(img.width, Math.round(S.area.x1 * fx));
  const y1 = Math.min(img.height, Math.round(S.area.y1 * fy));
  const w = x1 - x0;
  const h = y1 - y0;
  const dark = (x: number, y: number) => lum(img.data, ((y0 + y) * img.width + x0 + x) * 4) < 90;
  // a semente: o pixel escuro mais perto da ponta da esquerda da estrela
  let seed = -1;
  const sx = Math.round(S.seed.x * fx) - x0;
  const sy = Math.round(S.seed.y * fy) - y0;
  for (let r = 0; r <= Math.round(4 * fx) && seed < 0; r++)
    for (const [dx, dy] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ])
      if (seed < 0 && dark(sx + dx, sy + dy)) seed = (sy + dy) * w + sx + dx;
  if (seed < 0) return null;
  const seen = new Uint8Array(w * h);
  const stack = [seed];
  seen[seed] = 1;
  const left = new Array<number>(h).fill(w);
  let count = 0;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    count++;
    left[y] = Math.min(left[y], x);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && dark(nx, ny)) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  // a estrela tem ~2500 px na escala-base; muito menos é outra coisa, e muito mais vazou para a
  // borda preta da carta
  const area = count / (fx * fy);
  if (area < 1200 || area > 5000) return null;
  // o aro: cada linha vai até `rim` px antes da estrela nas linhas vizinhas (um disco)
  const rim = S.rim * fx;
  const out: Rect[] = [];
  for (let y = 0; y < h; y++) {
    let from = w;
    for (let dy = -Math.ceil(rim); dy <= Math.ceil(rim); dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h || left[yy] >= w) continue;
      from = Math.min(from, left[yy] - Math.sqrt(Math.max(0, rim * rim - dy * dy)));
    }
    if (from < w) out.push({ x0: x0 + Math.max(0, Math.floor(from)), y0: y0 + y, x1: img.width, y1: y0 + y + 1 });
  }
  return out;
}

/** Onde começa o custo de mana, no fim da barra do nome (escala-base deitada). */
export function battleCostLeft(manaCost: string | null | undefined): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  return BATTLE.name.costRight - symbols.reduce((w, s) => w + (s.includes("/") ? BATTLE.costHybrid : BATTLE.costSymbol), 0);
}

/**
 * O canto reservado no pé do texto: com o P/R do verso, da ponta dele (y 595) ao pé, a partir de x
 * 912; sem ele, só o escudo (do alto do aro, y 645, a partir de x 934). Na escala-base, relativo à
 * caixa do texto `box`.
 */
export function battleNotch(box: Rect, backPt: boolean): { width: number; height: number } {
  const { backPt: P, shield: S } = BATTLE;
  return backPt ? { width: box.x1 - P.left, height: box.y1 - P.top } : { width: box.x1 - S.left, height: box.y1 - S.top };
}
