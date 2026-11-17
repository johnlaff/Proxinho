import { describe, expect, it } from "vitest";
import { findPlaque2003, findTokenBar, findTokenBoxBottom, smallCaps, tokenLayout, tokenPtBox } from "../../src/engine/token";
import { printImage } from "../../src/engine/types";

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

describe("moldura de 2003", () => {
  it("usa a caixa de P/R mais à esquerda e o nome mais estreito", () => {
    const l = tokenLayout({ y0: 686, y1: 747 }, 655, 945, "2003");
    expect(l.pt.x0).toBe(546);
    expect(l.name.x1 - l.name.x0).toBeLessThan(450);
  });

  /** Fundo claro com textura, placa escura centrada (x 260–485) e letras douradas. */
  function fakePlaque(): ImageData {
    const width = 745;
    const height = 1040;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let rgb = (x + y) % 7 === 0 ? [150, 160, 140] : [190, 200, 180];
        if (y >= 56 && y < 106 && x >= 260 && x < 485) {
          rgb = [30, 24, 16];
          // letras: colunas douradas de 4 px a cada 20 px, entre y 66 e 98
          if (y >= 66 && y < 98 && x >= 280 && x < 465 && (x - 280) % 20 < 4) rgb = [215, 190, 110];
        }
        data.set([...rgb, 255], i);
      }
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  }

  it("acha a placa do nome pela cor do fundo e lê a cor das letras", () => {
    const p = findPlaque2003(fakePlaque())!;
    expect(p.x0).toBeGreaterThan(245);
    expect(p.x0).toBeLessThan(275);
    expect(p.x1).toBeGreaterThan(470);
    expect(p.x1).toBeLessThan(500);
    expect(p.ink).toBe("rgb(215,190,110)");
    expect(p.rows[10]).toEqual([30, 24, 16]);
  });
});

describe("printImage", () => {
  it("a face de trás das fichas de duas faces vem do verso", () => {
    expect(printImage({ id: "05934d59-7e98-4fff-8ccb-70cd1a61c6fd#1" }, "png")).toBe(
      "https://cards.scryfall.io/png/back/0/5/05934d59-7e98-4fff-8ccb-70cd1a61c6fd.png",
    );
    expect(printImage({ id: "05934d59-7e98-4fff-8ccb-70cd1a61c6fd" }, "small")).toBe(
      "https://cards.scryfall.io/small/front/0/5/05934d59-7e98-4fff-8ccb-70cd1a61c6fd.jpg",
    );
  });
});

describe("caixa de P/R das fichas", () => {
  const layout = tokenLayout({ y0: 520, y1: 578 }, 640, 958);
  it("protege a caixa quando a ficha tem P/R", () => {
    expect(tokenPtBox(layout, "2/2")).toEqual(layout.pt);
  });
  it("não protege nada em emblemas e fichas sem P/R, para apagar o canto em inglês", () => {
    expect(tokenPtBox(layout, null)).toBeNull();
  });
});
