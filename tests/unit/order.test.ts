import { describe, expect, it } from "vitest";
import {
  decodeOrder,
  encodeOrder,
  lineChoice,
  lineKey,
  lineQueries,
  orderCode,
  orderFrom,
  orderToText,
  type Line,
  type ResolvedLine,
} from "../../src/app/order";
import { mergeLines, parseDecklist } from "../../src/lib/decklist";
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

const ptPrint = { id: "pt1", set: "m14", number: "62", hires: true };

/** O que a API devolveria para estas linhas, com as cartas dadas por nome (e impressão). */
function api(
  lines: Line[],
  find: (q: { name: string; set?: string; number?: string }) => { card: CardRecord; prints: PrintRecord[] } | null,
): ResolvedLine[] {
  return lineQueries(lines).map((q) => ({
    query: q.name,
    set: q.set,
    number: q.number,
    token: q.token || undefined,
    card: null,
    prints: [],
    ...find(q),
  }));
}

const sol = card();
const solPrints = [
  print("sol-c21", { set_code: "c21", number: "263" }),
  print("sol-sld", { set_code: "sld", number: "2467", released: "2024-01-01" }),
];
const spiritW = card({ oracle_id: "sw", name_en: "Spirit", name_pt: "Espírito", layout: "token", type_line: "Token Creature — Spirit" });
const spiritU = card({ oracle_id: "su", name_en: "Spirit", name_pt: "Espírito", layout: "token", type_line: "Token Creature — Spirit" });
const spiritWPrints = [print("sw1", { oracle_id: "sw", set_code: "tstx", number: "3" })];
const spiritUPrints = [print("su1", { oracle_id: "su", set_code: "tneo", number: "4" })];
const sensory = card({ oracle_id: "sd", name_en: "Sensory Deprivation", name_pt: "Privação Sensorial", pt_print: ptPrint });
const sensoryPrints = [print("sd1", { oracle_id: "sd", set_code: "m14", number: "62" })];

function find(q: { name: string; set?: string; number?: string }) {
  if (q.name === "Sol Ring") return { card: sol, prints: solPrints };
  if (q.name === "Sensory Deprivation") return { card: sensory, prints: sensoryPrints };
  if (q.name === "Spirit") return q.set === "tneo" ? { card: spiritU, prints: spiritUPrints } : { card: spiritW, prints: spiritWPrints };
  return null;
}

const read = (text: string) => mergeLines(parseDecklist(text)) as Line[];

describe("lineKey e lineQueries", () => {
  it("casa nome, seção de fichas, coleção e número, sem ligar para maiúsculas e acentos", () => {
    expect(lineKey({ name: "Anel  Solar", set: "C21", number: "263" })).toBe(lineKey({ query: "anel solar", set: "c21", number: "263" }));
    expect(lineKey({ name: "Spirit", token: true })).not.toBe(lineKey({ name: "Spirit" }));
  });

  it("manda a impressão só com a coleção, e uma vez cada linha", () => {
    const qs = lineQueries(read("1 Sol Ring (C21) 263\n1 Sol Ring (C21) 263 *F*\n1 Sol Ring\nFichas\n1 Spirit (TSTX) 3"));
    expect(qs).toEqual([
      { name: "Sol Ring", token: false, set: "c21", number: "263" },
      { name: "Sol Ring", token: false },
      { name: "Spirit", token: true, set: "tstx", number: "3" },
    ]);
  });
});

describe("lineChoice", () => {
  it("usa a imagem em português quando a linha pede e ela existe", () => {
    expect(lineChoice(sensory, sensoryPrints, { quantity: 1, name: "x", section: "main", pt: true })).toEqual({ kind: "pt" });
    expect(lineChoice(sol, solPrints, { quantity: 1, name: "x", section: "main", pt: true })).toEqual({
      kind: "print",
      printId: "sol-sld",
    });
  });
});

describe("orderFrom", () => {
  it("acha cada ficha de mesmo nome pela impressão", () => {
    const lines = read("Fichas\n2 Spirit (TSTX) 3\n1 Spirit (TNEO) 4");
    const { entries } = orderFrom(lines, api(lines, find));
    expect(entries.map((e) => [e.card.oracle_id, e.quantity, e.choice])).toEqual([
      ["sw", 2, { kind: "print", printId: "sw1" }],
      ["su", 1, { kind: "print", printId: "su1" }],
    ]);
  });

  it("guarda a seção dos nomes não encontrados", () => {
    const lines = read("1 Sol Rng\nSideboard\n2 Duresss");
    expect(orderFrom(lines, api(lines, find)).missing).toEqual([
      { key: "main:sol rng", query: "Sol Rng", quantity: 1, section: "main" },
      { key: "side:duresss", query: "Duresss", quantity: 2, section: "side" },
    ]);
  });
});

describe("orderToText", () => {
  it("escreve as artes escolhidas, a imagem em português e os nomes não encontrados, por seção", () => {
    const lines = read("Comandante\n1 Sensory Deprivation *PT*\nDeck\n1 Sol Ring (C21) 263\n3 Sol Rng\nFichas\n1 Spirit (TNEO) 4");
    const order = orderFrom(lines, api(lines, find));
    expect(orderToText(order.entries, order.missing)).toBe(
      "Comandante\n1 Sensory Deprivation *PT*\n\nDeck\n1 Sol Ring (C21) 263\n3 Sol Rng\n\nFichas\n1 Spirit (TNEO) 4",
    );
  });

  it("volta ao mesmo pedido quando lido de novo (o pedido guardado e o link)", () => {
    const lines = read("1 Sol Ring (SLD) 2467\n1 Sensory Deprivation *PT*\nFichas\n2 Spirit (TNEO) 4");
    const first = orderFrom(lines, api(lines, find));
    const again = read(orderToText(first.entries, first.missing));
    const second = orderFrom(again, api(again, find));
    expect(second.entries.map((e) => [e.key, e.quantity, e.choice])).toEqual(first.entries.map((e) => [e.key, e.quantity, e.choice]));
  });

  it("leva uma impressão na ficha com imagem em português, para achar a ficha certa", () => {
    const token = { ...spiritU, pt_print: ptPrint };
    const entry = {
      key: "tokens:su",
      query: "Spirit",
      quantity: 1,
      section: "tokens" as const,
      card: token,
      prints: spiritUPrints,
      choice: { kind: "pt" as const },
    };
    expect(orderToText([entry])).toBe("Fichas\n1 Spirit (TNEO) 4 *PT*");
  });
});

describe("link do pedido", () => {
  it("comprime e volta igual, com acentos", async () => {
    const text =
      "Comandante\n1 Liesa, Shroud of Dusk (CMR) 286\n\nDeck\n" +
      Array.from({ length: 99 }, (_, i) => `1 Carta número ${i} (M21) ${i}`).join("\n");
    const code = await encodeOrder(text);
    expect(code).toMatch(/^[\w-]+$/);
    expect(code.length).toBeLessThan(text.length / 2);
    expect(await decodeOrder(code)).toBe(text);
  });

  it("recusa link cortado ou alterado", async () => {
    const code = await encodeOrder("1 Sol Ring (C21) 263\n1 Arcane Signet");
    await expect(decodeOrder(code.slice(0, 8))).rejects.toThrow();
    await expect(decodeOrder("não é código")).rejects.toThrow();
  });

  it("lê o código do endereço", () => {
    expect(orderCode("#pedido=abc-_1")).toBe("abc-_1");
    expect(orderCode("#como-funciona")).toBeNull();
    expect(orderCode("")).toBeNull();
  });
});
