import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardBackend, StoredCard } from "../../src/app/cardStore";
import type { Entry } from "../../src/app/model";
import type { CardRecord, PrintRecord } from "../../src/engine/types";

/** Banco das cartas guardadas na memória, sobrevivendo à "visita seguinte" (módulos recarregados). */
function memory() {
  const cards = new Map<string, StoredCard>();
  const usage = new Map<string, { id: string; at: number; size: number }>();
  const backend: CardBackend = {
    get: async (id) => cards.get(id),
    put: async (id, card, u) => {
      cards.set(id, card);
      usage.set(id, u);
    },
    touch: async (u) => void usage.set(u.id, u),
    usage: async () => [...usage.values()],
    remove: async (ids) => ids.forEach((id) => (cards.delete(id), usage.delete(id))),
  };
  return { cards, usage, backend };
}

type Result = { translated: boolean; reason?: "neural" };
/**
 * Uma visita ao site: módulos novos, o motor de mentira (cada montagem fica pendurada até o teste
 * soltar) e o mesmo banco das cartas guardadas.
 */
async function visit(db: CardBackend, fonts = "o|o", server = new Map<string, { body: string; translated: boolean }>()) {
  const renders: { id: string; version: string; resolve: (r?: Result) => void }[] = [];
  vi.resetModules();
  vi.doMock("../../src/engine/render", () => ({
    usesNeuralFill: (print: PrintRecord) => print.border === "borderless",
    renderCard: (opts: { print: PrintRecord; imageVersion: string }) =>
      new Promise((resolve) => {
        const canvas = { toBlob: (cb: (b: Blob) => void) => cb(new Blob([`${opts.print.id}:${opts.imageVersion}`])) };
        renders.push({
          id: opts.print.id,
          version: opts.imageVersion,
          resolve: (r = { translated: true }) => resolve({ canvas, ...r }),
        });
      }),
  }));
  const prepareLama = vi.fn();
  vi.doMock("../../src/engine/lama", () => ({ prepareLama }));
  vi.doMock("../../src/engine/fonts", () => ({ fontsVersion: () => 0, fontsId: () => fonts, loadCardFonts: async () => undefined }));
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => `blob:${(b as Blob).size}`);
  // as cartas montadas no servidor (ADR 0022), pelo caminho
  const fetches: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => {
    fetches.push(path);
    const hit = server.get(path);
    if (!hit) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    return new Response(hit.body, { headers: { "content-type": "image/jpeg", "x-traduzida": hit.translated ? "1" : "0" } });
  });
  const store = await import("../../src/app/cardStore");
  store.useCardBackend(db);
  const preview = await import("../../src/app/preview");
  const faces = await import("../../src/app/printFaces");
  const flush = () => new Promise((r) => setTimeout(r, 20));
  return { store, preview, faces, renders, prepareLama, flush, fetches };
}

function entry(id: string, border: PrintRecord["border"] = "black", text = "Texto."): Entry {
  const card: CardRecord = {
    oracle_id: `o-${id}`,
    name_en: id,
    name_pt: id,
    source: "arena",
    text_print: null,
    faces: [{ name_en: id, name_pt: id, type_pt: "Artefato", text_pt: text, flavor_pt: null, mana_cost: "{1}" }],
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
  vi.unstubAllGlobals();
});

