/**
 * Moldura das cartas divididas de 2015 (ADR 0034): as de Guilds of Ravnica e Ravnica
 * Allegiance, de Murders at Karlov Manor e as reimpressões na moldura atual (Dominaria
 * Remastered, Ravnica Remastered, Time Spiral Remastered, Modern Horizons 2, Clue Edition e os
 * decks de Commander). A carta é impressa deitada, como as Salas (room.ts): o motor gira a
 * imagem 90° no sentido horário e trabalha na carta deitada, de 1040 × 745 na escala-base. Cada
 * metade é uma carta pequena da moldura M15: a barra do nome no alto, com o custo no fim, a arte,
 * a barra de tipo com o símbolo da coleção no fim e a caixa de texto (com a marca-d'água da
 * guilda nas de Ravnica). A metade da direita repete a da esquerda 480 px adiante. As medidas são
 * da escala-base deitada, conferidas nas impressões de borda preta.
 *
 * As da moldura de 2003 (ADR 0037: Dissension, Planar Chaos, Dragon's Maze e as reimpressões)
 * seguem o mesmo caminho com as medidas delas (`SPLIT_2003`): cada metade é uma carta pequena da
 * moldura de 2003, a da direita 501 px adiante, com o nome e o tipo na Matrix Bold.
 *
 * As da moldura antiga (ADR 0038: Invasion, Apocalypse e as reimpressões de The List e de Time
 * Spiral) não têm barras: cada metade é uma carta pequena da moldura antiga (old.ts), com o nome e
 * o tipo em letras brancas com sombra sobre a moldura texturizada. As medidas delas são outras
 * (`SPLIT_1997`), e o caminho também (`renderSplitOld`, em render.ts): as letras saem pela rede
 * neural, como na carta de pé da moldura antiga.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

/** Medidas de uma moldura de carta dividida deitada (escala-base 1040 × 745). */
export interface SplitGeometry {
  width: number;
  height: number;
  /** a moldura de 2003: o nome e o tipo na Matrix Bold, pelo centro das minúsculas */
  frame2003: boolean;
  /** quanto a metade da direita fica adiante da da esquerda */
  dx: number;
  /** o retângulo do apagamento de cada barra do nome; `x`, a primeira letra; `costRight`, o fim do custo */
  names: readonly { x0: number; x1: number; x: number; costRight: number }[];
  nameY: { y0: number; y1: number; center: number };
  nameSize: number;
  costSymbol: number;
  costHybrid: number;
  /** cada barra de tipo, até antes do símbolo da coleção */
  types: readonly { x0: number; x1: number; x: number }[];
  /** com `tail`, as linhas do chanfro do pé da barra são apagadas à parte (a perna do "y") */
  typeY: { y0: number; y1: number; center: number; tail?: { y0: number; y1: number } };
  typeSize: number;
  /** os limites do papel de cada caixa e a parte que fica dentro dela em qualquer coleção */
  boxes: readonly Rect[];
  boxCore: readonly Rect[];
  boxPad: { x0: number; y0: number; x1: number; y1: number };
  /** como a medida das caixas acha o lado do papel (ver `paperBoxes`) */
  boxEdge: BoxEdge;
  maxSize: number;
  minSize: number;
  /** as pistas da moldura (`splitFrame`): trechos claros de cada metade e a borda preta entre elas */
  check: { name: Rect; type: Rect; box: Rect; border: readonly Rect[] };
  /**
   * a faixa do Fundir: onde procurar (`y0` a `y1`), os trechos sem letras de cada linha da faixa
   * (`probe`, pelo percentil `q`), o trecho entre as metades que é claro na faixa e escuro nas
   * outras divididas (`across`), a altura dela (`len`), o apagamento (`x0` a `x1`) e o português
   * (`textX0` a `textX1`, centralizado ou não, como o inglês)
   */
  fuse: {
    y0: number;
    y1: number;
    probe: readonly { x0: number; x1: number; q: number }[];
    across: { x0: number; x1: number };
    len: readonly [number, number];
    x0: number;
    x1: number;
    textX0: number;
    textX1: number;
    centered: boolean;
    maxSize: number;
    minSize: number;
  };
}

