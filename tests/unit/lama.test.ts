import { describe, expect, it } from "vitest";
import { combineMasks, type RegionMask } from "../../src/engine/erase";
import { cropAround } from "../../src/engine/lama";

describe("cropAround", () => {
  it("cobre a caixa de texto do planeswalker com margem, num quadrado dentro da imagem", () => {
    const area = { x0: 96, y0: 586, x1: 687, y1: 944 };
    const c = cropAround(area, 745, 1040, 22);
    expect(c.size).toBe(635);
    expect(c.x).toBeLessThanOrEqual(area.x0);
    expect(c.x + c.size).toBeGreaterThanOrEqual(area.x1);
    expect(c.y).toBeLessThanOrEqual(area.y0);
    expect(c.y + c.size).toBeLessThanOrEqual(1040);
  });

  it("nunca é menor que o quadro do modelo nem maior que a imagem", () => {
    expect(cropAround({ x0: 10, y0: 10, x1: 20, y1: 20 }, 745, 1040, 0).size).toBe(512);
    expect(cropAround({ x0: 0, y0: 0, x1: 745, y1: 900 }, 745, 1040, 50).size).toBe(745);
    // imagem das prévias (488 px de largura): o recorte cabe nela e é ampliado
    expect(cropAround({ x0: 63, y0: 384, x1: 450, y1: 618 }, 488, 680, 15)).toEqual({ x: 0, y: 192, size: 488 });
  });
});

describe("combineMasks", () => {
  it("dilata a máscara sem sair das regiões", () => {
    const img = { width: 10, height: 1 } as ImageData;
    const region: RegionMask = { rect: { x0: 4, y0: 0, x1: 8, y1: 1 }, mask: Uint8Array.from([1, 0, 0, 0]), polarity: "dark" };
    expect([...combineMasks(img, [region], 2)]).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]);
  });
});
