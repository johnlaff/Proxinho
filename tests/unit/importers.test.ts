import { afterEach, describe, expect, it, vi } from "vitest";
import { importDeck, ImportError } from "../../worker/importers";

afterEach(() => vi.unstubAllGlobals());

describe("importDeck", () => {
  it("recusa sites fora da lista (o Worker não é um proxy aberto)", async () => {
    await expect(importDeck("https://exemplo.com/deck/1")).rejects.toBeInstanceOf(ImportError);
  });

  it("lê um deck público do Archidekt e ignora o maybeboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          name: "Kona",
          categories: [
            { name: "Commander", includedInDeck: true, isPremier: true },
            { name: "Maybeboard", includedInDeck: false },
          ],
          cards: [
            {
              quantity: 1,
              categories: ["Commander"],
              card: { oracleCard: { name: "Kona, Rescue Beastie" }, edition: { editioncode: "dsk" }, collectorNumber: "299" },
            },
            {
              quantity: 1,
              categories: ["Ramp"],
              card: { oracleCard: { name: "Sol Ring" }, edition: { editioncode: "c21" }, collectorNumber: "263" },
            },
            {
              quantity: 1,
              categories: ["Maybeboard"],
              card: { oracleCard: { name: "Talvez" }, edition: { editioncode: "x" }, collectorNumber: "1" },
            },
          ],
        }),
      ),
    );
    const deck = await importDeck("https://archidekt.com/decks/28326108/kona");
    expect(deck.source).toBe("Archidekt");
    expect(deck.cards.map((c) => c.name)).toEqual(["Kona, Rescue Beastie", "Sol Ring"]);
    expect(deck.cards[0].section).toBe("commander");
  });
});
