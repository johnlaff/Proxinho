import { describe, expect, it } from "vitest";
import { browserGpu, formatEta, neuralLine, neuralWhere, OUTCOME_LABEL } from "../../src/app/labels";
import {
  buildOrder,
  countOutcomes,
  defaultChoice,
  entriesFrom,
  flavorApplies,
  mergeEntries,
  missKey,
  neuralMissKey,
  outcomeOf,
  renderKey,
  sortEntries,
  toSheets,
  tokenDetails,
  tokenSuggestions,
  totalCards,
  type Entry,
} from "../../src/app/model";
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

  it("prefere a moldura com borda à arte sem borda, mesmo mais nova", () => {
    const prints = [print("sem-borda", { border: "borderless", released: "2025-01-01" }), print("comum", { released: "2021-01-01" })];
    expect(defaultChoice(card(), prints)).toEqual({ kind: "print", printId: "comum" });
    expect(defaultChoice(card(), [print("sem-borda", { border: "borderless" })])).toEqual({ kind: "print", printId: "sem-borda" });
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

  it("moldura que o motor não reconheceu na imagem sai em inglês, e a interface diz isso (Garruk espelhado, SLD 9995)", () => {
    // os dados não separam esse desenho da moldura comum: só a montagem descobre
    const misses = new Set([missKey("a", 0)]);
    expect(outcomeOf(base, misses)).toBe("moldura");
    expect(countOutcomes([base], misses)).toMatchObject({ reescrita: 0, moldura: 2 });
    // outra arte da mesma carta não herda a falha
    expect(outcomeOf({ ...base, prints: [print("c"), ...base.prints], choice: { kind: "print", printId: "c" } }, misses)).toBe("reescrita");
    // só a frente decide a etiqueta da carta
    expect(outcomeOf(base, new Set([missKey("a", 1)]))).toBe("reescrita");
  });

  it("sem borda que saiu na original porque a rede neural não rodou não culpa a moldura (Chrome do celular)", () => {
    // a etiqueta dizia "esta moldura ainda não é reescrita" ao lado da nota do apagador
    const misses = new Set([missKey("a", 0), neuralMissKey("a", 0)]);
    expect(outcomeOf(base, misses)).toBe("apagador");
    expect(countOutcomes([base], misses)).toMatchObject({ reescrita: 0, moldura: 0, apagador: 2 });
    expect(OUTCOME_LABEL.apagador).toBe("Em inglês: o apagador de texto não rodou neste navegador");
  });
});

