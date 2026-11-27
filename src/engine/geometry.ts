/**
 * Geometria da moldura moderna (2015 em diante), medida nas imagens PNG do
 * Scryfall, que têm 745 × 1040 px (~300 dpi no tamanho real de 63 × 88 mm).
 *
 * Todas as medidas estão nessa escala-base e são convertidas para o tamanho
 * real da imagem (algumas têm 744 px de largura).
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const BASE_W = 745;
export const BASE_H = 1040;

/** Quantos símbolos o custo de mana ocupa, ex.: "{2}{W}{W}" → 3. */
export function countSymbols(manaCost: string | null | undefined): number {
  if (!manaCost) return 0;
  return (manaCost.match(/\{[^}]+\}/g) ?? []).length;
}

/**
 * Onde começa o custo de mana. Cada símbolo ocupa ~38 px e o último termina em x ≈ 690,
 * mas os híbridos e os phyrexianos ({W/U}, {2/W}, {B/P}) são desenhados maiores, ~45 px:
 * contados como os outros, o apagamento do nome comia o primeiro símbolo (Karn, Guardião
 * Dourado, com cinco {2/X}, perdia metade do {2/W}).
 */
export function costLeft(manaCost: string | null | undefined): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  if (symbols.length === 0) return 694;
  return 690 - symbols.reduce((w, s) => w + (s.includes("/") ? 45 : 38), 0);
}

export interface FrameLayout {
  /** Regiões onde o texto em inglês é apagado (com limiar de contraste). */
  /** `fill: "rows"` nas barras: fundo e preenchimento linha a linha */
  /**
   * `attachedBelow` na caixa: da linha (escala-base) para baixo só sai o que se liga às letras
   * (ver `keepAttachedBelow`); sem ele, o pé do retângulo
   */
  erase: { rect: Rect; threshold: number; colorThreshold?: number; fill?: "rows"; stains?: boolean; attachedBelow?: number }[];
  /** Regiões que nunca são apagadas (ex.: caixa de poder/resistência). */
  protect: Rect[];
  /** Onde o nome em português é escrito. */
  title: { x: number; maxWidth: number; centerY: number; size: number };
  /** Onde a linha de tipo é escrita. */
  type: { x: number; maxWidth: number; centerY: number; size: number };
  /** Caixa de texto das habilidades. */
  box: Rect;
}

/** Canto da caixa reservado ao lembrete "4/4" do verso nas cartas de transformar. */
export const BACK_PT_NOTCH = { width: 62, height: 34 };

/**
 * Os dez vértices de uma estrela de cinco pontas de raio `r` em volta de (cx, cy), a primeira
 * ponta para cima: o "★" do P/R do verso e da carta fundida, no lugar do "*" (ver drawBackPt). O
 * miolo tem 42% do raio, e a estrela desce 8% do raio para o meio dela ficar na altura das letras.
 */
export function starPoints(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a) + r * 0.08];
  });
}

/** Detalhes da moldura que mudam o lugar do texto (cartas de duas faces). */
export interface FrameExtras {
  /** ícone de transformar/modal à esquerda do nome (empurra o nome para a direita) */
  leftIcon?: boolean;
  /** ícone à direita do nome (verso das cartas de transformar desde 2023) */
  rightIcon?: boolean;
  /** indicador de cor (bolinha) antes da linha de tipo */
  indicator?: boolean;
  /** carta modal de duas faces: a faixa com o resumo do outro lado ocupa o pé da caixa */
  mdfcStrip?: boolean;
  /** quanto a linha de tipo (e o topo da caixa) desceu em relação à moldura padrão */
  typeShift?: number;
  /**
   * a linha de tipo não tem o símbolo da coleção (verso de duas faces desde 2022, ver
   * `findSetSymbolLeft`): o tipo vai até o fim da barra, como o nome sem custo
   */
  noSetSymbol?: boolean;
  /**
   * moldura de 2003 a 2014 (ADR 0024): as barras ficam onde estão na M15, mas a caixa é um pouco
   * mais estreita (papel de x 61 a 679, contra 58 a 688) e acaba mais cedo (fio de baixo em ~936,
   * com a caixa de P/R começando em ~927)
   */
  frame2003?: boolean;
  /** data da impressão (moldura de 2003: onde começam o nome e o tipo, ver `frame2003Start`) */
  released?: string | null;
}

