import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../../src/app/model";
import type { CardRecord, PrintRecord } from "../../src/engine/types";

/**
 * Fila das prévias com o motor de mentira: cada montagem fica pendurada até o teste soltar, e as
 * cartas "da rede neural" são as de borda `borderless`.
 */
type Pending = { id: string; neural?: boolean; resolve: () => void; onNeural?: (p: { done: number; total: number }) => void };
async function setup() {
  const pending: Pending[] = [];
  vi.resetModules();
  vi.doMock("../../src/engine/render", () => ({
    usesNeuralFill: (print: PrintRecord) => print.border === "borderless",
    renderCard: (opts: { print: PrintRecord; neural?: boolean; onNeural?: Pending["onNeural"] }) =>
      new Promise((resolve) => {
        const canvas = { toBlob: (cb: (b: Blob) => void) => cb(new Blob([opts.print.id])) };
        pending.push({
          id: opts.print.id,
          neural: opts.neural,
          onNeural: opts.onNeural,
          resolve: () => resolve({ canvas, translated: true }),
        });
      }),
  }));
  vi.doMock("../../src/engine/lama", () => ({ prepareLama: vi.fn() }));
  vi.doMock("../../src/engine/fonts", () => ({ fontsVersion: () => 0 }));
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => `blob:${(b as Blob).size}`);
  const preview = await import("../../src/app/preview");
  const lama = await import("../../src/engine/lama");
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { preview, pending, flush, lama };
}

function entry(id: string, border: PrintRecord["border"] = "black"): Entry {
  const card: CardRecord = {
    oracle_id: `o-${id}`,
    name_en: id,
    name_pt: id,
    source: "arena",
    text_print: null,
    faces: [{ name_en: id, name_pt: id, type_pt: "Artefato", text_pt: "Texto.", flavor_pt: null, mana_cost: "{1}" }],
    pt_print: null,
    layout: "normal",
    type_line: "Artifact",
  };
  const print = {
    id,
    oracle_id: card.oracle_id,
    set_code: "sld",
    set_name: "Secret Lair",
    number: "1",
    released: null,
    artist: null,
    frame: "2015",
    effects: null,
    border,
    layout: "normal",
    highres: true,
    promo: false,
    mana_cost: "{1}",
    has_pt: false,
    two_sided: false,
    supported: true,
  } as PrintRecord;
  return { key: id, query: id, quantity: 1, section: "main", card, prints: [print], choice: { kind: "print", printId: id } };
}

afterEach(() => {
  vi.doUnmock("../../src/engine/render");
  vi.doUnmock("../../src/engine/lama");
  vi.doUnmock("../../src/engine/fonts");
  vi.restoreAllMocks();
});

