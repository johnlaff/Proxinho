import { describe, expect, it } from "vitest";
import { findSetSymbolLeft } from "../../src/engine/erase";

/** Imagem falsa 745×1040: fundo claro, com blocos escuros na linha de tipo. */
function fakeImage(blocks: [number, number][]): ImageData {
  const width = 745;
  const height = 1040;
  const data = new Uint8ClampedArray(width * height * 4).fill(210);
  for (const [x0, x1] of blocks) {
    for (let y = 606; y < 614; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 20;
      }
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("findSetSymbolLeft", () => {
  it("acha o símbolo isolado", () => {
    expect(findSetSymbolLeft(fakeImage([[655, 700]]), 594, 632)).toBe(655);
  });

  it("não deixa o fim do tipo em inglês grudado no símbolo (Konia DSK 299: “Survivor”)", () => {
    // texto até 650, lacuna de 4 px, símbolo de 654 a 700
    const left = findSetSymbolLeft(
      fakeImage([
        [560, 650],
        [654, 700],
      ]),
      594,
      632,
    );
    expect(left).toBe(654);
  });
});