export const SPLIT: SplitGeometry = {
  /** largura e altura da carta deitada (escala-base) */
  width: BASE_H,
  height: BASE_W,
  frame2003: false,
  dx: 480,
  /**
   * barras dos nomes (o retângulo do apagamento; a ponta arredondada da esquerda começa em
   * x ≈ 90 e 570): `x` é onde começa a primeira letra e `costRight` onde acaba o custo
   */
  names: [
    { x0: 96, x1: 512, x: 107, costRight: 505 },
    { x0: 576, x1: 992, x: 587, costRight: 981 },
  ],
  /** o papel da barra do nome vai de 52 a 105 */
  nameY: { y0: 53, y1: 104, center: 79 },
  nameSize: 35,
  /** cada símbolo do custo ocupa ~36,4 px (com o vão); os híbridos, mais (o círculo tem 41) */
  costSymbol: 36.4,
  costHybrid: 44,
  /**
   * barras de tipo, até antes do símbolo da coleção (o mais largo começa em x ≈ 455 na metade
   * da esquerda e 934 na da direita; o tipo em inglês acaba antes de 200 e de 680)
   */
  types: [
    { x0: 96, x1: 445, x: 107 },
    { x0: 576, x1: 925, x: 587 },
  ],
  /** o papel da barra de tipo vai de 405 a 437 */
  typeY: { y0: 406, y1: 437, center: 421 },
  typeSize: 26,
  /**
   * o papel de cada caixa, medido na imagem (`splitBoxes`) dentro destes limites: o lado de
   * dentro muda uns 9 px entre coleções (de 93 a 102 na da esquerda) e o pé, de 709 a 715
   */
  boxes: [
    { x0: 93, y0: 449, x1: 509, y1: 716 },
    { x0: 570, y0: 449, x1: 988, y1: 716 },
  ],
  /** a parte da caixa que fica dentro dela em qualquer coleção */
  boxCore: [
    { x0: 104, y0: 456, x1: 503, y1: 707 },
    { x0: 584, y0: 456, x1: 981, y1: 707 },
  ],
  /** margem do texto dentro do papel da caixa (o inglês começa uns 12 px depois do lado) */
  boxPad: { x0: 10, y0: 6, x1: 10, y1: 6 },
  boxEdge: { inset: 3 },
  /** corpo do texto das caixas (o inglês chega a 34, como na M15) */
  maxSize: 34,
  minSize: 15,
  /** (a borda preta entre as metades vai da barra do nome ao pé das caixas) */
  check: {
    name: { x0: 130, y0: 60, x1: 420, y1: 98 },
    type: { x0: 220, y0: 411, x1: 420, y1: 432 },
    box: { x0: 120, y0: 470, x1: 480, y1: 700 },
    border: [{ x0: 527, y0: 60, x1: 549, y1: 700 }],
  },
  /**
   * a faixa do Fundir (ADR 0036), de uma metade à outra no pé da carta: o papel vai de 672 a 704
   * (3 px abaixo em algumas reimpressões) e de x ≈ 95 a 990, logo abaixo de um fio escuro que
   * encurta as caixas (o pé delas fica em ≈ 665). `probe`: os trechos da faixa sem letras, antes
   * do "Fuse" e depois do fim do lembrete; `x0`/`x1`: o apagamento, entre as pontas arredondadas;
   * `textX0`/`textX1`: o português, centralizado
   */
  fuse: {
    y0: 640,
    y1: 725,
    probe: [
      { x0: 104, x1: 140, q: 0.5 },
      { x0: 946, x1: 982, q: 0.5 },
    ],
    across: { x0: 520, x1: 556 },
    len: [26, 40],
    x0: 104,
    x1: 978,
    textX0: 120,
    textX1: 962,
    centered: true,
    maxSize: 27,
    minSize: 18,
  },
};

