import { describe, expect, it } from "vitest";
import { FLIP_2003, FLIP_2015, flipBar, flipBox, flipPtLine, flipTypeEnd } from "../../src/engine/flip";

type Color = [number, number, number];
const gray = (v: number): Color => [v, v, v];

function canvas(w: number, h: number, bg: Color) {
  const data = new Uint8ClampedArray(w * h * 4);
  const img = { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        data.set(c, i);
        data[i + 3] = 255;
      }
  };
  fill(0, 0, w, h, bg);
  return { img, fill };
}

/**
 * A metade de cima de uma carta virada de 2003, nas medidas do Budoka Gardener (CHK 202): a caixa
 * de 131 a 257, a barra de tipo do fio de cima (258) ao de baixo (312), o tipo em inglês até x 293 e,
 * com `pt`, a caixa de P/R no fim da barra, com a sombra de 586 a 596 e o fio escuro em 596. Com
 * `white`, o fio do fim da caixa da moldura branca, 10 px acima da barra.
 */
function flipHalf({ pt = true, white = false } = {}) {
  const c = canvas(745, 1040, gray(20));
  c.fill(30, 117, 715, 131, [40, 110, 50]);
  c.fill(60, 131, 679, 258, gray(225));
  if (white) c.fill(60, 248, 679, 258, gray(190));
  for (let y = 150; y < 240; y += 30) for (let x = 72; x < 640; x += 16) c.fill(x, y, x + 7, y + 18, gray(30));
  c.fill(40, 258, 705, 261, gray(10));
  c.fill(40, 261, 705, 312, gray(205));
  c.fill(40, 312, 705, 316, gray(15));
  c.fill(40, 316, 705, 680, [150, 60, 40]);
  for (let x = 64; x < 300; x += 14) c.fill(x, 283, x + 6, 300, gray(30));
  if (pt) {
    // a sombra escurece devagar até o fio, e o miolo da caixa é claro
    for (let x = 586; x < 596; x++) c.fill(x, 255, x + 1, 316, gray(205 - (x - 585) * 5));
    c.fill(596, 252, 599, 318, gray(70));
    c.fill(599, 252, 690, 318, gray(200));
    c.fill(630, 280, 660, 300, gray(30));
  }
  return c;
}

describe("flipBar", () => {
  it("acha os fios da barra de tipo onde a moldura os põe", () => {
    expect(flipBar(flipHalf().img, FLIP_2003, 0)).toEqual({ top: 258, bottom: 312 });
  });

  it("pula o fio do fim da caixa da moldura branca, 10 px acima da barra", () => {
    // (Bushi Tenderfoot, CHK 2: com a altura de qualquer barra, ele passava pelo fio de cima)
    expect(flipBar(flipHalf({ white: true }).img, FLIP_2003, 0)?.top).toBe(258);
  });

  it("recusa a carta sem a barra ali (a moldura atual tem a barra 26 px acima)", () => {
    expect(flipBar(canvas(745, 1040, gray(200)).img, FLIP_2003, 0)).toBeNull();
    expect(flipBar(flipHalf().img, FLIP_2015, 0)).toBeNull();
  });
});

describe("flipPtLine", () => {
  it("acha o fio escuro da caixa de P/R, e nada na barra sem ela", () => {
    const bar = { top: 258, bottom: 312 };
    expect(flipPtLine(flipHalf().img, FLIP_2003, bar)).toBe(596);
    // (a metade virada das Ascendentes de Saviors é encantamento: a barra vai até o fim)
    expect(flipPtLine(flipHalf({ pt: false }).img, FLIP_2003, bar)).toBeNull();
  });
});

describe("flipTypeEnd", () => {
  it("para no fim do inglês, antes da sombra da caixa de P/R", () => {
    const end = flipTypeEnd(flipHalf().img, { x0: 68, y0: 261, x1: 585, y1: 312 });
    expect(end).toBe(293);
  });
});

describe("flipBox", () => {
  it("mede o papel da caixa", () => {
    const box = flipBox(flipHalf().img, FLIP_2003, 0);
    expect(box.x0).toBe(60);
    expect(box.x1).toBe(678);
    expect(box.y0).toBe(131);
    expect(box.y1).toBe(257);
  });
});
