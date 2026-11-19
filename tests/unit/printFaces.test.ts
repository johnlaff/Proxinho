import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../../src/app/model";
import type { CardRecord, PrintRecord } from "../../src/engine/types";

/**
 * PDF adiantado com o motor de mentira: cada montagem fica pendurada até o teste soltar. As
 * prévias usam a imagem "normal"; as faces do PDF, o PNG. A carta "da rede neural" é a sem borda.
 */
type Pending = { id: string; version: string; resolve: () => void };
async function setup() {
  const pending: Pending[] = [];
  vi.resetModules();
  vi.doMock("../../src/engine/render", () => ({
    usesNeuralFill: (print: PrintRecord) => print.border === "borderless",
    renderCard: (opts: { print: PrintRecord; imageVersion: string }) =>
      new Promise((resolve) => {
        const canvas = { toBlob: (cb: (b: Blob) => void) => cb(new Blob([opts.print.id])) };
        pending.push({ id: opts.print.id, version: opts.imageVersion, resolve: () => resolve({ canvas, translated: true }) });
      }),
  }));
  vi.doMock("../../src/engine/lama", () => ({ prepareLama: vi.fn() }));
  vi.doMock("../../src/engine/fonts", () => ({ fontsVersion: () => 0 }));
  vi.doMock("../../src/lib/pdf", () => ({ buildPdf: async () => new Uint8Array([37, 80, 68, 70]) }));
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => `blob:${(b as Blob).size}`);
  const preview = await import("../../src/app/preview");
  const faces = await import("../../src/app/printFaces");
  const { exportPdf } = await import("../../src/app/exportPdf");
  // o respiro entre uma carta e outra é de 50 ms sem requestIdleCallback
  const settle = () => new Promise((r) => setTimeout(r, 120));
  const prints = () => pending.filter((p) => p.version === "png").map((p) => p.id);
  return { preview, faces, exportPdf, pending, settle, prints };
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

const opts = { paper: "a4", mode: "sleeve", shrink: false, quality: "padrao" } as const;

afterEach(() => {
  vi.doUnmock("../../src/engine/render");
  vi.doUnmock("../../src/engine/lama");
  vi.doUnmock("../../src/engine/fonts");
  vi.doUnmock("../../src/lib/pdf");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PDF adiantado", () => {
  it("monta as cartas do PDF depois das prévias, uma de cada vez, e o clique usa as prontas", async () => {
    const { preview, faces, exportPdf, pending, settle, prints } = await setup();
    const [a, b] = [entry("a"), entry("b")];
    void preview.previewUrl(a);
    void preview.previewUrl(b);
    faces.warmPrints([a, b], "padrao");
    await settle();
    // com prévia na fila, nada de PNG: a folha vem primeiro
    expect(prints()).toEqual([]);
    for (const p of pending.splice(0)) p.resolve();
    await settle();
    expect(prints()).toEqual(["a"]);
    pending.shift()!.resolve();
    await settle();
    expect(prints()).toEqual(["b"]);
    pending.shift()!.resolve();
    await settle();
    // no clique, as duas já estão prontas: nenhuma montagem nova
    const pdf = await exportPdf([a, b], opts, () => undefined);
    expect(pdf.type).toBe("application/pdf");
    expect(pending).toEqual([]);
  });

  it("o clique monta só o que o adiantado não terminou, sem montar duas vezes a que está no meio", async () => {
    const { faces, exportPdf, pending, settle, prints } = await setup();
    const [a, b, c] = [entry("a"), entry("b"), entry("c")];
    faces.warmPrints([a, b, c], "padrao");
    await settle();
    expect(prints()).toEqual(["a"]);
    const done = exportPdf([a, b, c], opts, () => undefined);
    await settle();
    // a carta "a" segue a montagem do adiantado; o adiantado para e o clique pega o resto
    expect(prints().sort()).toEqual(["a", "b", "c"]);
    for (const p of pending.splice(0)) p.resolve();
    await done;
    await settle();
    expect(pending).toEqual([]);
  });

  it("espera a pessoa parar de mexer na página para montar a próxima", async () => {
    const { faces, settle, prints } = await setup();
    faces.noteInput();
    faces.warmPrints([entry("a")], "padrao");
    await settle();
    // cada carta no PNG prende a página por meio segundo: não durante a rolagem
    expect(prints()).toEqual([]);
    await new Promise((r) => setTimeout(r, 1500));
    expect(prints()).toEqual(["a"]);
  });

  it("a carta da rede neural espera a própria prévia, que limpa a caixa que o PDF usa", async () => {
    const { faces, pending, settle, prints } = await setup();
    faces.warmPrints([entry("sb", "borderless")], "padrao");
    await settle();
    expect(pending.map((p) => `${p.id}:${p.version}`)).toEqual(["sb:normal"]);
    pending.shift()!.resolve();
    await settle();
    expect(prints()).toEqual(["sb"]);
  });

  it("esquece as faces que saíram do pedido ou da qualidade escolhida", async () => {
    const { faces, pending, settle, prints } = await setup();
    const a = entry("a");
    faces.warmPrints([a], "padrao");
    await settle();
    pending.shift()!.resolve();
    await settle();
    faces.warmPrints([entry("b")], "padrao");
    await settle();
    pending.shift()!.resolve();
    // a carta "a" saiu do pedido: se voltar, é montada de novo
    void faces.printFace(a, 0, "padrao");
    await settle();
    expect(prints()).toEqual(["a"]);
  });

  it("com a economia de dados ligada, nada é baixado antes do clique", async () => {
    const { faces, settle, prints } = await setup();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14)", hardwareConcurrency: 8, connection: { saveData: true } });
    expect(faces.saveData()).toBe(true);
    faces.warmPrints([entry("a")], "padrao");
    await settle();
    expect(prints()).toEqual([]);
  });

  it("monta quatro cartas por vez num computador com folga e duas no celular", async () => {
    const { faces } = await setup();
    const nav = (userAgent: string, hardwareConcurrency: number, deviceMemory?: number) =>
      ({ userAgent, hardwareConcurrency, deviceMemory }) as unknown as Navigator;
    const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    expect(faces.exportParallel(nav(desktop, 8, 8))).toBe(4);
    // Firefox e Safari não dizem a memória
    expect(faces.exportParallel(nav(desktop, 8))).toBe(4);
    expect(faces.exportParallel(nav(desktop, 8, 4))).toBe(2);
    expect(faces.exportParallel(nav(desktop, 2, 8))).toBe(2);
    expect(faces.exportParallel(nav("Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile", 8, 8))).toBe(2);
  });
});
