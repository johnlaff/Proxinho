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
  erase: { rect: Rect; threshold: number; colorThreshold?: number; fill?: "rows"; stains?: boolean }[];
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
  const titleX = extras.leftIcon ? DFC.iconTitleX : start ? start.title - 1 : 66;
  const typeX = extras.indicator ? DFC.indicatorTypeX : start ? start.type - 1 : 66;
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
      { rect: { x0: extras.leftIcon ? DFC.iconEraseX0 : barX0, y0: nameY.y0, x1: cost - 6, y1: nameY.y1 }, threshold: 28, fill: "rows" },
      {
        rect: { x0: extras.indicator ? DFC.indicatorEraseX0 : barX0, y0: 590 + dy, x1: setLeft - 6, y1: 636 + dy },
        threshold: 28,
        fill: "rows",
      },
      { rect: { x0: 58, y0: 646 + dy, x1: 688, y1: eraseBottom }, threshold: 14, colorThreshold: 34, stains: true },
    ],
    // começa no fio da caixa de P/R (~922): acima disso, letras cortadas pela proteção
    // deixavam meio pedaço que o preenchimento espalhava como mancha
    protect: hasPt ? [{ x0: 568, y0: 920, x1: BASE_W, y1: BASE_H }] : [],
    title: { x: titleX, maxWidth: cost - 12 - titleX, centerY: nameY.center, size: 35 },
    type: { x: typeX, maxWidth: setLeft - 10 - typeX, centerY: typeCenter + dy, size: 30 },
    box: extras.frame2003 ? { x0: 72, y0: 660 + dy, x1: 668, y1: boxBottom } : { x0: 68, y0: 656 + dy, x1: 677, y1: boxBottom },
  };
}