describe("fichas", () => {
  const spirit = card({
    oracle_id: "t1",
    name_en: "Spirit",
    name_pt: "Espírito",
    layout: "token",
    faces: [
      {
        name_en: "Spirit",
        name_pt: "Espírito",
        type_pt: "Criatura Ficha — Espírito",
        text_pt: "Voar",
        flavor_pt: null,
        mana_cost: null,
        pt: "1/1",
        colors: "WB",
      },
    ],
  });

  it("sugere as fichas que as cartas criam, sem repetir as que já estão no pedido", () => {
    const [a] = entriesFrom([{ card: card({ oracle_id: "c1", tokens: ["t1", "t2"] }), prints: [print("p1")] }]);
    const [b] = entriesFrom([{ card: card({ oracle_id: "c2", tokens: ["t2", "t3"] }), prints: [print("p2")] }]);
    expect(tokenSuggestions([a, b])).toEqual(["t1", "t2", "t3"]);
    const [tok] = entriesFrom([{ card: spirit, prints: [print("p3", { layout: "token" })] }]);
    expect(tokenSuggestions([a, b, tok], new Set(["t3"]))).toEqual(["t2"]);
  });

  it("fichas entram na seção de fichas e vão para o fim das folhas", () => {
    const [tok] = entriesFrom([{ card: spirit, prints: [print("p3")] }]);
    expect(tok.section).toBe("tokens");
    const [c] = entriesFrom([{ card: card(), prints: [print("p1")] }]);
    expect(sortEntries([tok, c]).map((e) => e.card.oracle_id)).toEqual(["o1", "t1"]);
  });

  it("descreve P/R e cores para distinguir fichas de mesmo nome", () => {
    expect(tokenDetails(spirit)).toBe("1/1 branca e preta");
    expect(tokenDetails(card({ faces: [{ ...spirit.faces[0], pt: null, colors: "" }] }))).toBe("incolor");
    expect(tokenDetails(card({ layout: "token", type_line: "Emblem — Chandra" }))).toBe("emblema");
  });

  it("somar a mesma entrada aumenta a quantidade", () => {
    const [tok] = entriesFrom([{ card: spirit, prints: [print("p3")] }]);
    const merged = mergeEntries([tok], [tok, tok]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });
});

describe("flavorApplies (o flavor em PT de outra arte)", () => {
  const spock = card({ text_print: { set: "trc", number: "194" } });
  it("vale na impressão de onde veio o texto", () => {
    expect(flavorApplies(spock, print("a", { set_code: "TRC", number: "194" }))).toBe(true);
  });
  it("vale na arte com o mesmo flavor em inglês (a promo de arte estendida)", () => {
    expect(flavorApplies(spock, print("b", { set_code: "pmei", number: "2026-23", text_flavor: true }))).toBe(true);
  });
  it("não vale na arte com outro flavor ou sem flavor", () => {
    expect(flavorApplies(spock, print("c", { set_code: "pmei", number: "2026-23" }))).toBe(false);
    expect(flavorApplies(spock, print("d", { set_code: "sld", number: "1", text_flavor: false }))).toBe(false);
  });
  it("sem impressão do texto, nunca vale", () => {
    expect(flavorApplies(card(), print("e", { text_flavor: true }))).toBe(false);
  });
});

describe("neuralLine", () => {
  const idle = { stage: "idle" as const, loaded: 0, total: 0, backend: null, frameMs: 0, since: 0, reason: "" };
  const running = { state: "running" as const, done: 0, total: 3 };

  it("na fila, só diz que está na fila; a etapa do modelo é da carta que está na vez", () => {
    const line = neuralLine({ ...idle, stage: "download", loaded: 1, total: 2 }, { state: "queued", done: 0, total: 0 });
    expect(line).toEqual({ text: "Na fila do acabamento: as cartas antes desta vão primeiro.", short: "Na fila", percent: null });
  });

  it("na vez da carta, segue o download (com % só quando o tamanho é conhecido) e o preparo", () => {
    expect(neuralLine({ ...idle, stage: "download", loaded: 18e6, total: 37e6 }, running)).toEqual({
      text: "Baixando o apagador de texto: 48%",
      short: "Baixando 48%",
      percent: 48,
    });
    // (no fim do download, para no 99 até a rede ficar pronta)
    expect(neuralLine({ ...idle, stage: "download", loaded: 37e6, total: 37e6 }, running)?.percent).toBe(99);
    expect(neuralLine({ ...idle, stage: "download", loaded: 1e6, total: 0 }, running)?.percent).toBeNull();
    expect(neuralLine({ ...idle, stage: "prepare" }, running)?.text).toBe("Preparando o apagador de texto…");
    // antes do primeiro quadro, a carta ainda está sendo apagada
    expect(neuralLine({ ...idle, stage: "run" }, { state: "running", done: 0, total: 0 })?.text).toBe("Apagando o inglês…");
  });

  it("nos quadros da carta, diz a parte e o tempo que falta pela média dos quadros anteriores", () => {
    expect(neuralLine({ ...idle, stage: "run", since: 1000 }, running, 2000)).toEqual({
      text: "Acabamento: parte 1 de 3, calculando o tempo",
      short: "Acabamento 1/3",
      percent: 0,
    });
    // 20 s por quadro, 5 s do segundo já rodaram: faltam 35 s
    expect(neuralLine({ ...idle, stage: "run", frameMs: 20_000, since: 1000 }, { ...running, done: 1 }, 6000)).toEqual({
      text: "Acabamento: parte 2 de 3, cerca de 35 s",
      short: "Acabamento 2/3",
      percent: 41,
    });
    expect(neuralLine({ ...idle, stage: "failed" }, running)).toBeNull();
    expect(neuralLine(idle, undefined)).toBeNull();
  });

  it("diz onde o acabamento roda e, no Firefox sem placa de vídeo, aponta o Chrome", () => {
    const firefoxAndroid = "Mozilla/5.0 (Android 14; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0";
    const chromeAndroid =
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
    expect(browserGpu({ userAgent: firefoxAndroid })).toEqual({ gpu: false, firefox: true });
    expect(browserGpu({ gpu: {}, userAgent: chromeAndroid })).toEqual({ gpu: true, firefox: false });
    // antes de o modelo ficar pronto não se sabe onde ele roda
    expect(neuralWhere(null, { gpu: false, firefox: true })).toBeNull();
    expect(neuralWhere("webgpu", { gpu: true, firefox: false })).toBe("Rodando na placa de vídeo deste aparelho.");
    expect(neuralWhere("wasm", browserGpu({ userAgent: firefoxAndroid }))).toMatch(/^Rodando no processador: o Firefox .* No Chrome/);
    // com a placa de vídeo no navegador, a falha foi dela (ou o adaptador era de software): sem trocar de navegador
    expect(neuralWhere("wasm", { gpu: true, firefox: true })).toBe(
      "Rodando no processador: a placa de vídeo deste aparelho não serviu para o acabamento.",
    );
    expect(neuralWhere("wasm", { gpu: false, firefox: false })).toBe(
      "Rodando no processador: este navegador ainda não deixa sites usarem a placa de vídeo.",
    );
  });

  it("arredonda o tempo para não piscar a cada segundo", () => {
    expect(formatEta(4000)).toBe("alguns segundos");
    expect(formatEta(31_000)).toBe("cerca de 35 s");
    expect(formatEta(56_000)).toBe("cerca de 1 min");
    expect(formatEta(150_000)).toBe("cerca de 3 min");
  });
});
