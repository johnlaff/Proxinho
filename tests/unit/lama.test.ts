import { afterEach, describe, expect, it, vi } from "vitest";
import { combineMasks, dropSpecks, type RegionMask } from "../../src/engine/erase";
import { cropAround, lamaInpaint, nativeTiles } from "../../src/engine/lama";

describe("cropAround", () => {
  it("cobre a caixa de texto do planeswalker com margem, num quadrado dentro da imagem", () => {
    const area = { x0: 96, y0: 586, x1: 687, y1: 944 };
    const c = cropAround(area, 745, 1040, 22);
    expect(c.size).toBe(635);
    expect(c.x).toBeLessThanOrEqual(area.x0);
    expect(c.x + c.size).toBeGreaterThanOrEqual(area.x1);
    expect(c.y).toBeLessThanOrEqual(area.y0);
    expect(c.y + c.size).toBeLessThanOrEqual(1040);
  });

  it("nunca é menor que o quadro do modelo nem maior que a imagem", () => {
    expect(cropAround({ x0: 10, y0: 10, x1: 20, y1: 20 }, 745, 1040, 0).size).toBe(512);
    expect(cropAround({ x0: 0, y0: 0, x1: 745, y1: 900 }, 745, 1040, 50).size).toBe(745);
    // imagem das prévias (488 px de largura): o recorte cabe nela e é ampliado
    expect(cropAround({ x0: 63, y0: 384, x1: 450, y1: 618 }, 488, 680, 15)).toEqual({ x: 0, y: 192, size: 488 });
  });
});

describe("nativeTiles", () => {
  it("cobre a caixa sem borda com quadros de 512 px, sem sobra e com contexto em volta", () => {
    // caixa de texto da moldura sem borda no PNG do Scryfall
    const area = { x0: 57, y0: 648, x1: 684, y1: 952 };
    const tiles = nativeTiles(area, 745, 1040, 32);
    expect(tiles).toHaveLength(2);
    let covered = 0;
    for (const { crop, fill } of tiles) {
      expect(crop.size).toBe(512);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.size).toBeLessThanOrEqual(745);
      expect(crop.y + crop.size).toBeLessThanOrEqual(1040);
      // o pedaço preenchido fica dentro do quadro, com 32 px de contexto (salvo na beira da imagem)
      expect(fill.x0 - crop.x >= 32 || crop.x === 0).toBe(true);
      expect(crop.x + crop.size - fill.x1 >= 32 || crop.x + crop.size === 745).toBe(true);
      expect(fill.y0 - crop.y).toBeGreaterThanOrEqual(32);
      expect(crop.y + crop.size - fill.y1).toBeGreaterThanOrEqual(32);
      covered += (fill.x1 - fill.x0) * (fill.y1 - fill.y0);
    }
    // os pedaços se seguem, sem buraco nem sobreposição
    expect(tiles[0].fill.x1).toBe(tiles[1].fill.x0);
    expect(covered).toBe((area.x1 - area.x0) * (area.y1 - area.y0));
  });
});

describe("combineMasks", () => {
  it("dilata a máscara sem sair das regiões", () => {
    const img = { width: 10, height: 1 } as ImageData;
    const region: RegionMask = { rect: { x0: 4, y0: 0, x1: 8, y1: 1 }, mask: Uint8Array.from([1, 0, 0, 0]), polarity: "dark" };
    expect([...combineMasks(img, [region], 2)]).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]);
  });

  it("fecha os fios finos entre dois pedaços do buraco, dentro das regiões (Niko Aris, KHM)", () => {
    // duas faixas, uma em cima da outra; a arte escura apagada na de cima e as letras na de
    // baixo deixavam duas linhas da imagem entre elas, que saíam como um tracejado
    const W = 6;
    const img = { width: W, height: 12 } as ImageData;
    const upper: RegionMask = { rect: { x0: 0, y0: 0, x1: W, y1: 6 }, mask: new Uint8Array(W * 6), polarity: "dark" };
    const lower: RegionMask = { rect: { x0: 1, y0: 6, x1: W, y1: 12 }, mask: new Uint8Array(5 * 6), polarity: "dark" };
    upper.mask.fill(1, 2 * W, 4 * W); // linhas 2 e 3
    lower.mask.fill(1, 2 * 5, 3 * 5); // linha 8
    const hole = combineMasks(img, [upper, lower], 0, 4);
    const row = (y: number) => [...hole.subarray(y * W, (y + 1) * W)];
    // as linhas 4 a 7 (o vão de quatro) entram; a coluna 0 não, a faixa de baixo não chega lá
    for (const y of [4, 5, 6, 7]) expect(row(y)).toEqual([0, 1, 1, 1, 1, 1]);
    // vão maior que o limite fica como está
    expect([...combineMasks(img, [upper, lower], 0, 3)].slice(4 * W, 8 * W).every((v) => v === 0)).toBe(true);
  });
});