/**
 * Onde começa a primeira letra do nome e do tipo na moldura de 2003, pela data da impressão:
 * medido em 6 cartas de cada coleção, de Eighth Edition a Magic 2010 (o tipo começava em
 * x ≈ 64 em Mirrodin e em 75 a partir de Planar Chaos). As reimpressões de The List e afins
 * usam a digitalização da original, mas a data é a delas: ficam com a medida mais nova.
 */
export function frame2003Start(released: string | null | undefined): { title: number; type: number } {
  const date = released ?? "9999";
  if (date < "2003-10-01") return { title: 65, type: 67 }; // Eighth Edition
  if (date < "2004-10-01") return { title: 63, type: 64 }; // Mirrodin, Darksteel e Fifth Dawn
  if (date < "2007-02-01") return { title: 63, type: 72 }; // de Kamigawa a Time Spiral (Ninth Edition: 73)
  return { title: 67, type: 75 }; // de Planar Chaos em diante
}

/**
 * Até onde vai a busca do símbolo da coleção na barra de tipo de 2003: a ponta da barra é mais
 * funda que na M15, e o contorno de dentro começa em x ≈ 686. Com a busca até o fim da M15
 * (711), o contorno e a moldura colorida depois dele viravam um bloco de 25 px, largo demais
 * para passar por fio, e eram tomados pelo símbolo: o símbolo de verdade ficava antes dele,
 * do lado do tipo, e o apagamento levava a metade da esquerda (27% das cartas de 2003 num
 * sorteio de 240; Magma Spray, JOU 103; Gods Willing, THS 16; o "M10" de M10 166).
 */
export const TYPE_BAR_END_2003 = 684;

/**
 * Caixa com marca-d'água na moldura de 2003: o limiar das letras (contra o papel) e o da cor
 * (os símbolos de mana do texto). A marca fica de 15 a 40 tons abaixo do papel; com o limiar
 * de 14 da caixa comum, ela entrava na máscara e a rede neural a apagava junto. A cor das
 * marcas das guildas (o sol laranja dos Boros) passa de 60 perto das letras: com o limiar de
 * cor 60, a marca inteira debaixo do texto saía na máscara e voltava como um borrão (Wojek
 * Halberdiers, GTC 208); o miolo dos símbolos passa de 120.
 */
export const WATERMARK_2003 = { ink: 50, color: 120 };

/** Medidas das cartas de duas faces (Scryfall PNG, conferidas em MID, VOW, MOM, ZNR, KHM, TLA). */
const DFC = {
  /** o nome começa depois do ícone (x ≈ 35–108) */
  iconTitleX: 120,
  iconEraseX0: 111,
  /** o ícone da direita começa em x ≈ 645 */
  rightIconX: 640,
  /** o tipo começa depois da bolinha do indicador de cor (x ≈ 60–90) */
  indicatorTypeX: 98,
  indicatorEraseX0: 93,
  /** a caixa termina em y ≈ 922 nas modais; abaixo vem a faixa do outro lado */
  mdfcBoxBottom: 916,
  mdfcEraseBottom: 921,
};

/**
 * O fio de baixo da caixa de texto da moldura de 2003 (escala-base): começa em 935 a 937 nas
 * 68 criaturas conferidas, uma de cada coleção de Eighth Edition a Conspiracy; em algumas
 * (Shards of Alara, Dragon's Maze) ele fica em 942 do meio da caixa para a esquerda e sobe
 * para 936 perto da caixa de P/R.
 */
