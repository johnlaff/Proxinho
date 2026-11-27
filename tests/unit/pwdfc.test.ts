import { describe, expect, it } from "vitest";
import { hasRightIcon } from "../../src/engine/erase";
import { clipBoxFoot, hasLoyaltyBox } from "../../src/engine/planeswalker";

/** Imagem falsa da escala-base (745 × 1040), de barra cinza, com o ícone das de duas faces à direita do nome. */
function withIcon(y0: number, y1: number) {
  const w = 745;
  const h = 1040;
  const data = new Uint8ClampedArray(w * h * 4).fill(200);
  for (let y = y0; y < y1; y++)
    for (let x = 660; x < 700; x++) {
      const i = (y * w + x) * 4;
      // o disco escuro com o triângulo claro
      data[i] = data[i + 1] = data[i + 2] = (x - 660) % 3 === 0 ? 235 : 25;
    }
  return { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
}

describe("hasRightIcon", () => {
  it("acha o ícone na barra do nome da M15", () => {
    expect(hasRightIcon(withIcon(62, 102))).toBe(true);
  });

  it("no planeswalker a barra do nome fica 19 px acima, e a busca sobe junto (ADR 0050)", () => {
    const pw = withIcon(44, 82);
    expect(hasRightIcon(pw)).toBe(false);
    expect(hasRightIcon(pw, -19)).toBe(true);
  });

  it("sem o ícone, nada", () => {
    expect(hasRightIcon(withIcon(0, 0), -19)).toBe(false);
  });
});

/** Imagem da escala-base com o papel claro da caixa até o fio do pé (`foot(x)`), o fio escuro e a borda. */
function boxFoot(foot: (x: number) => number, shield = false) {
  const w = 745;
  const h = 1040;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = y >= foot(x) || x >= 688 ? (y < foot(x) + 4 ? 20 : 80) : 205;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  if (shield)
    for (let y = 922; y < 1010; y++)
      for (let x = 615; x < 735; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 15;
      }
  return { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
}
/** O fio do pé da caixa do verso sem a lealdade: reto até x 640 e subindo na curva até o lado. */
const curve = (x: number) => (x < 640 ? 950 : Math.round(950 - ((x - 640) * (x - 640)) / 110));

describe("hasLoyaltyBox", () => {
  it("acha o escudo da lealdade inicial no canto", () => {
    expect(hasLoyaltyBox(boxFoot(curve, true))).toBe(true);
  });

  it("o verso que vem de outro planeswalker não o tem (ADR 0050)", () => {
    expect(hasLoyaltyBox(boxFoot(curve))).toBe(false);
  });
});

describe("clipBoxFoot", () => {
  const rect = { x0: 96, y0: 860, x1: 687, y1: 956 };
  const region = (fill: (x: number, y: number) => boolean) => {
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    for (let y = rect.y0; y < rect.y1; y++)
      for (let x = rect.x0; x < rect.x1; x++) mask[(y - rect.y0) * w + x - rect.x0] = fill(x, y) ? 1 : 0;
    return { rect, mask, polarity: "dark" as const };
  };
  const at = (m: ReturnType<typeof region>, x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];

  it("tira da máscara o fio do canto e a folga em volta dele", () => {
    const img = boxFoot(curve);
    // o fio e a folga de 4 px que a máscara das letras ganhou em volta dele
    const m = region((x, y) => y >= curve(x) - 4);
    clipBoxFoot(img, m);
    expect(at(m, 680, curve(680))).toBe(0);
    expect(at(m, 680, curve(680) - 3)).toBe(0);
    expect(at(m, 620, 948)).toBe(0);
    expect(m.mask.some(Boolean)).toBe(false);
  });

  it("as letras da última linha ficam, com a borda delas", () => {
    const img = boxFoot(curve);
    // uma letra de x 650 a 660, de y 915 a 932, 8 px acima da curva, emendada com a folga do fio
    const letter = (x: number, y: number) => x >= 650 && x < 660 && y >= 915 && y < 932;
    const m = region((x, y) => letter(x, y) || y >= curve(x) - 6);
    clipBoxFoot(img, m);
    expect(at(m, 655, 920)).toBe(1);
    expect(at(m, 655, 931)).toBe(1);
    // a folga do fio longe da letra sai
    expect(at(m, 630, 946)).toBe(0);
    expect(at(m, 682, curve(682) - 3)).toBe(0);
  });
});
