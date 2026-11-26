/**
 * Moldura do Preparar (Secrets of Strixhaven, 2026, e o Reality Fracture): a caixa de texto é
 * dividida ao meio por um fio da cor da moldura. À esquerda, as regras e o flavor da criatura;
 * à direita, a barra do nome da mágica (com o custo dela no fim), a barra do tipo e uma caixa
 * menor com as regras da mágica. É a Aventura de lado trocado, sem o livro (ADR 0032). Nome,
 * tipo, custo e P/R são os da M15. As medidas são da escala-base (745 × 1040), conferidas em
 * SOS, SOC e FRA.
 */
import type { SplitLayout } from "./adventure";
import { BASE_H, BASE_W } from "./geometry";

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const median = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1] ?? 0;

export const PREPARE = {
  /**
   * barra do nome da mágica: letra branca sobre a barra escura, custo de mana no fim (`center`:
   * o meio das letras em inglês). A barra começa no contorno escuro em x ≈ 377, rente ao fio
   */
  name: { x0: 381, y0: 659, x1: 690, y1: 698, x: 389, center: 679, size: 27 },
  /** barra do tipo da mágica, logo abaixo, também de letra branca; acaba numa ponta redonda em x ≈ 698 */
  type: { x0: 381, y0: 706, x1: 686, y1: 748, x: 389, center: 726, size: 26 },
  /** o custo da mágica acaba em x ≈ 690; cada símbolo ocupa ~31,5 px (com o vão), os híbridos ~35,5 */
  costRight: 690,
  costSymbol: 31.5,
  costHybrid: 35.5,
  /** caixa da mágica, abaixo das barras: o papel vai de x 379 a 687; o topo e o pé são medidos */
  spell: { x0: 380, x1: 686, textX0: 388, textX1: 680 },
  /** página da criatura, à esquerda do fio (o lado direito é o fio medido) */
  creature: { x0: 58, y0: 646, textX0: 68, textY0: 656, textBottom: 944 },
  /** maior corpo do texto das duas caixas (o inglês fica entre 24 e 30) */
  maxSize: 30,
  /** limiar da máscara das duas barras, o mesmo das barras da Aventura (`ADVENTURE.barThreshold`) */
  barThreshold: 20,
} as const;

/** A moldura do Preparar achada na imagem (escala-base). */
export interface PrepareFrame {
  /** a coluna mais escura do fio entre as duas caixas */
  divider: number;
  /** primeira linha de papel da caixa da mágica, abaixo da barra do tipo */
  spellTop: number;
  /** primeira linha abaixo do papel da caixa da mágica (o bisel acima da caixa de P/R) */
  spellBottom: number;
  /** primeira linha abaixo do papel da página da criatura */
  bottom: number;
}

/**
 * Confere na imagem a moldura do Preparar: o fio entre as caixas (uma coluna escura entre x 360 e
 * 384, mais escura que o papel dos dois lados em quase todas as linhas) e as barras da mágica (bem
 * mais escuras que o papel da caixa dela). Devolve o fio, o topo e o pé da caixa da mágica e o pé
 * da página da criatura; sem as pistas, `null`, e a carta sai na original.
 */
