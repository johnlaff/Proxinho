import { afterEach, describe, expect, it, vi } from "vitest";
import { combineMasks, dropSpecks, type RegionMask } from "../../src/engine/erase";
import { cropAround, lamaInpaint } from "../../src/engine/lama";

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

  it("a caixa sem borda inteira vai num quadro só, reduzida aos 512 px do modelo (ADR 0015)", async () => {
    // o modelo de mentira devolve 100 em cada quadro e conta quantos recebeu
    const seen: { image: Float32Array; mask: Float32Array }[] = [];
    class FakeWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(msg: { id: number; image: Float32Array; mask: Float32Array }) {
        seen.push({ image: msg.image, mask: msg.mask });
        const output = new Float32Array(3 * 512 * 512).fill(100);
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, output } }));
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    vi.resetModules();
    const { lamaInpaint: fresh } = await import("../../src/engine/lama");
    const W = 745;
    const H = 1040;
    const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(40), colorSpace: "srgb" } as ImageData;
    // caixa de texto da moldura sem borda no PNG do Scryfall: em dois quadros de 512 px na
    // resolução da imagem, a carta levava 19 a 20 s na CPU; num só, 13 a 14 s
    const area = { x0: 57, y0: 648, x1: 684, y1: 952 };
    const mask = new Uint8Array(W * H);
    for (let y = area.y0; y < area.y1; y++) mask.fill(1, y * W + area.x0, y * W + area.x1);
    let frames = 0;
    expect(await fresh(img, area, mask, [], () => frames++)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(frames).toBe(1);
    // o quadro cobre a caixa inteira: as duas pontas recebem a saída do modelo
    expect(img.data[((area.y0 + 1) * W + area.x0 + 1) * 4]).toBe(100);
    expect(img.data[((area.y1 - 2) * W + area.x1 - 2) * 4]).toBe(100);
    // e fora da caixa nada muda
    expect(img.data[((area.y0 - 5) * W + area.x0) * 4]).toBe(40);
    // a máscara de quem chamou não muda
    expect(mask[(area.y0 + 100) * W + area.x0]).toBe(1);
  });
});