describe("dropSpecks", () => {
  // papel claro de 745 px de largura (a escala-base), buraco no meio
  const W = 745;
  const H = 120;
  const paper = () => {
    const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(240), colorSpace: "srgb" } as ImageData;
    const hole = new Uint8Array(W * H);
    for (let y = 20; y < 100; y++) hole.fill(1, y * W + 100, y * W + 400);
    return { img, hole };
  };
  const ink = (img: ImageData, x0: number, y0: number, x1: number, y1: number, v = 110) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.fill(v, (y * W + x) * 4, (y * W + x) * 4 + 3);
  };
  const at = (img: ImageData, x: number, y: number) => img.data[(y * W + x) * 4];
  const area = { x0: 50, y0: 0, x1: 450, y1: H };

  it('tira o pingo que o modelo inventa no meio do buraco (o "Quando" do Niko Aris, KHM)', () => {
    const { img, hole } = paper();
    ink(img, 200, 50, 204, 55);
    expect(dropSpecks(img, area, hole)).toBe(1);
    expect(at(img, 202, 52)).toBeGreaterThan(230);
  });

  it("deixa o que encosta na borda do buraco (arte que continua lá fora) e o que é grande", () => {
    const { img, hole } = paper();
    ink(img, 98, 60, 103, 64); // atravessa a borda esquerda do buraco
    ink(img, 250, 40, 280, 70); // desenho grande
    expect(dropSpecks(img, area, hole)).toBe(0);
    expect(at(img, 101, 62)).toBe(110);
    expect(at(img, 265, 55)).toBe(110);
  });

  it("fora do buraco nada muda", () => {
    const { img, hole } = paper();
    ink(img, 420, 50, 424, 55);
    expect(dropSpecks(img, area, hole)).toBe(0);
    expect(at(img, 422, 52)).toBe(110);
  });
});

describe("lamaInpaint", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a caixa da lealdade fica escondida do modelo, e intacta (Tezzeret, AER)", async () => {
    // o modelo de mentira guarda a imagem e o buraco que recebeu e devolve tudo cinza
    let seen: { image: Float32Array; mask: Float32Array } | null = null;
    class FakeWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(msg: { id: number; image: Float32Array; mask: Float32Array }) {
        seen = { image: msg.image, mask: msg.mask };
        const output = new Float32Array(3 * 512 * 512).fill(128);
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, output } }));
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    const W = 512;
    const img = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4).fill(200), colorSpace: "srgb" } as ImageData;
    // caixa preta da lealdade no canto, e uma letra apagada logo acima dela
    for (let y = 400; y < 512; y++) for (let x = 400; x < 512; x++) img.data.fill(10, (y * W + x) * 4, (y * W + x) * 4 + 3);
    const mask = new Uint8Array(W * W);
    for (let y = 380; y < 398; y++) for (let x = 420; x < 440; x++) mask[y * W + x] = 1;
    const box = { x0: 400, y0: 400, x1: 512, y1: 512 };
    expect(await lamaInpaint(img, { x0: 0, y0: 0, x1: W, y1: W }, mask, [box])).toBe(true);
    // o modelo não viu a caixa: lá é buraco, com a imagem zerada
    const at = (x: number, y: number) => y * 512 + x;
    expect(seen!.mask[at(450, 450)]).toBe(1);
    expect(seen!.image[at(450, 450)]).toBe(0);
    // e ela não é repintada: só a letra apagada recebe a saída do modelo
    expect(img.data[(450 * W + 450) * 4]).toBe(10);
    expect(img.data[(390 * W + 430) * 4]).toBe(128);
  });

  it("na resolução da própria imagem, cada quadro vê o que o anterior preencheu (Shivan Dragon, SLD)", async () => {
    // o modelo de mentira devolve 100 no primeiro quadro e 150 no segundo
    const seen: { image: Float32Array; mask: Float32Array }[] = [];
    class FakeWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(msg: { id: number; image: Float32Array; mask: Float32Array }) {
        seen.push({ image: msg.image, mask: msg.mask });
        const output = new Float32Array(3 * 512 * 512).fill(seen.length === 1 ? 100 : 150);
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, output } }));
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    vi.resetModules();
    const { lamaInpaint: fresh, nativeTiles: tilesOf } = await import("../../src/engine/lama");
    const W = 745;
    const H = 1040;
    const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(40), colorSpace: "srgb" } as ImageData;
    const area = { x0: 57, y0: 648, x1: 684, y1: 952 };
    const mask = new Uint8Array(W * H);
    for (let y = area.y0; y < area.y1; y++) mask.fill(1, y * W + area.x0, y * W + area.x1);
    expect(await fresh(img, area, mask, [], true)).toBe(true);
    expect(seen).toHaveLength(2);
    const [first, second] = tilesOf(area, W, H, Math.round(W * 0.043));
    // no segundo quadro, o pedaço do primeiro já é imagem (100), não buraco
    const k = (area.y0 + 100 - second.crop.y) * 512 + (first.fill.x1 - 10 - second.crop.x);
    expect(seen[1].mask[k]).toBe(0);
    expect(seen[1].image[k]).toBeCloseTo(100 / 255, 5);
    // e sem redução: um pixel do quadro é um pixel da imagem
    expect(img.data[((area.y0 + 100) * W + first.fill.x1 - 1) * 4]).toBe(100);
    expect(img.data[((area.y0 + 100) * W + first.fill.x1) * 4]).toBe(150);
    // a máscara de quem chamou não muda
    expect(mask[(area.y0 + 100) * W + area.x0]).toBe(1);
  });
});

