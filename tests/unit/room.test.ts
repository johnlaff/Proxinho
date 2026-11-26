import { describe, expect, it } from "vitest";
import { ROOM, roomCostLeft, roomFrame } from "../../src/engine/room";
import { splitHalves } from "../../src/app/preview";
import type { PtFace } from "../../src/engine/types";

// a carta deitada (ver room.ts)
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
 * Sala falsa nas medidas de DSK 205 (Walk-In Closet // Forgotten Cellar) deitada: as barras dos
 * nomes claras com letras escuras, a linha de tipo e a faixa do lembrete escuras com letras
 * brancas e as duas caixas de papel, com o relevo mais escuro no lado direito.
 */
function room({ white = false } = {}) {
  const c = canvas(gray(14));
  const frame = white ? gray(240) : ([24, 110, 70] as Color);
  c.fill(88, 30, 1000, 720, frame);
  for (const n of ROOM.names) {
    c.fill(n.x0 - 4, 37, n.x1, 89, gray(205));
    for (let x = n.x; x < n.x + 200; x += 18) c.fill(x, 49, x + 8, 77, gray(30));
  }
  c.fill(96, 402, 990, 442, gray(40));
  c.fill(96, 448, 990, 511, gray(45));
  for (let x = 110; x < 350; x += 14) c.fill(x, 415, x + 5, 432, gray(240));
  for (let x = 200; x < 900; x += 12) c.fill(x, 457, x + 4, 478, gray(240));
  for (const b of ROOM.boxes) {
    c.fill(b.x0 - 2, 520, b.x1 + 4, 708, gray(150));
    c.fill(b.x0, b.y0, b.x1, b.y1, gray(232));
    for (let y = 560; y < 680; y += 30) for (let x = b.x0 + 10; x < b.x1 - 40; x += 16) c.fill(x, y, x + 6, y + 18, gray(30));
  }
  return c;
}

describe("roomFrame", () => {
  it("reconhece a moldura das Salas deitada, de moldura colorida e branca", () => {
    expect(roomFrame(room().img)).toBe(true);
    expect(roomFrame(room({ white: true }).img)).toBe(true);
  });

  it("recusa a carta de pé e as faixas do meio claras", () => {
    const standing = { width: 745, height: 1040, data: new Uint8ClampedArray(745 * 1040 * 4), colorSpace: "srgb" } as ImageData;
    expect(roomFrame(standing)).toBe(false);
    const c = room();
    c.fill(96, 402, 990, 511, gray(200));
    expect(roomFrame(c.img)).toBe(false);
  });

  it("recusa a caixa sem o relevo do lado direito", () => {
    const c = room();
    const b = ROOM.boxes[1];
    c.fill(b.x1, 520, b.x1 + 6, 708, gray(232));
    expect(roomFrame(c.img)).toBe(false);
  });

  it("vale na escala da prévia", () => {
    const big = room().img;
    const w = Math.round(W * 0.656);
    const h = Math.round(H * 0.656);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = (Math.floor(y / 0.656) * W + Math.floor(x / 0.656)) * 4;
        data.set(big.data.subarray(s, s + 4), (y * w + x) * 4);
      }
    expect(roomFrame({ width: w, height: h, data, colorSpace: "srgb" } as ImageData)).toBe(true);
  });
});

describe("roomCostLeft", () => {
  it("conta o custo de cada metade a partir do fim da barra dela", () => {
    // (medidos no Walk-In Closet // Forgotten Cellar, DSK 205: o "2" começa em 438 e o "3", em 877)
    expect(roomCostLeft("{2}{G}", 0)).toBeCloseTo(437.4);
    expect(roomCostLeft("{3}{G}{G}", 1)).toBeCloseTo(878.1);
    expect(roomCostLeft("{2}{W/U}", 0)).toBeCloseTo(508 - 35.3 - 40);
    expect(roomCostLeft(null, 1)).toBe(984);
  });
});

describe("splitHalves", () => {
  const face = (name: string): PtFace => ({ name_en: name, name_pt: name, type_pt: null, text_pt: "", flavor_pt: null, mana_cost: null });

  it("pula a carta inteira que o Arena traz antes das metades", () => {
    const [a, b] = splitHalves([face("Walk-In Closet // Forgotten Cellar"), face("Walk-In Closet"), face("Forgotten Cellar")]) ?? [];
    expect([a?.name_en, b?.name_en]).toEqual(["Walk-In Closet", "Forgotten Cellar"]);
  });

  it("usa as duas faces quando só há as metades, e nada fora disso", () => {
    expect(splitHalves([face("Cramped Vents"), face("Access Maze")])?.map((f) => f.name_en)).toEqual(["Cramped Vents", "Access Maze"]);
    expect(splitHalves([face("Smelt // Herd // Saw")])).toBeNull();
  });
});