describe("vigia da rede neural", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  type Msg = { type: string; id: number; backend: string; threads: number };
  /** Workers de mentira: `script[i]` diz o que a i-ésima faz com cada mensagem que recebe. */
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
        this.act({ reply: (data) => !this.log.terminated && this.onmessage?.({ data }) }, msg);
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
  /** Worker que funciona: carrega em 1 s (no modo pedido, ou `as`) e cada quadro leva `ms`. */
  const works =
    (ms = 1000, as?: { backend: string; threads: number }) =>
    (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type !== "run") return;
      setTimeout(() => {
        w.reply({ type: "loaded" });
        w.reply({ type: "ready", ...(as ?? { backend: msg.backend, threads: msg.threads || 4 }) });
        setTimeout(() => w.reply({ type: "done", id: msg.id, output: new Float32Array(3 * 512 * 512).fill(90) }), ms);
      }, 1000);
    };
  const answer = works();

  it("a worker que nunca responde é trocada pela CPU (Firefox do celular, Konia DSK 358)", async () => {
    const { lama, made, img, run } = await setup([() => undefined, answer]);
    const result = run();
    await vi.advanceTimersByTimeAsync(lama.LIMITS.stall - 1);
    expect(made).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBe(true);
    expect(made[0].terminated).toBe(true);
    expect(made[0].msgs[0]).toMatchObject({ backend: "webgpu", threads: 0 });
    // o mesmo quadro, inteiro, vai para a segunda
    expect(made[1].msgs[0]).toMatchObject({ backend: "wasm", threads: 0 });
    expect(made[1].msgs[0].id).toBe(made[0].msgs[0].id);
    expect(img.data[(110 * 512 + 200) * 4]).toBe(90);
    expect(lama.lamaStatus().stage).toBe("idle");
  });

  it("erro da placa de vídeo vai para a CPU com várias threads, não direto para uma (Chrome do celular)", async () => {
    // o runtime antigo falhava na soma da convolução de Fourier logo no primeiro quadro
    const gpuError = (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type !== "run") return;
      w.reply({ type: "loaded" });
      w.reply({ type: "ready", backend: "webgpu", threads: 4 });
      w.reply({ type: "error", id: msg.id, error: 'Error: [WebGPU] Kernel "[Add] /generator/model/model.5/conv1/ffc/convg2g/Add" failed' });
    };
    const { lama, made, run } = await setup([gpuError, answer]);
    const result = run();
    await vi.advanceTimersByTimeAsync(2500);
    expect(await result).toBe(true);
    expect(made).toHaveLength(2);
    expect(made[1].msgs[0]).toMatchObject({ backend: "wasm", threads: 0 });
    expect(lama.lamaStatus().backend).toBe("wasm");
  });

  it("sem placa de vídeo, o primeiro modo já era a CPU com várias threads: a falha vai para uma thread", async () => {
    const hangAfterReady = (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type !== "run") return;
      w.reply({ type: "loaded" });
      w.reply({ type: "ready", backend: "wasm", threads: 4 });
    };
    const { lama, made, run } = await setup([hangAfterReady, answer]);
    const result = run();
    await vi.advanceTimersByTimeAsync(lama.LIMITS.first.wasm + 2500);
    expect(await result).toBe(true);
    expect(made[1].msgs[0]).toMatchObject({ backend: "wasm", threads: 1 });
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

  it("depois do primeiro quadro, o limite segue a média: um quadro de 2 s travado não espera 4 minutos", async () => {
    let n = 0;
    // a primeira worker roda um quadro em 2 s e trava no segundo; a seguinte funciona
    const fastThenHang = (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type !== "run") return;
      if (n++ === 0) works(2000, { backend: "wasm", threads: 4 })(w, msg);
    };
    const { lama, made, run } = await setup([fastThenHang, answer]);
    expect(await Promise.all([run(), (async () => (await vi.advanceTimersByTimeAsync(3100), true))()])).toEqual([true, true]);
    expect(lama.lamaStatus().frameMs).toBe(2000);
    expect(lama.runLimit("wasm", 2000)).toBe(lama.LIMITS.floor);
    const second = run();
    await vi.advanceTimersByTimeAsync(lama.LIMITS.floor + 2500);
    expect(await second).toBe(true);
    expect(made).toHaveLength(2);
    expect(made[1].msgs[0]).toMatchObject({ backend: "wasm", threads: 1 });
  });

  it("travada em todos os modos, desiste, guarda o motivo de cada um e não tenta de novo", async () => {
    const hangAfterReady = (backend: string, threads: number) => (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type !== "run") return;
      setTimeout(() => {
        w.reply({ type: "loaded" });
        w.reply({ type: "ready", backend, threads });
      }, 1000);
    };
    const { lama, made, run } = await setup([hangAfterReady("webgpu", 4), hangAfterReady("wasm", 4), hangAfterReady("wasm", 1)]);
    const result = run();
    await vi.advanceTimersByTimeAsync(3 * 1000 + lama.LIMITS.first.webgpu + 2 * lama.LIMITS.first.wasm + 10);
    expect(await result).toBe(false);
    expect(made.map((m) => m.terminated)).toEqual([true, true, true]);
    expect(lama.lamaStatus().stage).toBe("failed");
    expect(lama.lamaStatus().reason).toBe("webgpu: quadro sem resposta · wasm 4t: quadro sem resposta · wasm 1t: quadro sem resposta");
    // nas próximas cartas, nem cria worker: quem chama usa o plano B na hora
    expect(await run()).toBe(false);
    expect(made).toHaveLength(3);
  });

  it("prepara o modelo antes do primeiro quadro, e fica parada esperando quando termina", async () => {
    const loads = (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type === "load")
        setTimeout(() => {
          w.reply({ type: "loaded" });
          w.reply({ type: "ready", backend: "webgpu", threads: 4 });
        }, 1000);
      else works(500)(w, msg);
    };
    const { lama, made } = await setup([loads]);
    lama.prepareLama();
    lama.prepareLama();
    expect(made[0].msgs).toEqual([{ type: "load", backend: "webgpu", threads: 0 }]);
    expect(lama.lamaStatus().stage).toBe("download");
    await vi.advanceTimersByTimeAsync(1000);
    expect(lama.lamaStatus()).toMatchObject({ stage: "idle", backend: "webgpu" });
    // parada, sem vigia: nada falha por esperar
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(made).toHaveLength(1);
    expect(made[0].terminated).toBe(false);
  });

  it("erro na preparação, sem quadro na fila, passa para o modo seguinte", async () => {
    const failsLoad = (w: { reply: (data: unknown) => void }, msg: Msg) => {
      if (msg.type === "load") w.reply({ type: "error", error: "preparar o modelo (webgpu): RangeError" });
    };
    const { lama, made } = await setup([failsLoad, () => undefined]);
    lama.prepareLama();
    expect(made).toHaveLength(2);
    expect(made[1].msgs[0]).toMatchObject({ type: "load", backend: "wasm", threads: 0 });
  });
});

