import { describe, expect, it } from "vitest";
import { SPLIT, splitBoxes, splitCostLeft, splitFrame } from "../../src/engine/split";

// a carta deitada (ver split.ts)
const W = 1040;
const H = 745;

type Color = [number, number, number];
const gray = (v: number): Color => [v, v, v];

function canvas(bg: Color) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        data.set(c, i);
        data[i + 3] = 255;
      }
  };
  fill(0, 0, W, H, bg);
  return { img, fill };
}

/**
 * Dividida falsa nas medidas de RNA 224 (Consecrate // Consume) deitada: em cada metade, a
 * barra do nome e a barra de tipo claras com letras escuras, a arte escura e a caixa de papel
 * com o texto, num fio escuro; a borda preta entre as metades.
 */
function split({ white = false, boxX0 = 96 } = {}) {
  const c = canvas(gray(14));
  for (const dx of [0, 480]) {
    c.fill(80 + dx, 35, 515 + dx, 725, white ? gray(236) : ([24, 110, 70] as Color));
    c.fill(92 + dx, 52, 512 + dx, 105, gray(205));
    for (let x = 107 + dx; x < 330 + dx; x += 18) c.fill(x, 66, x + 9, 92, gray(30));
    c.fill(96 + dx, 111, 508 + dx, 398, gray(60));
    c.fill(92 + dx, 405, 512 + dx, 437, gray(210));
    for (let x = 107 + dx; x < 190 + dx; x += 14) c.fill(x, 412, x + 6, 431, gray(30));
    // o fio da caixa e o papel
    if (!white) c.fill(boxX0 - 4 + dx, 446, 511 + dx, 717, gray(70));
    c.fill(boxX0 + dx, 450, 507 + dx, 713, gray(232));
    for (let y = 520; y < 640; y += 30) for (let x = boxX0 + 12 + dx; x < 470 + dx; x += 16) c.fill(x, y, x + 7, y + 20, gray(30));
  }
  return c;
}

describe("splitFrame", () => {
  it("reconhece a dividida deitada, de moldura colorida e branca", () => {
    expect(splitFrame(split().img)).toBe(true);
    expect(splitFrame(split({ white: true }).img)).toBe(true);
  });

  it("recusa a carta de pé, a Sala (faixas do meio escuras) e a carta sem a borda entre as metades", () => {
    const standing = { width: 745, height: 1040, data: new Uint8ClampedArray(745 * 1040 * 4), colorSpace: "srgb" } as ImageData;
    expect(splitFrame(standing)).toBe(false);
    const room = split();
    room.fill(96, 402, 990, 511, gray(40));
    expect(splitFrame(room.img)).toBe(false);
    const joined = split();
    joined.fill(515, 35, 575, 725, gray(232));
    expect(splitFrame(joined.img)).toBe(false);
  });
});

describe("splitCostLeft", () => {
  it("conta o custo de cada metade a partir do fim da barra dela", () => {
    // (medidos no Consecrate // Consume, RNA 224: o "2" da direita começa em 877)
    expect(splitCostLeft("{2}{W}{B}", 1)).toBeCloseTo(981 - 3 * 36.4);
    expect(splitCostLeft("{1}{W/B}", 0)).toBeCloseTo(505 - 36.4 - 44);
    expect(splitCostLeft(null, 0)).toBe(505);
  });
});

describe("splitBoxes", () => {
  it("mede o papel de cada caixa dentro do fio", () => {
    const [a, b] = splitBoxes(split().img);
    expect(a.x0).toBeGreaterThanOrEqual(96 + 3 - 1);
    expect(a.x0).toBeLessThanOrEqual(96 + 3 + 1);
    expect(a.y1).toBeGreaterThanOrEqual(713 - 3 - 1);
    expect(b.x1).toBeLessThanOrEqual(987 - 3 + 1);
  });

  it("acompanha a caixa que começa mais adentro e não passa do limite na moldura branca", () => {
    const [a] = splitBoxes(split({ boxX0: 102 }).img);
    expect(a.x0).toBeGreaterThanOrEqual(104);
    const [w] = splitBoxes(split({ white: true }).img);
    expect(w.x0).toBeGreaterThanOrEqual(SPLIT.boxes[0].x0);
    expect(w.y1).toBeLessThanOrEqual(SPLIT.boxes[0].y1);
  });
});
