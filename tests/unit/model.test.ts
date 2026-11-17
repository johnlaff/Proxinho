import { describe, expect, it } from "vitest";
import { buildOrder, countOutcomes, defaultChoice, outcomeOf, renderKey, toSheets, totalCards, type Entry } from "../../src/app/model";
import type { CardRecord, PrintRecord } from "../../src/engine/types";

function card(over: Partial<CardRecord> = {}): CardRecord {
  return {
    oracle_id: "o1",
    name_en: "Sol Ring",
    name_pt: "Anel Solar",
    source: "arena",
    text_print: null,
    faces: [
      {
        name_en: "Sol Ring",
        name_pt: "Anel Solar",
        type_pt: "Artefato",
        text_pt: "{T}: Adicione {C}{C}.",
        flavor_pt: null,
        mana_cost: "{1}",
      },
    ],
    pt_print: null,
    layout: "normal",
    type_line: "Artifact",
    ...over,
  };
}

function print(id: string, over: Partial<PrintRecord> = {}): PrintRecord {
  return {
    id,
    oracle_id: "o1",
    set_code: "c21",
    set_name: "Commander 2021",
    number: "1",
    released: "2021-01-01",
    artist: null,
    frame: "2015",
    effects: null,
    border: "black",
    layout: "normal",
    highres: true,
    promo: false,
    mana_cost: "{1}",
    has_pt: false,
    two_sided: false,
    supported: true,
    ...over,
  };
}

describe("defaultChoice", () => {
  it("respeita a coleção e o número pedidos na lista", () => {
    const prints = [print("a", { set_code: "cmr", number: "472" }), print("b", { set_code: "c21", number: "263" })];
    expect(defaultChoice(card(), prints, { set: "C21", number: "263" })).toEqual({ kind: "print", printId: "b" });
  });

  it("prefere arte suportada, em alta, sem promo e mais recente", () => {
    const prints = [
      print("antiga", { released: "2010-01-01" }),
      print("promo", { promo: true, released: "2024-01-01" }),
      print("baixa", { highres: false, released: "2025-01-01" }),
      print("lista", { set_code: "plst", released: "2024-06-01" }),
      print("nova", { released: "2023-01-01" }),
      print("sem-suporte", { supported: false, released: "2026-01-01" }),
    ];
    expect(defaultChoice(card(), prints)).toEqual({ kind: "print", printId: "nova" });
  });

  it("sem moldura suportada, usa a imagem oficial em português", () => {
    const c = card({ pt_print: { id: "pt", set: "war", number: "1", hires: true } });
    expect(defaultChoice(c, [print("x", { supported: false })])).toEqual({ kind: "pt" });
  });

  it("sem tradução e sem imagem PT, fica com a impressão em inglês", () => {
    const c = card({
      source: null,
      name_pt: null,
      faces: [{ name_en: "X", name_pt: null, type_pt: null, text_pt: null, flavor_pt: null, mana_cost: null }],
    });
    expect(defaultChoice(c, [print("en")])).toEqual({ kind: "print", printId: "en" });
  });
});

describe("buildOrder", () => {
  const resolved = [
    { query: "Sol Ring", card: card(), prints: [print("a")] },
    { query: "Anel Solar", card: card(), prints: [print("a")] },
    { query: "Nada", card: null, prints: [] },
  ];

  it("junta nomes em inglês e português da mesma carta e lista os não encontrados", () => {
    const { entries, missing } = buildOrder(
      [
        { quantity: 1, name: "Sol Ring", section: "main" },
        { quantity: 2, name: "Anel Solar", section: "main" },
        { quantity: 3, name: "Nada", section: "main" },
      ],
      resolved,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].quantity).toBe(3);
    expect(missing).toEqual([{ key: "nada", query: "Nada", quantity: 3 }]);
  });

  it("separa por seção e põe o comandante na primeira folha", () => {
    const { entries } = buildOrder(
      [
        { quantity: 9, name: "Sol Ring", section: "main" },
        { quantity: 1, name: "Anel Solar", section: "commander" },
      ],
      resolved,
    );
    expect(totalCards(entries)).toBe(10);
    const sheets = toSheets(entries);
    expect(sheets.map((s) => s.length)).toEqual([9, 1]);
    expect(sheets[0][0].entry.section).toBe("commander");
  });

  it("carta de duas faces ocupa dois espaços: frente e verso lado a lado", () => {
    const dfc: Entry = {
      key: "t",
      query: "Tovolar",
      quantity: 2,
      section: "main",
      card: card({ layout: "transform" }),
      prints: [print("tov", { layout: "transform", two_sided: true })],
      choice: { kind: "print", printId: "tov" },
    };
    expect(totalCards([dfc])).toBe(4);
    const [sheet] = toSheets([dfc]);
    expect(sheet.map((s) => s.side)).toEqual([0, 1, 0, 1]);
    expect(renderKey(dfc, 0, 1)).not.toBe(renderKey(dfc, 0, 0));
  });
});

describe("outcomeOf", () => {
  const base: Entry = {
    key: "k",
    query: "q",
    quantity: 2,
    section: "main",
    card: card(),
    prints: [print("a"), print("b", { supported: false })],
    choice: { kind: "print", printId: "a" },
  };

  it("diz com honestidade como a carta vai sair", () => {
    expect(outcomeOf(base)).toBe("reescrita");
    expect(outcomeOf({ ...base, choice: { kind: "print", printId: "b" } })).toBe("moldura");
    expect(outcomeOf({ ...base, choice: { kind: "pt" } })).toBe("imagem-pt");
    expect(outcomeOf({ ...base, card: card({ source: null }) })).toBe("sem-traducao");
    expect(countOutcomes([base]).reescrita).toBe(2);
  });
});