/**
 * As divididas da moldura de 2003 (ADR 0037), medidas nas 48 impressões de borda preta: cada
 * metade é uma carta pequena da moldura de 2003, a da direita 501 px adiante.
 */
export const SPLIT_2003: SplitGeometry = {
  width: BASE_H,
  height: BASE_W,
  frame2003: true,
  dx: 501,
  /**
   * o papel da barra do nome vai de x ≈ 52 (depois da ponta arredondada) a 490; o nome começa em
   * x ≈ 59 e 560 (a primeira letra da Matrix Bold fica 1 px depois da posição da linha) e o custo
   * acaba em ≈ 482 e 983. O apagamento começa no contorno da ponta (x ≈ 47), como na M15, e
   * `barCapGuard` acha a ponta: começando no papel, o contorno da primeira letra a 4 px passava
   * pelo contorno da ponta, ficava protegido e sobrava ao lado do português (o "S" de "Sorcery"
   * na barra de tipo do Rough // Tumble, PLC 114)
   */
  names: [
    { x0: 48, x1: 490, x: 58, costRight: 483 },
    { x0: 549, x1: 991, x: 559, costRight: 984 },
  ],
  /** o papel vai de 50 a 101; as minúsculas, de 72 a 91 */
  nameY: { y0: 51, y1: 100, center: 82 },
  /** maiúsculas com 27 px, como no nome da carta de pé de 2003 (corpo 35) */
  nameSize: 35,
  /** cada símbolo do custo ocupa ~36 px (com o vão; o círculo tem 32) */
  costSymbol: 36,
  costHybrid: 42,
  /**
   * o papel da barra de tipo vai de x ≈ 54 a 490 (o contorno da ponta em x ≈ 50); o tipo começa
   * em x ≈ 60 e 561, e o símbolo da coleção a partir de 446 e 946 (o da Friday Night Magic de 2006,
   * o mais largo, em 435 e 927)
   */
  types: [
    { x0: 50, x1: 425, x: 59 },
    { x0: 551, x1: 917, x: 560 },
  ],
  /**
   * o papel vai de 420 a 453; as minúsculas, de 433 a 447. A perna do "y" de "Sorcery" desce até
   * 455, no chanfro do pé da barra, e ficava como um traço depois do "Feitiço": as linhas do
   * chanfro são apagadas à parte, cada uma pelo tom dela (com o retângulo da barra até lá, o
   * preenchimento das linhas de baixo das letras puxava o tom do chanfro e o deixava com manchas
   * claras nas de Planar Chaos)
   */
  typeY: { y0: 421, y1: 452, center: 440.5, tail: { y0: 451, y1: 456 } },
  /** maiúsculas com 20 px (23 no corpo 30, na carta de pé de 2003) */
  typeSize: 26,
  /** o papel de cada caixa vai de x ≈ 53 a 483 (554 a 984) e de y ≈ 465 a 663 */
  boxes: [
    { x0: 46, y0: 458, x1: 490, y1: 670 },
    { x0: 547, y0: 458, x1: 991, y1: 670 },
  ],
  boxCore: [
    { x0: 64, y0: 474, x1: 472, y1: 652 },
    { x0: 565, y0: 474, x1: 973, y1: 652 },
  ],
  boxPad: { x0: 10, y0: 6, x1: 10, y1: 6 },
  /**
   * o papel vai até o fio escuro em volta, e o texto em inglês encosta nele (o "counters" do
   * Flesh // Blood, DGM 128, acaba 1 px antes do fio): a medida vai até a última coluna no tom do
   * papel do miolo, sem a folga de 3 px da moldura de 2015, senão o fim da palavra ficava
   */
  boxEdge: { inset: 0, drop: 30 },
  maxSize: 34,
  minSize: 15,
  /**
   * (no Fundir as metades se ligam por uma ponta nas barras dos nomes e de tipo e pela faixa no
   * pé: a borda preta entre elas é conferida na altura da arte e na das caixas)
   */
  check: {
    name: { x0: 130, y0: 56, x1: 400, y1: 96 },
    type: { x0: 220, y0: 425, x1: 400, y1: 448 },
    box: { x0: 120, y0: 480, x1: 440, y1: 600 },
    border: [
      { x0: 509, y0: 110, x1: 530, y1: 410 },
      { x0: 509, y0: 470, x1: 530, y1: 600 },
    ],
  },
  /**
   * a faixa do Fundir de Dragon's Maze: o papel vai de y ≈ 617 a 658 e de x ≈ 52 a 985, logo
   * abaixo do fio que fecha as caixas (o pé delas fica em ≈ 613); o "Fuse" começa em x ≈ 60, e o
   * lembrete, alinhado à esquerda, acaba em ≈ 963. Sem trecho livre antes do "Fuse", a faixa é
   * achada pelo fim dela, depois do lembrete (pelo percentil 80: o papel das douradas fica em
   * 145 a 160 e o grão o puxa para baixo), e pelo meio, entre as metades (pelo percentil 90: as
   * letras do "halves" passam ali, e na linha de base delas o percentil 80 caía nas serifas). O
   * apagamento começa no contorno da ponta (x ≈ 49), como nas barras do nome e do tipo
   */
  fuse: {
    y0: 590,
    y1: 680,
    probe: [
      { x0: 968, x1: 980, q: 0.8 },
      { x0: 509, x1: 530, q: 0.9 },
    ],
    across: { x0: 509, x1: 530 },
    len: [34, 48],
    x0: 50,
    x1: 982,
    textX0: 59,
    textX1: 978,
    centered: false,
    maxSize: 30,
    minSize: 18,
  },
};

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Percentil `q` (0 a 1) dos tons de um retângulo, de 2 em 2 px, na escala-base `base` (a da carta
 * deitada, se não for dita).
 */