export function prepareFrame(img: ImageData): PrepareFrame | null {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const at = (x: number, y: number) => lum(img.data, (y * img.width + x) * 4);
  const rowMedian = (x0: number, x1: number, y: number) => {
    const row: number[] = [];
    for (let x = Math.round(x0 * fx); x < Math.round(x1 * fx); x++) row.push(at(x, y));
    return median(row);
  };
  const leftRows: number[] = [];
  const rightRows: number[] = [];
  let dark = 0;
  let rows = 0;
  const sx0 = Math.round(360 * fx);
  const cols: number[][] = Array.from({ length: Math.round(384 * fx) - sx0 }, () => []);
  for (let yb = 776; yb <= 900; yb += 4) {
    const y = Math.round(yb * fy);
    const l = rowMedian(70, 330, y);
    const r = rowMedian(400, 660, y);
    leftRows.push(l);
    rightRows.push(r);
    let low = 255;
    cols.forEach((c, i) => {
      const v = at(sx0 + i, y);
      c.push(v);
      low = Math.min(low, v);
    });
    rows++;
    if (low < Math.min(l, r) - 40) dark++;
  }
  if (dark < rows * 0.7) return null;
  const paper = median(leftRows);
  const spellPaper = median(rightRows);
  // as barras da mágica: as linhas do meio das duas, na largura da caixa
  const barRows: number[] = [];
  for (const [a, b] of [
    [668, 690],
    [712, 740],
  ])
    for (let yb = a; yb <= b; yb += 2) barRows.push(rowMedian(400, 580, Math.round(yb * fy)));
  if (spellPaper - median(barRows) < 35) return null;
  // A caixa da mágica vai do bisel claro abaixo da barra do tipo ao bisel acima da caixa de P/R:
  // conta, em cada linha, os pixels no tom do papel. O papel começa na primeira linha com 60% ou
  // mais deles (o bisel passa do tom do papel); acaba na primeira com menos de 20%. Pela mediana
  // da linha, uma linha de texto no pé da caixa passava pelo fim dela e o inglês da última linha
  // ficava (Omit Variables, FRA 156): uma linha de texto nunca toma 80% da largura.
  const x0 = Math.round(400 * fx);
  const x1 = Math.round(660 * fx);
  const onPaper = (yb: number) => {
    const y = Math.round(yb * fy);
    let n = 0;
    for (let x = x0; x < x1; x++) if (Math.abs(at(x, y) - spellPaper) <= 20) n++;
    return n / (x1 - x0);
  };
  let spellTop: number | null = null;
  for (let yb = 748; yb <= 776 && spellTop === null; yb++) if (onPaper(yb) >= 0.6 && onPaper(yb + 1) >= 0.6) spellTop = yb;
  if (spellTop === null) return null;
  let spellBottom: number | null = null;
  for (let yb = 880; yb <= 940 && spellBottom === null; yb++) if (onPaper(yb) < 0.2 && onPaper(yb + 1) < 0.2) spellBottom = yb;
  if (spellBottom === null) return null;
  const colMedians = cols.map((c) => median(c));
  const darkest = colMedians.indexOf(Math.min(...colMedians));
  // o pé da página da criatura: a moldura logo abaixo do papel (entre 956 e 964), na primeira de
  // três linhas seguidas com menos de 20% dos pixels no tom do papel. Pela mediana da linha, o pé
  // de uma última linha de texto baixa passava pelo fim da página e ficava em inglês embaixo do
  // português (Emeritus of Ideation, SOS 45)
  const lx0 = Math.round(70 * fx);
  const lx1 = Math.round(300 * fx);
  const onLeft = (yb: number) => {
    const y = Math.round(yb * fy);
    let n = 0;
    for (let x = lx0; x < lx1; x++) if (Math.abs(at(x, y) - paper) <= 20) n++;
    return n / (lx1 - lx0);
  };
  let bottom = 958;
  for (let yb = 940; yb <= 975; yb++) {
    if (onLeft(yb) < 0.2 && onLeft(yb + 1) < 0.2 && onLeft(yb + 2) < 0.2) {
      bottom = yb;
      break;
    }
  }
  return { divider: Math.round((sx0 + darkest) / fx), spellTop, spellBottom, bottom };
}

/**
 * Onde começa o custo de mana da mágica, no fim da barra do nome dela (os híbridos são maiores,
 * como na Aventura).
 */
export function prepareCostLeft(manaCost: string | null | undefined): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  return PREPARE.costRight - symbols.reduce((w, s) => w + (s.includes("/") ? PREPARE.costHybrid : PREPARE.costSymbol), 0);
}

/** As duas barras, a caixa da mágica e a página da criatura, a apagar e a escrever (escala-base). */
export function prepareLayout(frame: PrepareFrame, manaCost: string | null | undefined): SplitLayout {
  const cost = prepareCostLeft(manaCost);
  const { name, type, spell, creature } = PREPARE;
  return {
    name: {
      rect: { x0: name.x0, y0: name.y0, x1: Math.min(name.x1, cost - 5), y1: name.y1 },
      x: name.x,
      maxWidth: cost - 6 - name.x,
      size: name.size,
      center: name.center,
    },
    type: {
      rect: { x0: type.x0, y0: type.y0, x1: type.x1, y1: type.y1 },
      x: type.x,
      maxWidth: type.x1 - 6 - type.x,
      size: type.size,
      center: type.center,
    },
    lettersX: [392, 620],
    spell: {
      erase: { x0: spell.x0, y0: frame.spellTop + 1, x1: spell.x1, y1: frame.spellBottom - 1 },
      text: { x0: spell.textX0, y0: frame.spellTop + 5, x1: spell.textX1, y1: frame.spellBottom - 5 },
    },
    creature: {
      // (até o fio, sem ele: a beira dele começa uns 6 px antes da coluna mais escura)
      erase: { x0: creature.x0, y0: creature.y0, x1: frame.divider - 4, y1: frame.bottom },
      // (a caixa de P/R fica à direita, embaixo da caixa da mágica: o texto da criatura desce até
      // o pé da caixa comum sem P/R)
      text: { x0: creature.textX0, y0: creature.textY0, x1: frame.divider - 12, y1: creature.textBottom },
    },
    attachedBelow: null,
    barThreshold: PREPARE.barThreshold,
    maxSize: PREPARE.maxSize,
    shaded: false,
  };
}
