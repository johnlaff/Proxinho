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

/**
 * Monta a geometria da moldura para uma impressão.
 * `setSymbolLeft` vem da detecção do símbolo da coleção na linha de tipo.
 */
export function m15Layout(manaCost: string | null, hasPt: boolean, setSymbolLeft: number): FrameLayout {
  const cost = costLeft(manaCost);
  const setLeft = Math.min(Math.max(setSymbolLeft, 560), 660);
  return {
    erase: [
      { rect: { x0: 50, y0: 58, x1: cost - 6, y1: 106 }, threshold: 28 },
      { rect: { x0: 50, y0: 590, x1: setLeft - 6, y1: 636 }, threshold: 28 },
      { rect: { x0: 58, y0: 646, x1: 688, y1: 954 }, threshold: 14, colorThreshold: 34 },
    ],
    protect: hasPt ? [{ x0: 568, y0: 916, x1: BASE_W, y1: BASE_H }] : [],
    title: { x: 66, maxWidth: cost - 12 - 66, centerY: 82, size: 35 },
    type: { x: 66, maxWidth: setLeft - 10 - 66, centerY: 613, size: 30 },
    box: { x0: 68, y0: 656, x1: 677, y1: hasPt ? 916 : 944 },
  };
}