export function percentile(
  img: ImageData,
  r: Rect,
  q: number,
  base: { w: number; h: number } = { w: SPLIT.width, h: SPLIT.height },
): number {
  const fx = img.width / base.w;
  const fy = img.height / base.h;
  const v: number[] = [];
  for (let y = Math.round(r.y0 * fy); y < Math.round(r.y1 * fy); y += 2)
    for (let x = Math.round(r.x0 * fx); x < Math.round(r.x1 * fx); x += 2) v.push(lum(img.data, (y * img.width + x) * 4));
  v.sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0;
}

/**
 * Confere na carta deitada a moldura das divididas (de 2015, ou a de `L`): as duas barras dos
 * nomes, as duas barras de tipo e as duas caixas claras, e a borda preta entre as metades. As
 * Salas (room.ts) têm a linha de tipo e a faixa do lembrete escuras no lugar das barras de tipo.
 * Sem as pistas, a carta sai na original.
 */
export function splitFrame(img: ImageData, L: SplitGeometry = SPLIT): boolean {
  if (img.width <= img.height) return false;
  const { name, type, box, border } = L.check;
  const shift = (r: Rect, dx: number) => ({ x0: r.x0 + dx, y0: r.y0, x1: r.x1 + dx, y1: r.y1 });
  for (const dx of [0, L.dx]) {
    if (percentile(img, shift(name, dx), 0.8) < 150) return false;
    if (percentile(img, shift(type, dx), 0.5) < 150) return false;
    if (percentile(img, shift(box, dx), 0.5) < 150) return false;
  }
  return border.every((r) => percentile(img, r, 0.5) < 80);
}