describe("fila das prévias", () => {
  it("as cartas da rede neural esperam numa fila à parte: as comuns não ficam sem prévia", async () => {
    const { preview, pending, flush, lama } = await setup();
    // cinco artes sem borda esperando o modelo tomavam as quatro vagas da fila
    for (let i = 0; i < 5; i++) void preview.previewUrl(entry(`sb${i}`, "borderless"));
    const common = preview.previewUrl(entry("comum"));
    await flush();
    expect(pending.map((p) => p.id)).toEqual(["sb0", "comum"]);
    pending[1].resolve();
    expect(await common).toBe("blob:5");
    // o modelo começa a baixar já na primeira carta que vai precisar dele
    expect(lama.prepareLama).toHaveBeenCalled();
  });

  it("a carta aberta na gaveta passa na frente da fila da rede neural", async () => {
    const { preview, pending, flush } = await setup();
    const cards = [0, 1, 2, 3].map((i) => entry(`sb${i}`, "borderless"));
    for (const c of cards) void preview.previewUrl(c);
    preview.hurry(cards[3]);
    await flush();
    pending[0].resolve();
    await flush();
    await flush();
    expect(pending.map((p) => p.id)).toEqual(["sb0", "sb3"]);
  });

  it("o rascunho sai na fila comum, sem a rede neural, e só para as cartas que esperam por ela", async () => {
    const { preview, pending, flush } = await setup();
    const sb = entry("sb", "borderless");
    void preview.previewUrl(sb);
    const draft = preview.draftUrl(sb);
    expect(preview.draftUrl(entry("comum"))).toBeNull();
    await flush();
    // a acabada só começa a montar depois do rascunho (as duas disputavam a página)
    expect(pending.map((p) => [p.id, p.neural])).toEqual([["sb", false]]);
    expect(preview.neuralProgress("p:sb:pt:f0")).toEqual({ state: "running", done: 0, total: 0 });
    pending[0].resolve();
    expect(await draft).toBe("blob:2");
    await flush();
    expect(pending.map((p) => [p.id, p.neural])).toEqual([
      ["sb", false],
      ["sb", undefined],
    ]);
    // com a prévia acabada, o rascunho não volta
    pending[1].resolve();
    await flush();
    await flush();
    expect(preview.draftUrl(sb)).toBeNull();
  });

  it("o rascunho da carta aberta na gaveta começa na hora, mesmo com as quatro vagas tomadas", async () => {
    const { preview, pending, flush } = await setup();
    // seis comuns: quatro montando e duas esperando
    for (let i = 0; i < 6; i++) void preview.previewUrl(entry(`c${i}`));
    const sb = entry("sb", "borderless");
    void preview.previewUrl(sb);
    const draft = preview.draftUrl(sb);
    await flush();
    preview.hurry(sb);
    await flush();
    // no celular, esperar as quatro que já montavam deixava o acabamento chegar antes
    expect(pending.map((p) => `${p.id}${p.neural === false ? ":rascunho" : ""}`)).toEqual(["c0", "c1", "c2", "c3", "sb:rascunho"]);
    pending[4].resolve();
    expect(await draft).toBe("blob:2");
    // e o limite volta: quando uma comum acaba, só entra outra porque há vaga
    pending[0].resolve();
    await flush();
    await flush();
    expect(pending.map((p) => `${p.id}${p.neural === false ? ":rascunho" : ""}`)).toEqual([
      "c0",
      "c1",
      "c2",
      "c3",
      "sb:rascunho",
      "sb",
      "c4",
    ]);
  });

  it("num deck longo, o rascunho passa na frente das prévias comuns que esperam", async () => {
    const { preview, pending, flush } = await setup();
    // seis comuns antes: quatro montando e duas esperando
    for (let i = 0; i < 6; i++) void preview.previewUrl(entry(`c${i}`));
    const sb = [entry("sb0", "borderless"), entry("sb1", "borderless")];
    for (const c of sb) {
      void preview.previewUrl(c);
      void preview.draftUrl(c);
    }
    await flush();
    // os rascunhos entram depois das quatro que já montam, na ordem em que chegaram
    for (let i = 0; i < 3; i++) {
      pending.find((p) => p.id === `c${i}`)!.resolve();
      await flush();
      await flush();
    }
    const started = pending
      .filter((p) => p.neural === false || p.id.startsWith("c"))
      .map((p) => `${p.id}${p.neural === false ? ":rascunho" : ""}`);
    expect(started).toEqual(["c0", "c1", "c2", "c3", "sb0:rascunho", "sb1:rascunho", "c4"]);
  });

  it("a carta aberta na gaveta passa na frente também da fila comum", async () => {
    const { preview, pending, flush } = await setup();
    const cards = Array.from({ length: 8 }, (_, i) => entry(`c${i}`));
    for (const c of cards) void preview.previewUrl(c);
    await flush();
    preview.hurry(cards[7]);
    pending[0].resolve();
    await flush();
    await flush();
    expect(pending.map((p) => p.id)).toEqual(["c0", "c1", "c2", "c3", "c7"]);
  });

  it("o andamento de cada carta: na fila, rodando com os quadros, e some quando acaba", async () => {
    const { preview, pending, flush } = await setup();
    const [a, b] = [entry("sa", "borderless"), entry("sb", "borderless")];
    void preview.previewUrl(a);
    void preview.previewUrl(b);
    await flush();
    expect(preview.neuralProgress("p:sb:pt:f0")).toEqual({ state: "queued", done: 0, total: 0 });
    pending[0].onNeural?.({ done: 1, total: 3 });
    expect(preview.neuralProgress("p:sa:pt:f0")).toEqual({ state: "running", done: 1, total: 3 });
    pending[0].resolve();
    await flush();
    await flush();
    expect(preview.neuralProgress("p:sa:pt:f0")).toBeUndefined();
    expect(preview.neuralProgress("p:sb:pt:f0")).toEqual({ state: "running", done: 0, total: 0 });
  });

  it("a carta que saiu na original porque a rede neural não rodou fica marcada à parte da moldura", async () => {
    const { preview } = await setup();
    const { neuralMissKey, missKey } = await import("../../src/app/model");
    preview.noteRender("x", 0, false, "neural");
    preview.noteRender("y", 0, false);
    expect([...preview.engineMisses()].sort()).toEqual([missKey("x", 0), neuralMissKey("x", 0), missKey("y", 0)].sort());
  });
});
