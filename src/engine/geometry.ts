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

/** Cada símbolo do custo ocupa ~38 px; o último termina em x ≈ 690. */
export function costLeft(manaCost: string | null | undefined): number {
  const n = countSymbols(manaCost);
  return n === 0 ? 694 : 690 - 38 * n;
}

export interface FrameLayout {
  /** Regiões onde o texto em inglês é apagado (com limiar de contraste). */
  erase: { rect: Rect; threshold: number; colorThreshold?: number }[];
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
 * Monta a geometria da moldura para uma impressão.
 * `setSymbolLeft` vem da detecção do símbolo da coleção na linha de tipo.
 */
export function m15Layout(manaCost: string | null, hasPt: boolean, setSymbolLeft: number, extras: FrameExtras = {}): FrameLayout {
  const cost = extras.rightIcon && !manaCost ? DFC.rightIconX : costLeft(manaCost);
  const setLeft = Math.min(Math.max(setSymbolLeft, 560), 660);
  const titleX = extras.leftIcon ? DFC.iconTitleX : 66;
  const typeX = extras.indicator ? DFC.indicatorTypeX : 66;
  const eraseBottom = extras.mdfcStrip ? DFC.mdfcEraseBottom : 954;
  const boxBottom = extras.mdfcStrip ? DFC.mdfcBoxBottom : hasPt ? 916 : 944;
  return {
    erase: [
      { rect: { x0: extras.leftIcon ? DFC.iconEraseX0 : 50, y0: 58, x1: cost - 6, y1: 106 }, threshold: 28 },
      { rect: { x0: extras.indicator ? DFC.indicatorEraseX0 : 50, y0: 590, x1: setLeft - 6, y1: 636 }, threshold: 28 },
      { rect: { x0: 58, y0: 646, x1: 688, y1: eraseBottom }, threshold: 14, colorThreshold: 34 },
    ],
    protect: hasPt ? [{ x0: 568, y0: 916, x1: BASE_W, y1: BASE_H }] : [],
    title: { x: titleX, maxWidth: cost - 12 - titleX, centerY: 82, size: 35 },
    type: { x: typeX, maxWidth: setLeft - 10 - typeX, centerY: 613, size: 30 },
    box: { x0: 68, y0: 656, x1: 677, y1: boxBottom },
  };
}
