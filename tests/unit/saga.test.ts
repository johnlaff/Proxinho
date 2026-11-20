import { describe, expect, it } from "vitest";
import {
  DIVIDER_SPAN,
  dividerProfile,
  drawDivider,
  sagaArtLeft,
  sagaBands,
  sagaDividers,
  sagaNumerals,
  sagaPlan,
  sagaText,
  sagaTopFrame,
  TOP_CURVE_CLEAR,
  topAligned,
} from "../../src/engine/saga";

const W = 745;
const H = 1040;

type Color = [number, number, number];

function canvas(bg: Color) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        data.set(c, i);
        data[i + 3] = 255;
      }
  };
  fill(0, 0, W, H, bg);
  return { img, fill };
}

const gray = (v: number): Color => [v, v, v];
const lumAt = (img: ImageData, x: number, y: number) => img.data[(y * W + x) * 4];

/** Coluna de Saga falsa: papel claro, o fio preto da arte em x 370 a 374 e a arte depois. */
function column() {
  const c = canvas(gray(235));
  c.fill(370, 0, 375, H, gray(20));
  c.fill(375, 0, W, H, gray(120));
  return c;
}

/** Desenha a sombra do fio (linhas `y − 8` a `y − 1`) com os tons `rows`, na largura da coluna. */
function shadow(c: ReturnType<typeof canvas>, y: number, rows: number[], after: number[] = []) {
  rows.forEach((v, k) => c.fill(87, y - rows.length + k, 368, y - rows.length + k + 1, gray(v)));
  after.forEach((v, k) => c.fill(87, y + k, 368, y + k + 1, gray(v)));
}

describe("sagaDividers", () => {
  it("acha o degrau no fim da sombra, e não o pé das letras", () => {
    const c = column();
    shadow(c, 500, [232, 229, 226, 223, 220, 217, 214, 211]);
    // uma linha de texto: o pé das letras clareia só onde há tinta
    for (let x = 110; x < 360; x += 12) c.fill(x, 300, x + 6, 320, gray(30));
    const art = sagaArtLeft(c.img);
    expect(art).toBe(370);
    expect(sagaDividers(c.img, art!)).toEqual([500]);
  });

  it("acha o degrau espalhado por duas linhas das digitalizações", () => {
    // Theros (THB 160, 166, 53) e as promos de pré-estreia: o degrau sobe 5 tons numa linha e 5 na
    // seguinte; medido de uma linha para a outra, nenhum passava dos 6 tons e a carta saía em inglês
    const c = column();
    shadow(c, 700, [233, 232, 231, 230, 229, 228, 226, 225], [230]);
    const art = sagaArtLeft(c.img)!;
    expect(sagaDividers(c.img, art)).toEqual([701]);
  });

  it("sem o fio preto da arte não é Saga", () => {
    expect(sagaArtLeft(canvas(gray(235)).img)).toBeNull();
  });
});

describe("sagaNumerals", () => {
  it("acha o número no meio do marcador dourado", () => {
    const c = column();
    c.fill(28, 119, 86, 867, gray(30)); // a tira preta dos marcadores
    c.fill(30, 560, 85, 620, gray(200)); // o hexágono
    c.fill(50, 578, 64, 600, gray(40)); // o "I", 22 px de altura
    c.fill(30, 700, 85, 760, gray(200));
    c.fill(50, 705, 64, 755, gray(40)); // alto demais para um número
    expect(sagaNumerals(c.img, 300, 867)).toEqual([588.5]);
  });
});

describe("sagaText", () => {
  it("separa o alto dos capítulos", () => {
    expect(sagaText("Adiantar leitura\nI — Compre um card.\nII, III — Use vidência 1.")).toEqual({
      top: [{ text: "Adiantar leitura", line: 0 }],
      chapters: [
        { numerals: "I", text: "Compre um card.", line: 1 },
        { numerals: "II, III", text: "Use vidência 1.", line: 2 },
      ],
    });
  });

  it("texto depois dos capítulos ou sem capítulo não é desta moldura", () => {
    expect(sagaText("I — Compre um card.\nVoar")).toBeNull();
    expect(sagaText("Voar")).toBeNull();
    expect(sagaText(null)).toBeNull();
  });
});