/**
 * A faixa do Fundir no pé da carta deitada (ADR 0036): o trecho claro (de 26 a 40 px na moldura
 * atual) que começa depois de um escuro (o fio que fecha as caixas), pelos trechos da faixa sem
 * letras de cada linha, e que passa clara também entre as metades, onde as outras divididas têm a
 * borda preta de cima a baixo (o pé de uma última linha de texto perto do fim da caixa deixava um
 * trecho claro do mesmo tamanho). Sem ela: `null`.
 */
export function fuseBar(img: ImageData, L: SplitGeometry = SPLIT): { y0: number; y1: number; center: number } | null {
  const F = L.fuse;
  const fy = img.height / L.height;
  const step = 1 / fy;
  const light = (y: number) => F.probe.every((p) => percentile(img, { x0: p.x0, y0: y, x1: p.x1, y1: y + step }, p.q) >= 140);
  let start: number | null = null;
  let seenDark = false;
  for (let y = F.y0; y <= F.y1; y += step) {
    const l = y < F.y1 && light(y);
    if (!l) {
      if (start !== null && seenDark) {
        const len = y - start;
        const across = percentile(img, { x0: F.across.x0, y0: start + 4, x1: F.across.x1, y1: y - 4 }, 0.5) >= 120;
        if (len >= F.len[0] && len <= F.len[1] && across) return { y0: start, y1: y, center: (start + y) / 2 };
      }
      start = null;
      seenDark = true;
    } else if (start === null) start = y;
  }
  return null;
}

/** Onde começa o custo de mana de uma metade, no fim da barra do nome dela (escala-base deitada). */
export function splitCostLeft(manaCost: string | null | undefined, half: 0 | 1, L: SplitGeometry = SPLIT): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  const right = L.names[half].costRight;
  return right - symbols.reduce((w, s) => w + (s.includes("/") ? L.costHybrid : L.costSymbol), 0);
}

/**
 * O papel de cada caixa, medido na imagem (escala-base deitada): de cada lado, onde acaba o
 * trecho claro que passa pelo meio da caixa (o percentil 80 das colunas, ou das linhas, na faixa
 * do meio), dentro dos limites de `boxes` e nunca menor que `boxCore` (de `L`). Na moldura
 * branca o fio em volta da caixa tem a cor do papel e a medida fica no limite de fora menos 3 px.
 */
export function splitBoxes(img: ImageData, fuse?: { y0: number } | null, L: SplitGeometry = SPLIT): Rect[] {
  // com o Fundir, as caixas acabam no fio acima da faixa dele
  const lims = fuse ? L.boxes.map((b) => ({ ...b, y1: fuse.y0 - 2 })) : L.boxes;
  const cores = fuse ? L.boxCore.map((b) => ({ ...b, y1: fuse.y0 - 12 })) : L.boxCore;
  return paperBoxes(img, lims, cores, { w: L.width, h: L.height }, L.boxEdge);
}

/**
 * Como `paperBoxes` acha o lado do papel: a coluna (ou linha) é papel com o percentil 80 a partir
 * de 145 ou, com `drop`, a até `drop` tons do papel do miolo; a medida fica `inset` px para dentro.
 */
export interface BoxEdge {
  inset: number;
  drop?: number;
}

/**
 * O papel de caixas de texto, medido na imagem (escala-base `base`): de cada lado, onde acaba o
 * trecho claro que passa pelo meio da caixa, dentro dos limites `lims` e nunca menor que `cores`
 * (ver `splitBoxes`; também as caixas da Consequência, aftermath.ts).
 */