export const BOX_FOOT_2003 = 936;

/**
 * As mesmas medidas na moldura de 2003 (Innistrad e Dark Ascension, ADR 0049, conferidas nas 37
 * impressões). O sol e a lua vão de x ≈ 35 a 108, e a ponta da barra do nome segue a curva do
 * ícone, com uma sombra que chega a x ≈ 121 no alto e no pé; a primeira letra começa em ≈ 125. A
 * bolinha do indicador de cor vai de x ≈ 70 a 97, e a primeira letra do tipo começa em ≈ 109.
 */
const DFC_2003 = { iconTitleX: 124, iconEraseX0: 122, indicatorTypeX: 108, indicatorEraseX0: 100 };

/**
 * A faixa de baixo das cartas modais (ADR 0029), medida em ZNR, KHM, STX, MH3, SPM e MSH: o
 * miolo vai de y ≈ 927 a 965 (925 a 964 nas digitalizações novas, de 744 px), o triângulo
 * acaba em x ≈ 44 e a ponta da direita começa em ≈ 322. A palavra começa em x ≈ 52,5, com as
 * maiúsculas de 937 a 954; o custo e a habilidade de mana acabam em x ≈ 320, e os símbolos têm
 * ~24 px. O apagamento fica dentro do miolo nas duas digitalizações.
 */
export const MDFC_STRIP = {
  /**
   * o que se apaga; com a habilidade de mana, até 327 (o ponto final de "Add {W}." vai até
   * ≈ 324, Hengegate Pathway, KHM 260), menos os cantos, onde o fio inclinado da ponta da
   * faixa começa antes disso (de x ≈ 320 em y 929 a 326 em 938, e de 326 em 957 a 322 em
   * 961, medido nas 382 faces modais)
   */
  erase: { x0: 48, y0: 929, x1: 327, y1: 962 },
  corners: [
    { x0: 320, y0: 929, x1: 327, y1: 939 },
    { x0: 321, y0: 956, x1: 327, y1: 962 },
  ],
  /** onde a palavra é escrita (a Beleren recua 3 px, ver `titleFont`: a primeira letra cai em ≈ 52,5) */
  wordX: 55,
  right: 320,
  /** o centro dos símbolos, e o das maiúsculas da palavra (de ≈ 937 a 954) */
  centerY: 945,
  wordCenterY: 946,
  /** opacidade do disco dos símbolos na faixa clara (ver `faintDisc` em render.ts) */
  disc: 0.45,
  /** corpo da palavra (Beleren) e da habilidade de mana (MPlantin), e o diâmetro dos símbolos */
  wordSize: 22.5,
  manaSize: 22,
  symbol: 24,
};

/**
 * Onde começa o custo de mana na faixa das modais: cada símbolo ocupa ~24 px e os híbridos
 * ~27 (o {W/B} de Glasswing Grace, MH3 254), e o último acaba em x ≈ 320.
 */
export function mdfcCostLeft(manaCost: string | null | undefined): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  return MDFC_STRIP.right - symbols.reduce((w, s) => w + (s.includes("/") ? 27 : 24), 0);
}

/** `rects` sem o que fica à esquerda do fim de `hole`, nas linhas dele (o resto fica igual). */
export function beside(rects: Rect[], hole: Rect): Rect[] {
  return rects.flatMap((r) => {
    if (r.y1 <= hole.y0 || r.y0 >= hole.y1 || r.x0 >= hole.x1) return [r];
    const parts: Rect[] = [];
    if (r.y0 < hole.y0) parts.push({ ...r, y1: hole.y0 });
    if (r.x1 > hole.x1) parts.push({ x0: hole.x1, y0: Math.max(r.y0, hole.y0), x1: r.x1, y1: Math.min(r.y1, hole.y1) });
    if (r.y1 > hole.y1) parts.push({ ...r, y0: hole.y1 });
    return parts;
  });
}

