import { describe, expect, it } from "vitest";
import { bleedFor, bleedLayers, gridFor } from "../../src/lib/pdf";

describe("grade do PDF", () => {
  it("cabe 3 × 3 cartas de 63 × 88 mm na A4 e na Carta", () => {
    for (const paper of ["a4", "letter"] as const) {
      for (const mode of ["sleeve", "full"] as const) {
        const g = gridFor({ paper, mode, shrink: false });
        // impressoras caseiras não imprimem nos últimos ~4 mm de cada borda
        expect(g.x0).toBeGreaterThanOrEqual(4);
        expect(g.y0).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("usa o tamanho oficial no modo sleeve", () => {
    const g = gridFor({ paper: "a4", mode: "sleeve", shrink: false });
    expect([g.cw, g.ch, g.bleed]).toEqual([63, 88, 0]);
  });

  it("reduz 0,5 mm quando pedido", () => {
    const g = gridFor({ paper: "a4", mode: "sleeve", shrink: true });
    expect([g.cw, g.ch]).toEqual([62.5, 87.5]);
  });

  it("na sangria da arte sem borda vai a própria arte, não um filete preto", () => {
    const g = gridFor({ paper: "a4", mode: "full", shrink: false });
    expect(bleedLayers("black", g)).toEqual([{ kind: "color", rgb: [0.05, 0.05, 0.05] }]);
    const layers = bleedLayers("borderless", g);
    expect(layers[0].kind).toBe("color");
    expect(layers[1]).toEqual({ kind: "art", x: 0, y: 0, width: g.cellW, height: g.cellH });
    // sem sangria (modo sleeve), nada atrás da carta
    expect(bleedLayers("borderless", gridFor({ paper: "a4", mode: "sleeve", shrink: false }))).toEqual([]);
  });

  it("usa sangria menor na folha Carta", () => {
    expect(bleedFor({ paper: "a4", mode: "full", shrink: false })).toBe(2);
    expect(bleedFor({ paper: "letter", mode: "full", shrink: false })).toBe(1);
  });
});