export function paperBoxes(
  img: ImageData,
  lims: readonly Rect[],
  cores: readonly Rect[],
  base: { w: number; h: number },
  edge: BoxEdge = { inset: 3 },
): Rect[] {
  const fx = img.width / base.w;
  const fy = img.height / base.h;
  return lims.map((lim, i) => {
    const core = cores[i];
    const paper = edge.drop === undefined ? 0 : percentile(img, core, 0.8, base) - edge.drop;
    const min = edge.drop === undefined ? 145 : Math.max(145, paper);
    const light = (x0: number, y0: number, x1: number, y1: number) => percentile(img, { x0, y0, x1, y1 }, 0.8, base) >= min;
    // de dentro para fora, até a primeira coluna (ou linha) escura
    const walk = (from: number, to: number, test: (v: number) => boolean) => {
      const dir = to > from ? 1 : -1;
      let v = from;
      while (v !== to && test(v + dir)) v += dir;
      return v;
    };
    const midY0 = (core.y0 + core.y1) / 2 - 60;
    const midY1 = (core.y0 + core.y1) / 2 + 60;
    const midX0 = (core.x0 + core.x1) / 2 - 120;
    const midX1 = (core.x0 + core.x1) / 2 + 120;
    const col = (x: number) => light(x, midY0, x + 1 / fx, midY1);
    const row = (y: number) => light(midX0, y, midX1, y + 1 / fy);
    const inset = edge.inset;
    return {
      x0: Math.min(core.x0, walk(core.x0, lim.x0, col) + inset),
      y0: Math.min(core.y0, walk(core.y0, lim.y0, row) + inset),
      x1: Math.max(core.x1, walk(core.x1, lim.x1, col) - inset),
      y1: Math.max(core.y1, walk(core.y1, lim.y1, row) - inset),
    };
  });
}

/**
 * Medidas das divididas da moldura antiga, na carta deitada (escala-base 1040 × 745), da metade da
 * esquerda; a da direita fica `dx` adiante.
 */
export interface OldSplitGeometry {
  width: number;
  height: number;
  dx: number;
  /**
   * onde se procuram as letras do nome (até o custo): `x` é a primeira letra, `baseline` a linha de
   * base; de `band` para baixo ficam só os pés das letras, sobre os fios do alto da arte
   */
  name: { x0: number; y0: number; y1: number; x: number; baseline: number; size: number; band: number };
  /** onde se procuram as letras do tipo (até antes do símbolo da coleção) */
  type: { x0: number; x1: number; y0: number; y1: number; x: number; baseline: number; size: number };
  /** o custo: o último círculo acaba em `right`, um a cada `pitch` */
  cost: { right: number; pitch: number };
  /** o símbolo da coleção, que fica como está, escondido da rede neural */
  symbol: Rect;
  /** o quadro da rede neural de cada metade: o nome, a arte e o tipo */
  lama: Rect;
  /**
   * a caixa: o papel é medido na imagem (`oldSplitBoxes`) dentro de `lim`, nunca menor que `core`;
   * o apagamento fica `inset` para dentro do papel medido e o português, `pad` para dentro, no
   * máximo até `text` (onde vai o texto em inglês). O texto alinhado à esquerda nunca começa
   * depois de `left`: o que começa depois é centralizado
   */
  box: {
    lim: Rect;
    core: Rect;
    inset: number;
    pad: { x0: number; y0: number; x1: number; y1: number };
    text: Rect;
    left: number;
  };
  maxSize: number;
  minSize: number;
  /** as pistas da moldura (`oldSplitFrame`): a borda preta entre as metades e o papel das caixas */
  check: { border: Rect; box: Rect };
}

/**
 * As divididas da moldura antiga (ADR 0038), medidas nas 13 impressões de borda preta: cada metade
 * é uma carta pequena da moldura antiga, a da direita 499 px adiante. As letras do nome e do tipo
 * têm o tamanho das da carta de pé (a Goudy Medieval de ≈ 42,5 px no nome e a serifada de ≈ 32,5
 * no tipo), mais perto da borda.
 */
