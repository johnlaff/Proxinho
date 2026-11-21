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
  const titleX = extras.leftIcon ? DFC.iconTitleX : 66;
  const typeX = extras.indicator ? DFC.indicatorTypeX : 66;
  const eraseBottom = extras.mdfcStrip ? DFC.mdfcEraseBottom : 954;
  // linha de tipo mais baixa (arte estendida de Innistrad: Voto Carmesim, com caixa curta)
  const dy = extras.typeShift ?? 0;
  const boxBottom = extras.mdfcStrip ? DFC.mdfcBoxBottom : hasPt ? 916 : 944;
  return {
    erase: [
      { rect: { x0: extras.leftIcon ? DFC.iconEraseX0 : 50, y0: 58, x1: cost - 6, y1: 106 }, threshold: 28, fill: "rows" },
      {
        rect: { x0: extras.indicator ? DFC.indicatorEraseX0 : 50, y0: 590 + dy, x1: setLeft - 6, y1: 636 + dy },
        threshold: 28,
        fill: "rows",
      },
      { rect: { x0: 58, y0: 646 + dy, x1: 688, y1: eraseBottom }, threshold: 14, colorThreshold: 34, stains: true },
    ],
    // começa no fio da caixa de P/R (~922): acima disso, letras cortadas pela proteção
    // deixavam meio pedaço que o preenchimento espalhava como mancha
    protect: hasPt ? [{ x0: 568, y0: 920, x1: BASE_W, y1: BASE_H }] : [],
    title: { x: titleX, maxWidth: cost - 12 - titleX, centerY: 82, size: 35 },
    type: { x: typeX, maxWidth: setLeft - 10 - typeX, centerY: 613 + dy, size: 30 },
    box: { x0: 68, y0: 656 + dy, x1: 677, y1: boxBottom },
  };
}
