import { describe, expect, it } from "vitest";
import { findSetSymbolLeft, textPolarity } from "../../src/engine/erase";

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

describe("textPolarity", () => {
  /** Faixa 200×40 com fundo `bg` e letras (blocos) da cor `ink`. */
  function band(bg: number, ink: number): ImageData {
    const width = 200;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4).fill(bg);
    for (let y = 12; y < 28; y++) {
      for (let x = 10; x < 190; x++) {
        if (x % 12 < 4) {
          const i = (y * width + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = ink;
        }
      }
    }
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  }
  const all = { x0: 0, y0: 0, x1: 200, y1: 40 };

  it("texto preto em barra clara (frente)", () => {
    expect(textPolarity(band(220, 15), all)).toBe("dark");
  });
  it("texto branco em barra escura (verso de transformar)", () => {
    expect(textPolarity(band(70, 250), all)).toBe("light");
  });
  it("texto branco em barra cinza-clara (verso das modais)", () => {
    expect(textPolarity(band(175, 252), all)).toBe("light");
  });
});