export const SPLIT_1997: OldSplitGeometry = {
  width: BASE_H,
  height: BASE_W,
  dx: 499,
  /**
   * o nome começa em x ≈ 73 (572 na metade da direita), na linha de base 75 (de 74 a 77, com a
   * sombra e a folga até 81). O pé do "p", do "y" e do "g" desce até ≈ 93, sobre os dois fios
   * escuros do alto da arte (em ≈ 85 e ≈ 94, 3 px abaixo em algumas) e o bisel entre eles
   */
  name: { x0: 62, y0: 39, y1: 96, x: 73, baseline: 75, size: 42.5, band: 83 },
  /**
   * o tipo começa em x ≈ 72 (571), na linha de base 391 (de 388 a 394), entre o fio de baixo da
   * arte (≈ 358) e o contorno da caixa (≈ 402); o tipo em inglês acaba antes de 190
   */
  type: { x0: 62, x1: 420, y0: 358, y1: 402, x: 72, baseline: 391, size: 32.5 },
  /** os círculos do custo têm ≈ 35 px, um a cada 38, o último acabando em x ≈ 486 (985) */
  cost: { right: 486, pitch: 38 },
  /** o símbolo da coleção vai de x ≈ 434 a 466 e de y ≈ 363 a 399 */
  symbol: { x0: 426, y0: 356, x1: 474, y1: 404 },
  /** (a metade vai de x ≈ 41 a 500; a borda preta entre as metades, de 500 a 539) */
  lama: { x0: 44, y0: 38, x1: 496, y1: 404 },
  /**
   * o papel da caixa vai de x ≈ 80 a 459 e de y ≈ 411 a 625 nas de bisel (as azuis e as
   * vermelhas), de 74 a 465 e de 408 a 633 na branca, só com o fio, e de ≈ 71 a 466 e de 404 a
   * 635 no pergaminho das pretas e das verdes, de beira irregular. O texto em inglês vai de x ≈ 89
   * a 449 (86 a 456 na de Time Spiral) e de y ≈ 429 a 611; o alinhado à esquerda começa de 88 a
   * 91 (82 a 86 na de Time Spiral), e o centralizado mais curto, em 95 ("Destroy target
   * artifact." no Reality, APC 129)
   */
  box: {
    lim: { x0: 64, y0: 394, x1: 478, y1: 644 },
    core: { x0: 84, y0: 420, x1: 454, y1: 616 },
    inset: 4,
    pad: { x0: 9, y0: 5, x1: 9, y1: 4 },
    text: { x0: 89, y0: 414, x1: 451, y1: 624 },
    left: 94,
  },
  maxSize: 34,
  minSize: 15,
  check: {
    border: { x0: 505, y0: 60, x1: 533, y1: 690 },
    box: { x0: 120, y0: 440, x1: 420, y1: 600 },
  },
};

/** Onde começa o custo de mana de uma metade da dividida antiga (escala-base deitada). */
export function oldSplitCostLeft(manaCost: string | null | undefined, half: 0 | 1, L: OldSplitGeometry = SPLIT_1997): number {
  const n = manaCost?.match(/\{[^}]+\}/g)?.length ?? 0;
  return L.cost.right + half * L.dx - L.cost.pitch * n;
}

/** Um retângulo da metade `half` (a da direita, `dx` adiante). */
export const oldSplitHalf = (r: Rect, half: 0 | 1, L: OldSplitGeometry = SPLIT_1997): Rect => ({
  x0: r.x0 + half * L.dx,
  y0: r.y0,
  x1: r.x1 + half * L.dx,
  y1: r.y1,
});

/**
 * Confere na carta deitada a moldura das divididas antigas: a borda preta entre as metades e o
 * papel das duas caixas (o mais escuro, o das vermelhas, fica em ≈ 117). As letras do nome e do
 * tipo são conferidas depois, onde a moldura as põe (`renderSplitOld`).
 */
