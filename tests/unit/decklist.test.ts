import { describe, expect, it } from "vitest";
import { mergeLines, parseDecklist } from "../../src/lib/decklist";

describe("parseDecklist", () => {
  it("lê o formato simples do MTGO", () => {
    expect(parseDecklist("1 Sol Ring\n4 Lightning Bolt")).toMatchObject([
      { quantity: 1, name: "Sol Ring", section: "main" },
      { quantity: 4, name: "Lightning Bolt", section: "main" },
    ]);
  });

  it("aceita '1x' e linhas sem quantidade", () => {
    expect(parseDecklist("1x Sol Ring\nCounterspell")).toMatchObject([
      { quantity: 1, name: "Sol Ring" },
      { quantity: 1, name: "Counterspell" },
    ]);
  });

  it("lê coleção e número no formato Arena/Moxfield", () => {
    expect(parseDecklist("1 Sol Ring (C21) 263 *F*")).toMatchObject([{ name: "Sol Ring", set: "c21", number: "263", foil: true }]);
  });

  it("limpa categorias e tags do Archidekt", () => {
    expect(parseDecklist("1x Sol Ring (c21) 263 [Ramp] ^Have,#37d67a^")).toMatchObject([{ name: "Sol Ring", set: "c21", number: "263" }]);
  });

  it("reconhece seções em inglês e português", () => {
    const lines = parseDecklist("Comandante\n1 Liesa, Shroud of Dusk\n\nDeck\n1 Anel Solar\nSideboard\n1 Duress\nMaybeboard\n1 Mind Stone");
    expect(lines.map((l) => [l.name, l.section])).toEqual([
      ["Liesa, Shroud of Dusk", "commander"],
      ["Anel Solar", "main"],
      ["Duress", "side"],
    ]);
  });

  it("aceita cabeçalhos com // e contagem", () => {
    const lines = parseDecklist("// Commander (1)\n1 Kona, Rescue Beastie\n// Mainboard (99)\n1 Forest");
    expect(lines.map((l) => l.section)).toEqual(["commander", "main"]);
  });

  it("entende o prefixo SB: do MTGO", () => {
    expect(parseDecklist("SB: 2 Duress")).toMatchObject([{ quantity: 2, name: "Duress", section: "side" }]);
  });

  it("normaliza cartas de duas faces escritas com uma barra", () => {
    expect(parseDecklist("1 Delver of Secrets / Insectile Aberration")[0].name).toBe("Delver of Secrets // Insectile Aberration");
  });

  it("ignora comentários e linhas vazias", () => {
    expect(parseDecklist("# meu deck\n\n   \n1 Sol Ring")).toHaveLength(1);
  });

  it("mantém nomes com vírgula e apóstrofo", () => {
    expect(parseDecklist("1 Bolas's Citadel\n1 Kona, Rescue Beastie").map((l) => l.name)).toEqual([
      "Bolas's Citadel",
      "Kona, Rescue Beastie",
    ]);
  });
});

describe("mergeLines", () => {
  it("soma linhas repetidas", () => {
    expect(mergeLines(parseDecklist("1 Forest\n2 Forest"))).toMatchObject([{ name: "Forest", quantity: 3 }]);
  });
});
