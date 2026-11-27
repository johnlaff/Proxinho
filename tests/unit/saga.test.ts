import { describe, expect, it } from "vitest";
import {
  DIVIDER_SPAN,
  dividerProfile,
  drawDivider,
  sagaArtLeft,
  sagaBackPt,
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

  it("nas Invocações, só os fios acima da barra de tipo", () => {
    const c = column();
    shadow(c, 221, [232, 229, 226, 223, 220, 217, 214, 211]);
    shadow(c, 575, [232, 229, 226, 223, 220, 217, 214, 211]);
    shadow(c, 850, [232, 229, 226, 223, 220, 217, 214, 211]);
    const art = sagaArtLeft(c.img)!;
    expect(sagaDividers(c.img, art)).toEqual([221, 575, 850]);
    expect(sagaDividers(c.img, art, 778)).toEqual([221, 575]);
  });

  it("a linha de base cheia de serifas não é fio (The Legend of Yangchen, TLA 27)", () => {
    // ela clareia 85% da largura e tem a mediana abaixo da linha 6 px acima, como a sombra; mas a
    // sombra é lisa e a linha de base tem tinta de letra em mais da metade
    const c = column();
    shadow(c, 500, [232, 229, 226, 223, 220, 217, 214, 211]);
    for (const y of [791, 792]) {
      c.fill(87, y, 368, y + 1, gray(225));
      for (let x = 100; x < 360; x += 10) c.fill(x, y, x + 6, y + 1, gray(40));
    }
    const art = sagaArtLeft(c.img)!;
    expect(sagaDividers(c.img, art)).toEqual([500]);
  });

  it("a retícula na linha mais escura da sombra não tira o fio (The Great Synthesis, PMOM 65s)", () => {
    const c = column();
    shadow(c, 500, [232, 229, 226, 223, 220, 217, 214, 200]);
    // 22% dos pixels da linha logo antes do degrau são pontos escuros da retícula
    for (let x = 100; x < 360; x += 9) c.fill(x, 499, x + 2, 500, gray(120));
    const art = sagaArtLeft(c.img)!;
    expect(sagaDividers(c.img, art)).toEqual([500]);
  });

  it("o lado da arte é o fio, não a arte mais escura logo depois (The Dragon-Kami Reborn, NEO 181†)", () => {
    const c = column();
    c.fill(370, 0, 383, H, gray(28)); // o fio, e a arte quase preta grudada nele
    c.fill(381, 0, 383, H, gray(20));
    expect(sagaArtLeft(c.img)).toBe(370);
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

  it("a ponta da tira em seta ao lado do P/R do verso fica de fora com a busca até o fim da coluna (PTLA 27s)", () => {
    const c = column();
    c.fill(28, 119, 86, 867, gray(30));
    c.fill(30, 745, 85, 790, gray(200));
    c.fill(50, 755, 64, 778, gray(40)); // o "III"
    // a seta: o foil claro da moldura à esquerda, o contorno preto e o papel à direita
    c.fill(30, 808, 43, 834, gray(220));
    c.fill(43, 808, 72, 834, gray(20));
    c.fill(72, 808, 86, 834, gray(235));
    expect(sagaNumerals(c.img, 300, 867)).toEqual([766, 820.5]);
    // o P/R do verso começa em 827, e a coluna acaba 4 px antes
    expect(sagaNumerals(c.img, 300, 823)).toEqual([766]);
  });
});

describe("sagaBackPt", () => {
  /** O pé da coluna da Saga de transformar: a tira dos marcadores em ponta e o papel ao lado. */
  function foot() {
    const c = column();
    c.fill(28, 119, 58, 830, gray(30)); // a tira, até a ponta
    c.fill(28, 830, 40, 867, gray(30)); // a ponta e a moldura do recorte
    return c;
  }

  it("acha o alto do P/R do verso, ao lado da ponta da tira", () => {
    const c = foot();
    c.fill(66, 832, 80, 854, gray(110)); // "0"
    c.fill(84, 832, 88, 854, gray(110)); // "/"
    c.fill(92, 832, 108, 854, gray(110)); // "0"
    // a última linha em inglês desce ao lado, depois de um vão: não é o fim dos algarismos
    c.fill(130, 832, 300, 840, gray(20));
    expect(sagaBackPt(c.img)).toEqual({ y0: 832, y1: 853, x1: 107 });
  });

  it("o texto do último capítulo, que começa em x 100, não conta; sem o P/R, nada", () => {
    const c = foot();
    c.fill(100, 790, 300, 812, gray(20)); // a última linha do capítulo
    c.fill(102, 812, 108, 818, gray(20)); // a perna do "y"
    expect(sagaBackPt(c.img)).toBeNull();
    // uma mancha que não tem a altura de um algarismo também não
    c.fill(70, 840, 80, 846, gray(110));
    expect(sagaBackPt(c.img)).toBeNull();
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
      tail: [],
    });
  });

  it("texto depois dos capítulos ou sem capítulo não é desta moldura", () => {
    expect(sagaText("I — Compre um card.\nVoar")).toBeNull();
    expect(sagaText("Voar")).toBeNull();
    expect(sagaText(null)).toBeNull();
  });

  it("nas Invocações, o que vem depois dos capítulos vai para a caixa de baixo", () => {
    expect(sagaText("(Lembrete.)\nI — Compre um card.\nII — Ganhe 2 pontos de vida.\nVoar, ímpeto", true)).toEqual({
      top: [{ text: "(Lembrete.)", line: 0 }],
      chapters: [
        { numerals: "I", text: "Compre um card.", line: 1 },
        { numerals: "II", text: "Ganhe 2 pontos de vida.", line: 2 },
      ],
      tail: [{ text: "Voar, ímpeto", line: 3 }],
    });
  });

  it("as opções de um capítulo vão com ele (Summon: Magus Sisters, FIC 71)", () => {
    const text = "I, II, III — Escolha um aleatoriamente —\n•Unir Forças! — Três marcadores.\n•Defesa! — Um marcador.\nÍmpeto";
    const parts = sagaText(text, true);
    expect(parts?.chapters).toEqual([
      { numerals: "I, II, III", text: "Escolha um aleatoriamente —\n•Unir Forças! — Três marcadores.\n•Defesa! — Um marcador.", line: 0 },
    ]);
    expect(parts?.tail).toEqual([{ text: "Ímpeto", line: 3 }]);
    // na Saga comum, as opções também são do capítulo, e o texto depois dele ainda tira a carta da moldura
    expect(sagaText("I — Escolha um —\n• Compre um card.\n• Ganhe 2 pontos de vida.")?.chapters).toHaveLength(1);
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

  it("na coluna das Invocações, entre o fio do lembrete e a barra de tipo", () => {
    // Summon: Shiva (FIN 78): o fio do lembrete fica em 221 e a barra de tipo começa em 786
    const column = { y0: 221, y1: 785 };
    const markers = [
      { first: 348.5, last: 426.5 },
      { first: 673.5, last: 673.5 },
    ];
    const plan = sagaPlan([150, 100], false, markers, Infinity, column);
    expect(plan).toHaveLength(1);
    expect(plan![0]).toBeGreaterThan(426.5 + 31);
    expect(plan![0]).toBeLessThan(673.5 - 31);
    // o último capítulo não passa da barra de tipo
    expect(sagaPlan([150, 320], false, markers, Infinity, column)).toBeNull();
    // e as faixas começam no fio do lembrete, todas de capítulo (a tira dos marcadores fica)
    const bands = sagaBands([575], 371, column, false);
    expect(bands[0].erase).toEqual({ x0: 87, y0: 222, x1: 369, y1: 574 });
    expect(bands[1].erase.y1).toBe(785);
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
