import { describe, expect, it } from "vitest";
import { normalizeName } from "../../src/lib/normalize";
import { aliasScore, editDistance, prefixDistance, suggestNames, type NameEntry } from "../../src/lib/suggest";

const NAMES: NameEntry[] = [
  ["sol", "Sol Ring", 1],
  ["liesa-dusk", "Liesa, Shroud of Dusk", 900],
  ["liesa-arch", "Liesa, Forgotten Archangel", 400],
  ["kona", "Kona, Rescue Beastie", 2000],
  ["bolt", "Lightning Bolt", 5],
  ["colt", "Lightning Colt", null],
  ["counter", "Counterspell", 20],
  ["citadel", "Bolas's Citadel", 300],
  ["llanowar", "Llanowar Elves | Elfos de Llanowar", 30],
].map(([id, aliases, rank]) => ({
  id: id as string,
  aliases: (aliases as string).split(" | ").map(normalizeName),
  rank: rank as number | null,
  token: false,
}));
NAMES.push({ id: "treasure", aliases: ["treasure"], rank: null, token: true });
NAMES.push({ id: "treasure-card", aliases: ["treasure"], rank: 9000, token: false });

const top = (q: string, token = false) => suggestNames(normalizeName(q), NAMES, { token }).map((s) => s.id);

describe("editDistance", () => {
  it("conta troca, falta, sobra e inversão como um erro cada", () => {
    expect(editDistance("sol ring", "sol ring")).toBe(0);
    expect(editDistance("sol rng", "sol ring")).toBe(1);
    expect(editDistance("sol rinng", "sol ring")).toBe(1);
    expect(editDistance("sol rign", "sol ring")).toBe(1);
    expect(editDistance("sol rong", "sol ring")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("para de contar ao passar do limite", () => {
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
  });

  it("acha o começo mais parecido do nome", () => {
    expect(prefixDistance("leisa shroud", "liesa shroud of dusk", 1)).toBe(1);
    expect(prefixDistance("liesa shrod", "liesa shroud of dusk", 1)).toBe(1);
    expect(prefixDistance("kona", "liesa shroud of dusk", 1)).toBe(2);
  });
});

describe("aliasScore", () => {
  it("dá nota menor ao que mais parece", () => {
    expect(aliasScore("sol ring", "sol ring")).toBe(0);
    expect(aliasScore("liesa", "liesa shroud of dusk")).toBe(1);
    expect(aliasScore("sol rng", "sol ring")).toBe(2);
    expect(aliasScore("counterspe", "counterspell")).toBe(2.5);
    expect(aliasScore("rescue beastie", "kona rescue beastie")).toBe(3);
    expect(aliasScore("leisa shroud", "liesa shroud of dusk")).toBe(4.5);
    expect(aliasScore("kona", "lightning bolt")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("suggestNames", () => {
  it("acha o nome com erro de digitação", () => {
    expect(top("Sol Rng")[0]).toBe("sol");
    expect(top("Lightening Bolt")).toEqual(["bolt", "colt"]);
    expect(top("Counterspel")[0]).toBe("counter");
    expect(top("Kona Resue Beastie")).toEqual(["kona"]);
  });

  it("acha pelo começo ou pelas palavras, a carta mais jogada primeiro", () => {
    expect(top("Liesa")).toEqual(["liesa-arch", "liesa-dusk"]);
    expect(top("Rescue Beastie")).toEqual(["kona"]);
    expect(top("Bolas Citadel")).toEqual(["citadel"]);
  });

  it("acha pelo nome em português", () => {
    expect(top("Elfos de Lanowar")).toEqual(["llanowar"]);
  });

  it("prefere a ficha na seção de fichas, e a carta fora dela", () => {
    expect(top("Tresure", true)[0]).toBe("treasure");
    expect(top("Tresure", false)[0]).toBe("treasure-card");
  });

  it("não sugere nada para nomes sem nada parecido ou curtos demais", () => {
    expect(top("Zzzzzzzzz")).toEqual([]);
    expect(top("S")).toEqual([]);
  });
});
