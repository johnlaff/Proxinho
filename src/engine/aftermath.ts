/**
 * Moldura da Consequência (Amonkhet e Hour of Devastation, e as reimpressões nos decks de
 * Commander; ADR 0035). A metade de cima é uma carta da moldura M15 mais baixa, de pé: a barra do
 * nome no lugar de sempre, a arte, a barra de tipo com o símbolo da coleção e a caixa de texto. A
 * metade de baixo, a da Consequência, é impressa deitada, de lado: girada a carta 90° no sentido
 * anti-horário, ela fica de pé, com a barra do nome no alto, a arte, a barra de tipo (sem o
 * símbolo da coleção: no fim dela fica o selo holográfico das raras) e a caixa de texto. O motor
 * apaga e escreve a de cima na carta de pé e a de baixo na carta girada (`renderAftermath` em
 * render.ts). As medidas são da escala-base de cada orientação, conferidas nas impressões de borda
 * preta.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";
import { paperBoxes, percentile } from "./split";

export const AFTERMATH = {
  /** a metade de cima, na carta de pé (745 × 1040) */
  top: {
    /** o papel da barra do nome vai de 52 a 105 (de 49 a 103 em algumas reimpressões) */
    name: { x0: 50, x: 66, y0: 46, y1: 112, probe: { x0: 300, x1: 560 } },
    /** a barra de tipo vai de 358 a 410; o símbolo da coleção fica no fim dela */
    type: { x0: 50, x: 66, y0: 350, y1: 418, probe: { x0: 250, x1: 560 } },
    /** o papel da caixa (de 55 a 689 e de 422 a 557; na moldura branca o fio tem a cor do papel) */
    box: { x0: 52, y0: 419, x1: 692, y1: 560 },
    core: { x0: 64, y0: 430, x1: 680, y1: 549 },
  },
  /** a metade de baixo, na carta girada 90° no sentido anti-horário (1040 × 745) */
  bottom: {
    /** a barra do nome vai de 57 a 110; o custo acaba em x ≈ 947 */
    name: { x0: 576, x: 588, costRight: 947, y0: 50, y1: 117, probe: { x0: 760, x1: 825 } },
    /** a barra de tipo vai de 345 a 397 e acaba em x ≈ 940, antes do selo holográfico */
    type: { x0: 576, x1: 930, x: 588, y0: 337, y1: 405, probe: { x0: 700, x1: 900 } },
    box: { x0: 581, y0: 405, x1: 955, y1: 693 },
    core: { x0: 594, y0: 416, x1: 944, y1: 682 },
  },
  /** cada símbolo do custo da metade de baixo ocupa ~37,4 px; os híbridos, mais */
  costSymbol: 37.4,
  costHybrid: 44,
  nameSize: 35,
  typeSize: 30,
  /** margem do texto dentro do papel da caixa */
  boxPad: { x0: 10, y0: 6, x1: 10, y1: 6 },
  maxSize: 34,
  minSize: 15,
} as const;

/** A orientação de cada metade: a de cima na carta de pé, a de baixo na carta girada. */
const DIMS = { top: { w: BASE_W, h: BASE_H }, bottom: { w: BASE_H, h: BASE_W } } as const;

export interface BarSpan {
  /** primeira e última linha do papel da barra (escala-base da orientação) */
  y0: number;
  y1: number;
  center: number;
}

/**
 * O papel de uma barra, medido na imagem: o trecho claro mais comprido (a mediana de cada linha,
 * num trecho da barra sem letras) entre `y0` e `y1`. As reimpressões mudam a barra uns 3 px.
 */
export function barSpan(img: ImageData, half: "top" | "bottom", bar: "name" | "type"): BarSpan | null {
  const b = AFTERMATH[half][bar];
  const fy = img.height / DIMS[half].h;
  let best: [number, number] | null = null;
  let start: number | null = null;
  const step = 1 / fy;
  for (let y = b.y0; y <= b.y1; y += step) {
    const light = y < b.y1 && percentile(img, { x0: b.probe.x0, y0: y, x1: b.probe.x1, y1: y + step }, 0.5, DIMS[half]) >= 140;
    if (light && start === null) start = y;
    if (!light && start !== null) {
      if (!best || y - start > best[1] - best[0]) best = [start, y];
      start = null;
    }
  }
  // a barra tem uns 52 px: menos de 40 não é ela
  if (!best || best[1] - best[0] < 40) return null;
  return { y0: best[0], y1: best[1], center: (best[0] + best[1]) / 2 };
}

/**
 * Confere a moldura da Consequência: as barras e a caixa claras das duas metades, a de cima na
 * carta de pé e a de baixo na carta girada. Devolve as barras medidas, ou `null` (a carta sai na
 * original).
 */
export function aftermathFrame(standing: ImageData, turned: ImageData) {
  if (standing.width >= standing.height || turned.width <= turned.height) return null;
  const top = { name: barSpan(standing, "top", "name"), type: barSpan(standing, "top", "type") };
  const bottom = { name: barSpan(turned, "bottom", "name"), type: barSpan(turned, "bottom", "type") };
  if (!top.name || !top.type || !bottom.name || !bottom.type) return null;
  if (percentile(standing, AFTERMATH.top.core, 0.5, DIMS.top) < 150) return null;
  if (percentile(turned, AFTERMATH.bottom.core, 0.5, DIMS.bottom) < 150) return null;
  return { top: top as { name: BarSpan; type: BarSpan }, bottom: bottom as { name: BarSpan; type: BarSpan } };
}

/** Onde começa o custo da metade de baixo, no fim da barra do nome dela (carta girada). */
export function aftermathCostLeft(manaCost: string | null | undefined): number {
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  return AFTERMATH.bottom.name.costRight - symbols.reduce((w, s) => w + (s.includes("/") ? AFTERMATH.costHybrid : AFTERMATH.costSymbol), 0);
}

/** O papel da caixa de cada metade, medido na imagem (ver `paperBoxes`). */
export function aftermathBox(img: ImageData, half: "top" | "bottom"): Rect {
  const h = AFTERMATH[half];
  return paperBoxes(img, [h.box], [h.core], DIMS[half])[0];
}
