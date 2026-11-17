import { describe, expect, it } from "vitest";
import { findLoyaltyIcons, isTallPlaneswalker, planeswalkerRows, splitAbilities, stripLoyaltyCost } from "../../src/engine/planeswalker";

/**
 * Planeswalker falso 745×1040: caixa clara, faixas alternando de tom e
 * escudos pretos nos centros pedidos. A moldura à esquerda é preta (como nos
 * planeswalkers pretos) e não pode virar escudo.
 */
function fakePw(icons: number[], bands: number[]): ImageData {
  const width = 745;
  const height = 1040;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const band = bands.filter((b) => b <= y).length % 2;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v = band ? 200 : 216;
      if (x >= 45 && x < 89) v = (x + y) % 3 ? 10 : 60; // moldura preta, escura como o escudo
      if (icons.some((c) => Math.abs(y - c) < 15) && x >= 46 && x < 106) v = 12;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("planeswalker", () => {
  it("acha os escudos de lealdade e ignora a moldura texturizada", () => {
    const icons = findLoyaltyIcons(fakePw([700, 790, 885], []), 656, 944);
    expect(icons).toHaveLength(3);
    [700, 790, 885].forEach((c, i) => expect(Math.abs(icons[i] - c)).toBeLessThanOrEqual(2));
  });

  it("divide a caixa nas divisas de tom, com a estática em cima", () => {
    const rows = planeswalkerRows(fakePw([790, 885], [745, 835]), 3);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.loyalty)).toEqual([false, true, true]);
    expect(rows![0].y1).toBeGreaterThan(735);
    expect(rows![0].y1).toBeLessThan(755);
    expect(rows![1].y1).toBeGreaterThan(825);
    expect(rows![1].y1).toBeLessThan(845);
  });

  it("desiste quando há mais escudos que habilidades", () => {
    expect(planeswalkerRows(fakePw([700, 790, 885], []), 2)).toBeNull();
  });

  it("4 habilidades usam a caixa alta", () => {
    expect(isTallPlaneswalker(4)).toBe(true);
    expect(isTallPlaneswalker(3)).toBe(false);
  });

  it("tira o custo de lealdade do começo da habilidade", () => {
    expect(stripLoyaltyCost("+1: Compre um card.")).toBe("Compre um card.");
    expect(stripLoyaltyCost("−3: Destrua.")).toBe("Destrua.");
    expect(stripLoyaltyCost("[-X]: Algo.")).toBe("Algo.");
    expect(stripLoyaltyCost("Voar")).toBe("Voar");
  });

  it("separa habilidades do texto impresso que veio sem quebras de linha", () => {
    expect(splitAbilities('+1: Desvire.−2: Revele.−8: Você recebe um emblema com "Algo." Depois, crie.')).toEqual([
      "Desvire.",
      "Revele.",
      'Você recebe um emblema com "Algo." Depois, crie.',
    ]);
  });
});
