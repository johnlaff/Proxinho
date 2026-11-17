import { describe, expect, it } from "vitest";
import { findTokenBar, findTokenBoxBottom, smallCaps, tokenLayout } from "../../src/engine/token";

/** Ficha falsa 745 × 1040: arte com ruído, barra clara entre dois fios escuros e caixa clara. */
function fakeToken(bar: [number, number] | null, boxBottom = 962): ImageData {
  const width = 745;
  const height = 1040;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // arte: listras escuras e médias que não formam fios atravessando a carta
      let v = ((x >> 3) + (y >> 2)) % 3 === 0 ? 40 : 120;
      if (bar) {
        const [a, b] = bar;
        if (y > a && y < b) v = 225; // interior da barra
        if (y === a || y === a + 1 || y === b || y === b + 1) v = 30; // fios
        if (b < 860 && y > b + 1 && y < boxBottom) v = 215; // caixa de texto
        if (b < 860 && (y === boxBottom || y === boxBottom + 1)) v = 30;
      }
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("findTokenBar", () => {
  it("acha a barra de tipo pelos dois fios", () => {
    // os fios têm 2 px: qualquer um dos dois serve
    const bar = findTokenBar(fakeToken([701, 759]))!;
    expect(bar.y0).toBeGreaterThanOrEqual(701);
    expect(bar.y0).toBeLessThanOrEqual(702);
    expect(bar.y1).toBeGreaterThanOrEqual(759);
    expect(bar.y1).toBeLessThanOrEqual(760);
  });

  it("acha a barra alta das fichas com muito texto e a baixa das sem texto", () => {
    expect(Math.round(findTokenBar(fakeToken([583, 641]))!.y0)).toBeOneOf([583, 584]);
    expect(Math.round(findTokenBar(fakeToken([850, 907]))!.y0)).toBeOneOf([850, 851]);
  });

  it("devolve null quando não há moldura de ficha", () => {
    expect(findTokenBar(fakeToken(null))).toBeNull();
  });

  it("acha o pé da caixa de texto", () => {
    const img = fakeToken([701, 759], 962);
    expect(findTokenBoxBottom(img, { y0: 701, y1: 759 })).toBe(962);
  });
});

describe("tokenLayout", () => {
  it("monta tipo e caixa a partir da barra", () => {
    const l = tokenLayout({ y0: 701, y1: 759 }, 655, 962);
    expect(l.type.centerY).toBe(730);
    expect(l.type.x1).toBe(644); // símbolo da coleção limitado a x 650
    expect(l.box?.text).toEqual({ x0: 68, y0: 771, x1: 677, y1: 952 });
  });

  it("ficha sem texto não tem caixa", () => {
    expect(tokenLayout({ y0: 850, y1: 907 }, 660, 962).box).toBeNull();
  });
});

describe("smallCaps", () => {
  it("separa maiúsculas grandes do resto em versalete", () => {
    expect(smallCaps("Elfo Guerreiro")).toEqual([
      { text: "E", big: true },
      { text: "LFO", big: false },
      { text: " G", big: true },
      { text: "UERREIRO", big: false },
    ]);
  });
});