/**
 * Proteção da caixa de P/R (escala-base), a partir do topo e do lado esquerdo medidos
 * (`ptBoxTop`, `ptBoxLeft`, este 22 px abaixo do topo). O canto de cima da caixa é
 * arredondado: nas primeiras linhas ela começa uns pixels mais à direita. Com um
 * retângulo só, a partir do lado de baixo, o canto vazio ao lado ficava protegido e o
 * ponto final do flavor que caía ali sobrava (Towashi Songshaper, NEO).
 */
export function ptProtect(top: number, left: number | null): Rect[] {
  // (a caixa costuma começar entre 927 e 931, mas em algumas molduras desce até 936: o
  // limite de 926 protegia dez linhas de papel e o pé do ponto final da última linha
  // ficava, Dúplice Debochada, CLB 617)
  const y0 = Math.max(916, Math.min(936, top - 3));
  if (left === null) return [{ x0: 568, y0, x1: BASE_W, y1: BASE_H }];
  const lx = Math.max(566, Math.min(590, left));
  // (até 12 linhas abaixo do topo a caixa começa 2 px ou mais à direita do lado de baixo,
  // medido em ~390 cartas)
  const split = top + 12;
  return [
    { x0: lx - 2, y0: split, x1: BASE_W, y1: BASE_H },
    { x0: lx + 2, y0, x1: BASE_W, y1: split },
  ];
}

/**
 * Proteção da caixa de P/R na moldura de 2003 (escala-base), a partir do topo medido. A caixa
 * tem um chanfro com sombra do lado esquerdo, que desce na diagonal de x ≈ 559, cinco linhas
 * acima do topo, a ≈ 550, até o fio de baixo da caixa de texto (`border`, medido logo à
 * esquerda; medido em 66 cartas, uma de cada coleção de Eighth Edition a Conspiracy, e nas de
 * duas faces de Innistrad). Com a proteção da M15, a partir de x 564, a sombra e a ponta do fio
 * de cima da caixa eram apagadas, e o canto saía cortado num degrau claro (Champion of the
 * Parish, ISD 6). Do fio para baixo fica a de antes: em algumas molduras o fio sobe perto da
 * caixa de P/R (de 942 para 936 em Shards of Alara), e o alto dele, que o apagamento levava até
 * o pé da caixa, medido no terço da esquerda (ver `BOX_FOOT_2003`), ficava como um degrau no
 * fio (Tidehollow Sculler, ALA 202).
 */
export function ptProtect2003(top: number, border: number | null): Rect[] {
  const t = Math.max(916, Math.min(940, top));
  const b = Math.max(t + 1, Math.min(t + 20, border ?? t + 7));
  return [
    { x0: 555, y0: t - 5, x1: 566, y1: t - 3 },
    { x0: 551, y0: t - 3, x1: BASE_W, y1: t - 1 },
    { x0: 547, y0: t - 1, x1: BASE_W, y1: b },
    { x0: 564, y0: b, x1: BASE_W, y1: BASE_H },
  ];
}

/**
 * A moldura tem o círculo à esquerda do nome? As de duas faces têm (menos o verso com
 * o ícone à direita), e as Lições (STX, TLA) trazem o mesmo círculo no mesmo lugar: sem
 * ele, o nome em português era escrito por cima do ícone.
 */
export function hasLeftIcon(effects: string | null, twoSided: boolean, rightIcon: boolean): boolean {
  if (twoSided && !rightIcon) return true;
  return (effects ?? "").split(",").includes("lesson");
}

/**
 * Monta a geometria da moldura para uma impressão.
 * `setSymbolLeft` vem da detecção do símbolo da coleção na linha de tipo.
 */
