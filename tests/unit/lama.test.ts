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
});