describe("cartas guardadas no navegador", () => {
  it("na visita seguinte, a prévia da arte sem borda aparece sem montar nada nem baixar a rede neural", async () => {
    const db = memory();
    const first = await visit(db.backend);
    const sb = entry("sb", "borderless");
    const url = first.preview.previewUrl(sb);
    await first.flush();
    expect(first.prepareLama).toHaveBeenCalledTimes(1);
    first.renders.shift()!.resolve();
    await url;
    await first.flush();
    expect(db.cards.size).toBe(1);

    const second = await visit(db.backend);
    const again = second.preview.previewUrl(sb);
    // nem o rascunho: a acabada já está guardada
    const draft = second.preview.draftUrl(sb);
    await expect(again).resolves.toMatch(/^blob:/);
    await expect(draft).rejects.toThrow();
    await second.flush();
    expect(second.renders).toEqual([]);
    expect(second.prepareLama).not.toHaveBeenCalled();
  });

  it("a carta guardada em inglês volta com a etiqueta de inglês", async () => {
    const db = memory();
    const first = await visit(db.backend);
    const url = first.preview.previewUrl(entry("x"));
    await first.flush();
    first.renders.shift()!.resolve({ translated: false });
    await url;
    await first.flush();
    const second = await visit(db.backend);
    await second.preview.previewUrl(entry("x"));
    expect(second.renders).toEqual([]);
    expect(second.preview.engineMisses().size).toBe(1);
  });

  it("não guarda a carta que saiu na original porque a rede neural não rodou (noutra visita ela pode rodar)", async () => {
    const db = memory();
    const first = await visit(db.backend);
    const url = first.preview.previewUrl(entry("sb", "borderless"));
    await first.flush();
    first.renders.shift()!.resolve({ translated: false, reason: "neural" });
    await url;
    await first.flush();
    expect(db.cards.size).toBe(0);
  });

  it("o PDF usa a face guardada e a monta de novo quando o texto ou as fontes mudam", async () => {
    const db = memory();
    const first = await visit(db.backend);
    const face = first.faces.printFace(entry("a"), 0, "padrao");
    await first.flush();
    first.renders.shift()!.resolve();
    await face;
    await first.flush();

    const second = await visit(db.backend);
    await expect(second.faces.printFace(entry("a"), 0, "padrao")).resolves.toMatchObject({ border: "black" });
    expect(second.renders).toEqual([]);
    // outra qualidade, o texto em PT corrigido (numa visita depois da atualização dos dados) e
    // outras fontes: montagens novas
    void second.faces.printFace(entry("a"), 0, "alta");
    await second.flush();
    expect(second.renders.length).toBe(1);
    const third = await visit(db.backend);
    void third.faces.printFace(entry("a", "black", "Texto corrigido."), 0, "padrao");
    await third.flush();
    expect(third.renders.length).toBe(1);
    const fourth = await visit(db.backend, "pabc|o");
    void fourth.faces.printFace(entry("a"), 0, "padrao");
    await fourth.flush();
    expect(fourth.renders.length).toBe(1);
  });

  it("a chave muda com o código que desenha", async () => {
    const db = memory();
    const { store } = await visit(db.backend);
    const before = await store.cardKey("previa", { a: 1 });
    store.useCardBackend(db.backend, "outra-versao");
    expect(await store.cardKey("previa", { a: 1 })).not.toBe(before);
    // sem banco (no `dev`), nada é guardado
    store.useCardBackend(null);
    expect(await store.cardKey("previa", { a: 1 })).toBeNull();
  });

  it("tira as usadas há mais tempo quando passa do espaço", async () => {
    const db = memory();
    const { store } = await visit(db.backend);
    for (const [id, at] of [
      ["velha", 1],
      ["media", 2],
      ["nova", 3],
    ] as const) {
      db.cards.set(id, { blob: new Blob(["x"]), translated: true });
      db.usage.set(id, { id, at, size: 40 });
    }
    await store.prune(100);
    expect([...db.cards.keys()]).toEqual(["media", "nova"]);
    // usar a "media" agora a deixa por último na fila de saída
    await store.storedCard("media");
    await store.prune(30);
    expect([...db.cards.keys()]).toEqual(["media"]);
  });
});

describe("cartas montadas no servidor", () => {
  /** O servidor com a prévia (ou a face do PDF) desta carta, pela mesma chave que o site procura. */
  async function serverWith(e: Entry, kind = "previa", translated = true) {
    const { store, preview } = await visit(memory().backend);
    const id = await store.cardKey(kind, preview.renderInput(e));
    return new Map([[store.serverCardPath(id!)!, { body: "do-servidor", translated }]]);
  }

  it("sem a carta no navegador, a prévia vem do servidor, sem montar nada nem baixar a rede neural", async () => {
    const sb = entry("sb", "borderless");
    const server = await serverWith(sb);
    const v = await visit(memory().backend, "o|o", server);
    const url = v.preview.previewUrl(sb);
    const draft = v.preview.draftUrl(sb);
    await expect(url).resolves.toBe(`blob:${"do-servidor".length}`);
    await expect(draft).rejects.toThrow();
    await v.flush();
    expect(v.renders).toEqual([]);
    expect(v.prepareLama).not.toHaveBeenCalled();
    expect(v.preview.engineMisses().size).toBe(0);
  });

  it("a carta do servidor que saiu em inglês vem com a etiqueta de inglês", async () => {
    const x = entry("x");
    const v = await visit(memory().backend, "o|o", await serverWith(x, "previa", false));
    await v.preview.previewUrl(x);
    expect(v.renders).toEqual([]);
    expect(v.preview.engineMisses().size).toBe(1);
  });

  it("sem a carta no servidor, monta no aparelho", async () => {
    const v = await visit(memory().backend);
    const url = v.preview.previewUrl(entry("x"));
    await v.flush();
    expect(v.fetches.length).toBe(1);
    expect(v.renders.length).toBe(1);
    v.renders.shift()!.resolve();
    await expect(url).resolves.toMatch(/^blob:/);
  });

  it("com as fontes da pessoa, nem procura no servidor (lá só há cartas com as oficiais)", async () => {
    const v = await visit(memory().backend, "pabc|o");
    void v.preview.previewUrl(entry("x"));
    await v.flush();
    expect(v.fetches).toEqual([]);
    expect(v.renders.length).toBe(1);
  });

  it("o PDF usa a face montada no servidor", async () => {
    const a = entry("a");
    const v = await visit(memory().backend, "o|o", await serverWith(a, "impressao:padrao"));
    const face = await v.faces.printFace(a, 0, "padrao");
    expect(await face.image.text()).toBe("do-servidor");
    expect(v.renders).toEqual([]);
  });
});
