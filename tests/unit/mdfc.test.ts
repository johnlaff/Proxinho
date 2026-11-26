import { describe, expect, it } from "vitest";
import { beside, mdfcCostLeft } from "../../src/engine/geometry";
import { mdfcHint } from "../../src/engine/mdfc";
import type { PtFace } from "../../src/engine/types";

const face = (name_en: string, type_pt: string, text_pt = ""): PtFace => ({
  name_en,
  name_pt: name_en,
  type_pt,
  text_pt,
  flavor_pt: null,
  mana_cost: null,
});

describe("mdfcHint (a faixa de baixo das cartas modais, ADR 0029)", () => {
  it("terreno do outro lado: 'Terreno' e a habilidade de mana dele, como na impressão em PT", () => {
    const land = face(
      "Shatterskull, the Hammer Pass",
      "Terreno",
      "Conforme este terreno entra, você pode pagar 3 pontos de vida.\n{T}: Adicione {R}.",
    );
    expect(mdfcHint(land, "Land", null, "2020-09-25")).toEqual({ word: "Terreno", mana: "{T}: Adicione {R}." });
    const chapel = face("Age-Graced Chapel", "Terreno", "Este terreno entra virado.\n{T}: Adicione {W} ou {B}.");
    expect(mdfcHint(chapel, "Land", null, "2024-06-14")).toEqual({ word: "Terreno", mana: "{T}: Adicione {W} ou {B}." });
  });

  it("terreno sem a habilidade de mana em PT: a faixa fica como está", () => {
    expect(mdfcHint(face("X", "Terreno", "Este terreno entra virado."), "Land", null, "2020-09-25")).toBeNull();
  });

  it("sem subtipo: o tipo, sem os supertipos", () => {
    expect(mdfcHint(face("Shatterskull Smashing", "Feitiço"), "Sorcery", null, "2020-09-25")?.word).toBe("Feitiço");
    expect(mdfcHint(face("Hagra Mauling", "Mágica Instantânea"), "Instant", null, "2020-09-25")?.word).toBe("Mágica Instantânea");
    expect(mdfcHint(face("Valkmira, Protector's Shield", "Artefato Lendário"), "Legendary Artifact", null, "2021-02-05")?.word).toBe(
      "Artefato",
    );
    expect(
      mdfcHint(face("Kaldring, the Rimestaff", "Artefato Lendário da Neve"), "Legendary Snow Artifact", null, "2021-02-05")?.word,
    ).toBe("Artefato");
  });

  it("com subtipo: o último, em português, na mesma posição da linha de tipo oficial", () => {
    expect(mdfcHint(face("Skyclave Cleric", "Criatura — Kor Clérigo"), "Creature — Kor Cleric", "1/3", "2020-09-25")).toEqual({
      word: "Clérigo",
      mana: null,
    });
    expect(
      mdfcHint(face("Tibalt, Cosmic Impostor", "Planeswalker Lendário — Tibalt"), "Legendary Planeswalker — Tibalt", null, "2021-02-05")
        ?.word,
    ).toBe("Tibalt");
    expect(mdfcHint(face("Glasswing Grace", "Encantamento — Aura"), "Enchantment — Aura", null, "2024-06-14")?.word).toBe("Aura");
    expect(
      mdfcHint(face("Imbraham, Dean of Theory", "Criatura Lendária — Ave Mago"), "Legendary Creature — Bird Wizard", "3/3", "2021-04-23")
        ?.word,
    ).toBe("Mago");
  });

  it("as duas de Modern Horizons 3 que escrevem o primeiro subtipo", () => {
    expect(mdfcHint(face("Witch Enchanter", "Criatura — Humano Bruxo"), "Creature — Human Warlock", "2/2", "2024-06-14")?.word).toBe(
      "Humano",
    );
    expect(mdfcHint(face("Disciple of Freyalise", "Criatura — Elfo Druida"), "Creature — Elf Druid", "3/3", "2024-06-14")?.word).toBe(
      "Elfo",
    );
    expect(mdfcHint(face("Pinnacle Monk", "Criatura — Djinn Monge"), "Creature — Djinn Monk", "2/2", "2024-06-14")?.word).toBe("Monge");
  });

  it("desde Marvel's Spider-Man: 'Criatura 4/4'", () => {
    const peter = face("Peter Parker", "Criatura Lendária — Humano Cientista Herói");
    expect(mdfcHint(peter, "Legendary Creature — Human Scientist Hero", "0/1", "2025-09-26")?.word).toBe("Criatura 0/1");
    const ironMan = face("The Invincible Iron Man", "Criatura Artefato Lendária — Humano Herói");
    expect(mdfcHint(ironMan, "Legendary Artifact Creature — Human Hero", "5/5", "2026-06-26")?.word).toBe("Criatura 5/5");
  });

  it("subtipos que não batem com a linha de tipo em PT: a faixa fica como está", () => {
    expect(mdfcHint(face("X", "Criatura — Dragão"), "Creature — Elder Dragon", "4/4", "2020-09-25")).toBeNull();
    expect(mdfcHint(face("X", null as unknown as string), "Creature — Elf", "1/1", "2020-09-25")).toBeNull();
  });
});

describe("mdfcCostLeft", () => {
  it("cada símbolo ~24 px e os híbridos ~27, acabando em x ≈ 320 (medido em ZNR, STX e MH3)", () => {
    expect(mdfcCostLeft("{X}{R}{R}")).toBe(248);
    expect(mdfcCostLeft("{B}")).toBe(296);
    expect(mdfcCostLeft("{3}{W/B}{W/B}")).toBe(242);
    expect(mdfcCostLeft(null)).toBe(320);
  });
});

describe("beside", () => {
  it("tira das linhas da faixa o que fica à esquerda do fim dela e deixa o resto", () => {
    const hole = { x0: 48, y0: 929, x1: 322, y1: 962 };
    // a proteção do selo, que entrava na faixa pela borda preta
    expect(beside([{ x0: 300, y0: 920, x1: 410, y1: 990 }], hole)).toEqual([
      { x0: 300, y0: 920, x1: 410, y1: 929 },
      { x0: 322, y0: 929, x1: 410, y1: 962 },
      { x0: 300, y0: 962, x1: 410, y1: 990 },
    ]);
    // fora das linhas da faixa, ou já à direita dela: fica como está
    expect(beside([{ x0: 300, y0: 900, x1: 410, y1: 920 }], hole)).toEqual([{ x0: 300, y0: 900, x1: 410, y1: 920 }]);
    expect(beside([{ x0: 330, y0: 940, x1: 410, y1: 950 }], hole)).toEqual([{ x0: 330, y0: 940, x1: 410, y1: 950 }]);
    // inteira dentro da faixa: sai
    expect(beside([{ x0: 300, y0: 940, x1: 320, y1: 950 }], hole)).toEqual([]);
  });
});