describe("nextMode e etaMs", () => {
  it("passa para o modo seguinte ao que a worker de fato usou", async () => {
    const { nextMode } = await import("../../src/engine/lama");
    expect(nextMode(0, { backend: "webgpu", threads: 4 })).toBe(1);
    expect(nextMode(0, { backend: "wasm", threads: 4 })).toBe(2);
    expect(nextMode(1, { backend: "wasm", threads: 1 })).toBe(3);
    expect(nextMode(0, null)).toBe(1);
    expect(nextMode(1, null)).toBe(2);
  });

  it("o tempo que falta conta os quadros que faltam pela média, menos o que já rodou do atual", async () => {
    const { etaMs } = await import("../../src/engine/lama");
    const base = { stage: "run" as const, loaded: 0, total: 0, backend: "wasm" as const, gpu: null, reason: "" };
    expect(etaMs({ ...base, frameMs: 0, since: 0 }, 3)).toBeNull();
    expect(etaMs({ ...base, frameMs: 20_000, since: 1000 }, 3, 6000)).toBe(55_000);
    // o atual passou da média: conta como quase pronto, sem tempo negativo
    expect(etaMs({ ...base, frameMs: 20_000, since: 1000 }, 1, 60_000)).toBe(0);
  });
});

describe("arquivos da rede neural", () => {
  it("descompacta o gzip, e deixa como está o que o navegador já descompactou", async () => {
    const { gunzip } = await import("../../src/engine/lamaFiles");
    const { gzipSync } = await import("node:zlib");
    const raw = new Uint8Array([8, 1, 2, 3, 4, 250, 0, 7]);
    expect([...(await gunzip(new Uint8Array(gzipSync(raw))))]).toEqual([...raw]);
    expect(await gunzip(raw)).toBe(raw);
  });

  it("cada modo baixa o runtime dele, com a versão no nome (o cache é imutável)", async () => {
    const { runtimeParts, MODEL_PARTS } = await import("../../src/engine/lamaFiles");
    expect(runtimeParts("webgpu", "1.31.1")).toEqual(["/modelos/ort-webgpu-1.31.1.wasm.gz"]);
    expect(runtimeParts("wasm", "1.31.1")).toEqual(["/modelos/ort-cpu-1.31.1.wasm.gz"]);
    expect(MODEL_PARTS).toEqual(["/modelos/lama-int4.onnx.gz.0", "/modelos/lama-int4.onnx.gz.1"]);
  });

  it("a sessão fixa o lote em 1 (preparo mais curto) e desfaz a quantização", async () => {
    const { sessionOptions } = await import("../../src/engine/lamaFiles");
    for (const backend of ["webgpu", "wasm"] as const) {
      const opts = sessionOptions(backend);
      expect(opts.executionProviders).toEqual([backend]);
      expect(opts.freeDimensionOverrides).toEqual({ batch: 1 });
      expect(opts.extra.session.disable_quant_qdq).toBe("1");
    }
  });

  it("saída com NaN da placa de vídeo vale como falha", async () => {
    const { brokenOutput } = await import("../../src/engine/lamaFiles");
    expect(brokenOutput(new Float32Array([0, 128, 255]))).toBe(false);
    expect(brokenOutput(new Float32Array([0, Number.NaN, 255]))).toBe(true);
    expect(brokenOutput(new Float32Array([Number.POSITIVE_INFINITY]))).toBe(true);
  });
});