export function oldSplitFrame(img: ImageData, L: OldSplitGeometry = SPLIT_1997): boolean {
  if (img.width <= img.height) return false;
  if (percentile(img, L.check.border, 0.5, { w: L.width, h: L.height }) >= 80) return false;
  return ([0, 1] as const).every((h) => percentile(img, oldSplitHalf(L.check.box, h, L), 0.5, { w: L.width, h: L.height }) >= 100);
}

/**
 * O papel de cada caixa da dividida antiga, medido na imagem (escala-base deitada). A caixa muda
 * com a cor: bisel nas azuis e nas vermelhas, só o fio na branca e pergaminho de beira irregular
 * nas pretas e nas verdes. De cada lado, o papel vai até a primeira coluna (ou linha) que foge da
 * cor do papel do miolo (a mediana da distância de cor na faixa do meio passa de 1,6 vez a de uma
 * coluna de papel, mais 6, e de 12): o bisel, o fio ou a moldura. Devolve o papel medido e o
 * retângulo do apagamento, `inset` para dentro dele e nunca menor que `core`.
 */
export function oldSplitBoxes(img: ImageData, L: OldSplitGeometry = SPLIT_1997): { paper: Rect; erase: Rect }[] {
  const fx = img.width / L.width;
  const fy = img.height / L.height;
  const d = img.data;
  return ([0, 1] as const).map((h) => {
    const lim = oldSplitHalf(L.box.lim, h, L);
    const core = oldSplitHalf(L.box.core, h, L);
    const px = (v: number) => Math.round(v * fx);
    const py = (v: number) => Math.round(v * fy);
    const cx0 = px(core.x0);
    const cx1 = px(core.x1);
    const cy0 = py(core.y0);
    const cy1 = py(core.y1);
    // a cor do papel: a mediana de cada canal no miolo
    const ch: number[][] = [[], [], []];
    for (let y = cy0; y < cy1; y += 2)
      for (let x = cx0; x < cx1; x += 2) {
        const i = (y * img.width + x) * 4;
        for (let c = 0; c < 3; c++) ch[c].push(d[i + c]);
      }
    const paper = ch.map(medianOf);
    const dist = (x: number, y: number) => {
      const i = (y * img.width + x) * 4;
      return Math.hypot(d[i] - paper[0], d[i + 1] - paper[1], d[i + 2] - paper[2]);
    };
    // a faixa do meio de cada lado (com as letras: a mediana fica no papel)
    const ry0 = cy0 + py(10);
    const ry1 = cy1 - py(10);
    const rx0 = cx0 + px(40);
    const rx1 = cx1 - px(40);
    const col = (x: number) => {
      const v: number[] = [];
      for (let y = ry0; y < ry1; y++) v.push(dist(x, y));
      return medianOf(v);
    };
    const row = (y: number) => {
      const v: number[] = [];
      for (let x = rx0; x < rx1; x++) v.push(dist(x, y));
      return medianOf(v);
    };
    const cols: number[] = [];
    for (let x = cx0; x < cx1; x += 2) cols.push(col(x));
    const limit = Math.max(12, medianOf(cols) * 1.6 + 6);
    const walk = (from: number, to: number, test: (v: number) => number) => {
      const dir = to > from ? 1 : -1;
      let v = from;
      while (v !== to && test(v + dir) <= limit) v += dir;
      return v;
    };
    const edge = {
      x0: walk(cx0, px(lim.x0), col) / fx,
      y0: walk(cy0, py(lim.y0), row) / fy,
      x1: (walk(cx1 - 1, px(lim.x1), col) + 1) / fx,
      y1: (walk(cy1 - 1, py(lim.y1), row) + 1) / fy,
    };
    const inset = L.box.inset;
    return {
      paper: edge,
      erase: {
        x0: Math.min(core.x0, edge.x0 + inset),
        y0: Math.min(core.y0, edge.y0 + inset),
        x1: Math.max(core.x1, edge.x1 - inset),
        y1: Math.max(core.y1, edge.y1 - inset),
      },
    };
  });
}

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}
