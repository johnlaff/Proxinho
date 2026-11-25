import { describe, expect, it } from "vitest";
import { findSetSymbolLeft, textMask, textPolarity } from "../../src/engine/erase";
import { TYPE_BAR_END_2003, WATERMARK_2003 } from "../../src/engine/geometry";

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

  it("na moldura de 2003 a busca para antes do contorno da barra (Magma Spray, JOU 103)", () => {
    // símbolo de 636 a 676; o contorno da ponta da barra e a moldura colorida, de 686 ao fim
    const img = fakeImage([
      [636, 676],
      [686, 745],
    ]);
    // até o fim da M15, o contorno com a moldura passava por símbolo e o de verdade era apagado
    expect(findSetSymbolLeft(img, 594, 632)).toBeGreaterThanOrEqual(680);
    expect(findSetSymbolLeft(img, 594, 632, TYPE_BAR_END_2003)).toBe(636);
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

describe("textMask nos planeswalkers", () => {
  it("sem limiar por ladrilho, a palavra sobre arte agitada entra na máscara (Vraska, ONE)", () => {
    // caixa 745 × 120: metade lisa; na outra, a arte clara aparece em riscos diagonais
    // (os veios de óleo da Vraska) e a palavra ("poison") fica só ali
    const width = 745;
    const height = 120;
    const data = new Uint8ClampedArray(width * height * 4);
    const letter = (x: number, y: number) => x >= 470 && x < 560 && y >= 50 && y < 64 && x % 9 < 3;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const v = letter(x, y) ? 30 : x >= 400 && (x + 2 * y) % 7 === 0 ? 225 : 185;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    const img = { width, height, data, colorSpace: "srgb" } as ImageData;
    const rect = { x0: 0, y0: 0, x1: width, y1: height };
    const share = (mask: Uint8Array) => {
      let hit = 0;
      let total = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (letter(x, y)) {
            total++;
            hit += mask[y * width + x];
          }
      return hit / total;
    };
    // com o limiar por ladrilho (o das fichas) a palavra sumia da máscara
    expect(share(textMask(img, rect, 14, [], 0, "dark", false, false))).toBeGreaterThan(0.95);
  });
});

describe("caixa com marca-d'água (moldura de 2003)", () => {
  /**
   * Papel creme com a marca de uma guilda (um disco laranja-claro, 40 tons abaixo do papel, como
   * o sol dos Boros) e linhas de letras pretas por cima dela.
   */
  function markedBox() {
    const width = 745;
    const height = 1040;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const mark = Math.hypot(x - 370, y - 800) < 90;
        const letter = (y - 700) % 40 < 16 && (y - 700) % 40 >= 0 && x % 14 < 6 && x > 80 && x < 660 && y > 700 && y < 900;
        data.set(letter ? [20, 20, 20] : mark ? [240, 170, 130] : [235, 225, 215], i);
        data[i + 3] = 255;
      }
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  }
  const rect = { x0: 64, y0: 660, x1: 676, y1: 930 };
  const at = (mask: Uint8Array, x: number, y: number) => mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];

  it("só as letras saem: a marca, mesmo colorida e perto delas, fica para a rede neural refazer", () => {
    // (com um limiar baixo, a beira da marca entrava na máscara e a rede neural a apagava junto)
    const img = markedBox();
    const mask = textMask(img, rect, WATERMARK_2003.ink, [], WATERMARK_2003.color, textPolarity(img, rect));
    expect(at(mask, 86, 705)).toBe(1);
    expect(at(mask, 366, 745)).toBe(1);
    // a beira da marca (onde ela fica mais escura que a média em volta) no meio do vão entre
    // duas linhas de letras
    for (const [x, y] of [
      [444, 767],
      [301, 767],
      [455, 807],
      [441, 847],
    ])
      expect(at(mask, x, y), `${x},${y}`).toBe(0);
  });
});