export function m15Layout(manaCost: string | null, hasPt: boolean, setSymbolLeft: number, extras: FrameExtras = {}): FrameLayout {
  const cost = extras.rightIcon && !manaCost ? DFC.rightIconX : costLeft(manaCost);
  const setLeft = Math.min(Math.max(setSymbolLeft, 560), extras.noSetSymbol ? 694 : 660);
  // (na de 2003, onde começava o inglês na época da impressão; a primeira letra da Matrix Bold
  // fica 1 px depois da posição da linha)
  const start = extras.frame2003 ? frame2003Start(extras.released) : null;
  const D = extras.frame2003 ? DFC_2003 : DFC;
  const titleX = extras.leftIcon ? D.iconTitleX : start ? start.title - 1 : 66;
  const typeX = extras.indicator ? D.indicatorTypeX : start ? start.type - 1 : 66;
  // A ponta das barras de 2003 é mais funda: o fio escuro de dentro fica em x ≈ 50 a 56 no
  // meio da barra e em 54 a 60 no alto e no pé, com uns 5 px de degradê até o papel (a
  // primeira letra começa em x ≈ 63). Começando em 50, como na M15, a curva passava dos
  // 11 px de `barCapGuard` no alto e no pé e saía borrada (Divination M10, Azorius Signet DIS)
  const barX0 = extras.frame2003 ? 60 : 50;
  const eraseBottom = extras.mdfcStrip ? DFC.mdfcEraseBottom : 954;
  // linha de tipo mais baixa (arte estendida de Innistrad: Voto Carmesim, com caixa curta)
  const dy = extras.typeShift ?? 0;
  const boxBottom = extras.mdfcStrip ? DFC.mdfcBoxBottom : extras.frame2003 ? (hasPt ? 918 : 926) : hasPt ? 916 : 944;
  // Na de 2003 as linhas ficam no centro das minúsculas medido nas cartas (88 e 617,5, onde a
  // Matrix Bold é escrita); o apagamento do nome desce junto, até o pé das letras com perna
  // ("p", "y"), como nas 154 cartas conferidas (lá descia pelo alinhamento, ver alignBar)
  const nameY = extras.frame2003 ? { center: 88, y0: 64.5, y1: 112.5 } : { center: 82, y0: 58, y1: 106 };
  const typeCenter = extras.frame2003 ? 617.5 : 613;
  return {
    erase: [
      { rect: { x0: extras.leftIcon ? D.iconEraseX0 : barX0, y0: nameY.y0, x1: cost - 6, y1: nameY.y1 }, threshold: 28, fill: "rows" },
      {
        rect: { x0: extras.indicator ? D.indicatorEraseX0 : barX0, y0: 590 + dy, x1: setLeft - 6, y1: 636 + dy },
        threshold: 28,
        fill: "rows",
      },
      {
        rect: { x0: 58, y0: 646 + dy, x1: 688, y1: eraseBottom },
        threshold: 14,
        colorThreshold: 34,
        stains: true,
        // (na de 2003 o fio de baixo da caixa fica em ~936, e à esquerda chega a descer até 943
        // (Shards of Alara, Dragon's Maze): a caixa, medida no terço da esquerda, passava do fio
        // do lado da caixa de P/R, e o alto dele saía pintado de papel (Tidehollow Sculler, ALA 202)
        attachedBelow: extras.frame2003 ? BOX_FOOT_2003 : undefined,
      },
    ],
    // começa no fio da caixa de P/R (~922): acima disso, letras cortadas pela proteção
    // deixavam meio pedaço que o preenchimento espalhava como mancha
    protect: hasPt ? [{ x0: 568, y0: 920, x1: BASE_W, y1: BASE_H }] : [],
    title: { x: titleX, maxWidth: cost - 12 - titleX, centerY: nameY.center, size: 35 },
    type: { x: typeX, maxWidth: setLeft - 10 - typeX, centerY: typeCenter + dy, size: 30 },
    box: extras.frame2003 ? { x0: 72, y0: 660 + dy, x1: 668, y1: boxBottom } : { x0: 68, y0: 656 + dy, x1: 677, y1: boxBottom },
  };
}