describe("sagaPlan", () => {
  const dom = [
    { first: 395, last: 395 },
    { first: 549, last: 549 },
    { first: 728, last: 728 },
  ];

  it("põe cada fio entre os marcadores, no meio do caminho entre os textos", () => {
    expect(sagaPlan([100, 30, 120], false, dom)).toEqual([490, 616]);
  });

  it("o fio de cima desce até onde cabe o texto do alto", () => {
    const markers = [
      { first: 450, last: 450 },
      { first: 700, last: 700 },
    ];
    expect(sagaPlan([40, 100, 100], true, markers)).toEqual([285, 575]);
  });

  it("o texto do alto acaba antes da curva da tira dos marcadores, no fio de cima original", () => {
    // Urza's Saga e Book of Mazarbul com o lembrete em PT: o "S" de "Sacrifique-a" ia por baixo da curva
    const markers = [
      { first: 450, last: 450 },
      { first: 700, last: 700 },
    ];
    expect(sagaPlan([200, 100, 100], true, markers)).not.toBeNull();
    expect(sagaPlan([200, 100, 100], true, markers, 308 - TOP_CURVE_CLEAR)).toBeNull();
    expect(sagaPlan([150, 100, 100], true, markers, 308 - TOP_CURVE_CLEAR)).not.toBeNull();
    // sem mudar os fios, o texto do alto também para antes da curva
    expect(sagaBands([308, 560], 370)[0].text.y1).toBe(308 - TOP_CURVE_CLEAR);
  });

  it("um grupo só não tem fio; sem lugar, null", () => {
    const all = [{ first: 406, last: 748 }];
    expect(sagaPlan([300], false, all)).toEqual([]);
    expect(sagaPlan([800], false, all)).toBeNull();
    // o último capítulo não cabe abaixo do marcador do anterior
    expect(sagaPlan([100, 30, 400], false, dom)).toBeNull();
    // faixas e marcadores que não batem
    expect(sagaPlan([100, 30], false, dom)).toBeNull();
  });
});

describe("topAligned", () => {
  it("o lembrete fica no alto da faixa, sem descer até a curva da tira", () => {
    // Book of Mazarbul (LTR 116): centrado na faixa de 129 a 330, o fim do lembrete passava de 283
    const box = { x0: 66, y0: 129, x1: 362, y1: 330 };
    expect(topAligned(box, 110)).toEqual({ x0: 66, y0: 129, x1: 362, y1: 239 });
    // texto mais alto que a faixa: a faixa fica como está
    expect(topAligned(box, 250)).toEqual(box);
  });
});

describe("dividerProfile e drawDivider", () => {
  it("o fio medido numa faixa sai igual noutra", () => {
    const paper: Color = [240, 230, 200];
    const clean = canvas(paper);
    const orig = canvas(paper);
    const factors = [0.99, 0.97, 0.95, 0.93, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.78, 1, 1, 1, 1];
    factors.forEach((f, k) =>
      orig.fill(90, 500 - DIVIDER_SPAN.above + k, 360, 500 - DIVIDER_SPAN.above + k + 1, paper.map((v) => Math.round(v * f)) as Color),
    );
    const profile = dividerProfile(orig.img, clean.img, 500, 90, 360);
    drawDivider(clean.img, 600, profile, 90, 360);
    for (let k = 0; k < factors.length; k++)
      for (let ch = 0; ch < 3; ch++) {
        const a = orig.img.data[((500 - DIVIDER_SPAN.above + k) * W + 200) * 4 + ch];
        const b = clean.img.data[((600 - DIVIDER_SPAN.above + k) * W + 200) * 4 + ch];
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      }
  });
});

describe("sagaTopFrame", () => {
  it("protege a curva da tira dos marcadores, linha a linha, mesmo com o lembrete em cima", () => {
    // a tira preta avança em curva até x ≈ 86 no fio de cima (y = 309); acima de 36 px dele fica
    // em x ≈ 58. Apagada como papel, a curva virava um retângulo branco
    const c = column();
    const divider = 309;
    const curve = (dy: number) => (dy <= -36 ? 58 : 58 + ((dy + 36) / 36) * 28);
    for (let y = 119; y < divider; y++) c.fill(0, y, Math.round(curve(y - divider)), y + 1, gray(30));
    // linhas do lembrete: a mediana da linha cai na tinta, o quarto mais claro não
    for (let y = 250; y < 300; y += 2) for (let x = 100; x < 360; x += 10) c.fill(x, y, x + 6, y + 1, gray(40));
    const rects = sagaTopFrame(c.img, 119, divider, 370);
    expect(rects).toHaveLength(divider - 119);
    for (const r of rects) {
      const want = Math.round(curve(r.y0 - divider));
      expect(Math.abs(r.x1 - want)).toBeLessThanOrEqual(1);
      expect(lumAt(c.img, r.x1, r.y0)).toBeGreaterThan(200);
    }
  });
});