describe("vigia da rede neural", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  type Msg = { type: string; id: number; gpu: boolean; threads: number };
  /** Workers de mentira: `script[i]` diz o que a i-ésima faz com cada quadro que recebe. */
  async function setup(script: ((w: { reply: (data: unknown) => void }, msg: Msg) => void)[]) {
    const made: { msgs: Msg[]; terminated: boolean }[] = [];
    class FakeWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      private log = { msgs: [] as Msg[], terminated: false };
      private act = script[made.length] ?? (() => undefined);
      constructor() {
        made.push(this.log);
      }
      postMessage(msg: Msg) {
        this.log.msgs.push(msg);
        this.act({ reply: (data) => this.onmessage?.({ data }) }, msg);
      }
      terminate() {
        this.log.terminated = true;
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    vi.useFakeTimers();
    vi.resetModules();
    const lama = await import("../../src/engine/lama");
    const W = 512;
    const img = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4).fill(200), colorSpace: "srgb" } as ImageData;
    const mask = new Uint8Array(W * W);
    for (let y = 100; y < 120; y++) mask.fill(1, y * W + 100, y * W + 300);
    const run = () => lama.lamaInpaint(img, { x0: 0, y0: 0, x1: W, y1: W }, mask);
    return { lama, made, img, run };
  }
  const answer = (w: { reply: (data: unknown) => void }, msg: Msg) =>
    setTimeout(() => {
      w.reply({ type: "loaded" });
      w.reply({ type: "ready" });
      w.reply({ type: "done", id: msg.id, output: new Float32Array(3 * 512 * 512).fill(90) });
    }, 1000);

  it("a worker que nunca responde é trocada por uma na CPU com uma thread (Firefox do celular, Konia DSK 358)", async () => {
    const { lama, made, img, run } = await setup([() => undefined, answer]);
    const result = run();
    await vi.advanceTimersByTimeAsync(lama.LIMITS.stall - 1);
    expect(made).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(true);
    expect(made[0].terminated).toBe(true);
    expect(made[0].msgs[0]).toMatchObject({ gpu: true, threads: 0 });
    // o mesmo quadro, inteiro, vai para a segunda
    expect(made[1].msgs[0]).toMatchObject({ gpu: false, threads: 1 });
    expect(made[1].msgs[0].id).toBe(made[0].msgs[0].id);
    expect(img.data[(110 * 512 + 200) * 4]).toBe(90);
    expect(lama.lamaStatus().stage).toBe("idle");
  });

  it("download lento que segue chegando não é travamento, e a etapa acompanha", async () => {
    const stages: string[] = [];
    const { lama, made, run } = await setup([
      (w, msg) => {
        // seis minutos de download, um pedaço a cada 50 s
        for (let i = 1; i <= 7; i++) setTimeout(() => w.reply({ type: "progress", loaded: i * 10, total: 70 }), i * 50_000);
        setTimeout(() => answer(w, msg), 7 * 50_000);
      },
    ]);
    lama.onLamaStatus(() => {
      const s = lama.lamaStatus();
      const label = s.stage === "download" && s.total ? `download ${Math.round((100 * s.loaded) / s.total)}%` : s.stage;
      if (stages.at(-1) !== label) stages.push(label);
    });
    const result = run();
    await vi.advanceTimersByTimeAsync(8 * 50_000);
    expect(await result).toBe(true);
    expect(made).toHaveLength(1);
    expect(made[0].terminated).toBe(false);
    expect(stages).toEqual([
      "download",
      "download 14%",
      "download 29%",
      "download 43%",
      "download 57%",
      "download 71%",
      "download 86%",
      "download 100%",
      "prepare",
      "run",
      "idle",
    ]);
  });

  it("travada na hora de rodar o quadro, também troca; se a segunda travar, desiste e não tenta de novo", async () => {
    const hangAfterReady = (w: { reply: (data: unknown) => void }) =>
      setTimeout(() => {
        w.reply({ type: "loaded" });
        w.reply({ type: "ready" });
      }, 1000);
    const { lama, made, run } = await setup([hangAfterReady, hangAfterReady]);
    const result = run();
    await vi.advanceTimersByTimeAsync(1000 + lama.LIMITS.run + 1000 + lama.LIMITS.run + 10);
    expect(await result).toBe(false);
    expect(made.map((m) => m.terminated)).toEqual([true, true]);
    expect(lama.lamaStatus().stage).toBe("failed");
    // nas próximas cartas, nem cria worker: quem chama usa o plano B na hora
    expect(await run()).toBe(false);
    expect(made).toHaveLength(2);
  });

  it("erro do runtime na primeira passa para a segunda", async () => {
    const { made, run } = await setup([(w, msg) => w.reply({ type: "error", id: msg.id, error: "RangeError: out of memory" }), answer]);
    const result = run();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBe(true);
    expect(made).toHaveLength(2);
  });
});
