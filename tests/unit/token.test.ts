import { describe, expect, it } from "vitest";
import {
  findPlaque2003,
  findTokenBar,
  findTokenBoxBottom,
  plaqueRowSpan,
  smallCaps,
  textCentered,
  titleIsLeftAligned,
  titleIsEmblemWord,
  tokenLayout,
  tokenPtBox,
} from "../../src/engine/token";
import { printImage } from "../../src/engine/types";

/** Ficha falsa 745 × 1040: arte com ruído, barra clara entre dois fios escuros e caixa clara. */
function fakeToken(bar: [number, number] | null, boxBottom = 962): ImageData {
  const width = 745;
  const height = 1040;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // arte: listras escuras e médias que não formam fios atravessando a carta
      let v = ((x >> 3) + (y >> 2)) % 3 === 0 ? 40 : 120;
      if (bar) {
        const [a, b] = bar;
        if (y > a && y < b) v = 225; // interior da barra
        if (y === a || y === a + 1 || y === b || y === b + 1) v = 30; // fios
        if (b < 860 && y > b + 1 && y < boxBottom) v = 215; // caixa de texto
        if (b < 860 && (y === boxBottom || y === boxBottom + 1)) v = 30;
      }
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("findTokenBar", () => {
  it("acha a barra de tipo pelos dois fios", () => {
    // os fios têm 2 px: qualquer um dos dois serve
    const bar = findTokenBar(fakeToken([701, 759]))!;
    expect(bar.y0).toBeGreaterThanOrEqual(701);
    expect(bar.y0).toBeLessThanOrEqual(702);
    expect(bar.y1).toBeGreaterThanOrEqual(759);
    expect(bar.y1).toBeLessThanOrEqual(760);
  });

  it("acha a barra alta das fichas com muito texto e a baixa das sem texto", () => {
    expect(Math.round(findTokenBar(fakeToken([583, 641]))!.y0)).toBeOneOf([583, 584]);
    expect(Math.round(findTokenBar(fakeToken([850, 907]))!.y0)).toBeOneOf([850, 851]);
  });

  it("ficha de duas cores: o fio de cima some no papel claro de metade da barra (Espírito, EVE)", () => {
    const img = fakeToken([686, 738]);
    // à esquerda, papel claro da cor da barra em cima dela: sem fio de cima ali
    for (let y = 676; y <= 687; y++) for (let x = 0; x < 340; x++) img.data.fill(225, (y * 745 + x) * 4, (y * 745 + x) * 4 + 3);
    const bar = findTokenBar(img)!;
    expect(bar).not.toBeNull();
    expect(bar.y0).toBeGreaterThanOrEqual(683);
    expect(bar.y0).toBeLessThanOrEqual(688);
    expect(bar.y1).toBeGreaterThanOrEqual(737);
    expect(bar.y1).toBeLessThanOrEqual(740);
  });

  it("devolve null quando não há moldura de ficha", () => {
    expect(findTokenBar(fakeToken(null))).toBeNull();
  });

  it("acha o pé da caixa de texto", () => {
    const img = fakeToken([701, 759], 962);
    expect(findTokenBoxBottom(img, { y0: 701, y1: 759 })).toBe(962);
  });
});

describe("tokenLayout", () => {
  it("monta tipo e caixa a partir da barra", () => {
    const l = tokenLayout({ y0: 701, y1: 759 }, 655, 962);
    expect(l.type.centerY).toBe(730);
    expect(l.type.x1).toBe(644); // símbolo da coleção limitado a x 650
    expect(l.box?.text).toEqual({ x0: 68, y0: 771, x1: 677, y1: 952 });
  });

  it("ficha sem texto não tem caixa", () => {
    expect(tokenLayout({ y0: 850, y1: 907 }, 660, 962).box).toBeNull();
  });
});

describe("smallCaps", () => {
  it("separa maiúsculas grandes do resto em versalete", () => {
    expect(smallCaps("Elfo Guerreiro")).toEqual([
      { text: "E", big: true },
      { text: "LFO", big: false },
      { text: " G", big: true },
      { text: "UERREIRO", big: false },
    ]);
  });
});

describe("moldura de 2003", () => {
  it("usa a caixa de P/R mais à esquerda e o nome mais estreito", () => {
    const l = tokenLayout({ y0: 686, y1: 747 }, 655, 945, "2003");
    expect(l.pt.x0).toBe(546);
    expect(l.name.x1 - l.name.x0).toBeLessThan(450);
  });

  it("barra de tipo: o apagador começa depois do fio arredondado da ponta esquerda (Javali, THS)", () => {
    // medido nas imagens: fio escuro em "(" de x ≈ 52 a 59, papel a partir de 60 (62 nas
    // linhas de cima e de baixo, pela curva) e o tipo em inglês em x ≈ 71
    const l = tokenLayout({ y0: 854, y1: 906 }, 655, 962, "2003");
    expect(l.type.x0).toBeGreaterThan(62);
    expect(l.type.x0).toBeLessThan(71);
    expect(l.type.x).toBeGreaterThanOrEqual(l.type.x0 + 4);
    // a moldura nova tem a barra até a borda e segue como estava
    const n = tokenLayout({ y0: 854, y1: 906 }, 655, 962);
    expect([n.type.x0, n.type.x]).toEqual([50, 62]);
  });

  /** Fundo claro com textura, placa escura centrada (x 260–485) e letras douradas. */
  function fakePlaque(): ImageData {
    const width = 745;
    const height = 1040;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let rgb = (x + y) % 7 === 0 ? [150, 160, 140] : [190, 200, 180];
        if (y >= 56 && y < 106 && x >= 260 && x < 485) {
          rgb = [30, 24, 16];
          // letras: colunas douradas de 4 px a cada 20 px, entre y 66 e 98
          if (y >= 66 && y < 98 && x >= 280 && x < 465 && (x - 280) % 20 < 4) rgb = [215, 190, 110];
        }
        data.set([...rgb, 255], i);
      }
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  }

  it("acha a placa do nome pela cor do fundo e lê a cor das letras", () => {
    const p = findPlaque2003(fakePlaque())!;
    expect(p.x0).toBeGreaterThan(245);
    expect(p.x0).toBeLessThan(275);
    expect(p.x1).toBeGreaterThan(470);
    expect(p.x1).toBeLessThan(500);
    expect(p.ink).toBe("rgb(215,190,110)");
    expect(p.rows[10]).toEqual([30, 24, 16]);
  });
});

describe("placa de 2003 ao lado de arte escura", () => {
  /**
   * Placa escura (x 260–485, ou `px0`–`px1`) com filete dourado de 3 px em volta e
   * letras douradas. `art(x, y)` pinta o que fica fora da placa.
   */
  function plaqueOn(art: (x: number, y: number) => number[], px0 = 260, px1 = 485): ImageData {
    const width = 745;
    const height = 1040;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let rgb = art(x, y);
        if (y >= 54 && y < 105 && x >= px0 && x < px1) {
          const rim = y < 57 || y >= 102 || x < px0 + 3 || x >= px1 - 3;
          rgb = rim ? [200, 170, 90] : [30, 24, 16];
          if (!rim && y >= 66 && y < 98 && x >= px0 + 25 && x < px1 - 25 && (x - px0 - 25) % 20 < 4) rgb = [215, 190, 110];
        }
        data.set([...rgb, 255], (y * width + x) * 4);
      }
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  }
  // moldura preta com grão: a mesma cor do fundo da placa
  const dark = (x: number, y: number) => ((x * 7 + y * 3) % 5 === 0 ? [44, 44, 48] : [22, 22, 26]);
  const light = (x: number, y: number) => ((x + y) % 7 === 0 ? [150, 160, 140] : [190, 200, 180]);

  it("ficha preta (Zumbi, Demônio): a placa acaba onde acaba o filete dourado", () => {
    const p = findPlaque2003(plaqueOn(dark))!;
    expect(p).not.toBeNull();
    expect(p.x0).toBeGreaterThanOrEqual(255);
    expect(p.x0).toBeLessThanOrEqual(266);
    expect(p.x1).toBeGreaterThanOrEqual(479);
    expect(p.x1).toBeLessThanOrEqual(490);
  });

  it("sombra escura fora da ponta: a placa repintada não cobre o filete (Goblin, 10E)", () => {
    // 14 px de sombra da cor do fundo logo à esquerda do filete
    const p = findPlaque2003(plaqueOn((x, y) => (x >= 246 && x < 260 ? dark(x, y) : light(x, y))))!;
    // a placa é repintada de x0 + 7 em diante: o filete (260–262) tem de ficar
    expect(p.x0 + 7).toBeGreaterThanOrEqual(263);
    expect(p.x0).toBeLessThanOrEqual(266);
  });

  it('placa curta ("Cat") e placa quase da largura da carta ("Elemental Shaman")', () => {
    const cat = findPlaque2003(plaqueOn(light, 310, 436))!;
    expect(cat).not.toBeNull();
    expect(cat.x0).toBeGreaterThanOrEqual(305);
    expect(cat.x1).toBeLessThanOrEqual(441);
    const wide = findPlaque2003(plaqueOn(light, 50, 695))!;
    expect(wide).not.toBeNull();
    expect(wide.x0).toBeLessThanOrEqual(56);
    expect(wide.x1).toBeGreaterThanOrEqual(689);
  });

  it("pé de letra perto do filete é repintado, e o filete fica (Elemental, DD1)", () => {
    for (const art of [light, dark]) {
      const img = plaqueOn(art);
      // pé do "L": 3 px, a 4 px do filete da direita (482–484)
      for (let y = 90; y < 98; y++) for (let x = 475; x < 478; x++) img.data.set([215, 190, 110], (y * 745 + x) * 4);
      const p = findPlaque2003(img)!;
      const [a, b] = plaqueRowSpan(img, p, 93 - Math.round(p.y0));
      expect(b).toBeGreaterThanOrEqual(478); // cobre o pé (475–477); o recuo fixo parava antes
      expect(b).toBeLessThanOrEqual(482); // o filete da direita (482–484) fica
      expect(a).toBeGreaterThanOrEqual(263); // o da esquerda (260–262) também
      expect(a).toBeLessThanOrEqual(270);
    }
  });

  it("céu escuro só de um lado: o lado que passa do filete fica com o do filete (Golem, J13)", () => {
    // à direita, 40 px de céu escuro antes da arte clara: a cor passava 20 px do filete
    const p = findPlaque2003(plaqueOn((x, y) => (x >= 485 && x < 525 ? dark(x, y) : light(x, y))))!;
    expect(p.x1 - 7).toBeLessThanOrEqual(482);
    expect(p.x1).toBeGreaterThanOrEqual(479);
  });
});

describe("printImage", () => {
  it("a face de trás das fichas de duas faces vem do verso", () => {
    expect(printImage({ id: "05934d59-7e98-4fff-8ccb-70cd1a61c6fd#1" }, "png")).toBe(
      "https://cards.scryfall.io/png/back/0/5/05934d59-7e98-4fff-8ccb-70cd1a61c6fd.png",
    );
    expect(printImage({ id: "05934d59-7e98-4fff-8ccb-70cd1a61c6fd" }, "small")).toBe(
      "https://cards.scryfall.io/small/front/0/5/05934d59-7e98-4fff-8ccb-70cd1a61c6fd.jpg",
    );
  });
});

describe("caixa de P/R das fichas", () => {
  const layout = tokenLayout({ y0: 520, y1: 578 }, 640, 958);
  it("protege a caixa quando a ficha tem P/R", () => {
    expect(tokenPtBox(layout, "2/2")).toEqual(layout.pt);
  });
  it("não protege nada em emblemas e fichas sem P/R, para apagar o canto em inglês", () => {
    expect(tokenPtBox(layout, null)).toBeNull();
  });
});

describe("emblemas", () => {
  it('o título dos emblemas até 2019 é "Emblem", não o nome do planeswalker (Liliana, ORI)', () => {
    // medidas da Vraska (GRN): título de 156 px, "Emblem" no nosso corpo tem 124, o nome 390
    expect(titleIsEmblemWord(156, 124, 390, 605)).toBe(true);
    // Wrenn e Seis (MH1): nome curto, mas o título de 157 px é "Emblem"
    expect(titleIsEmblemWord(157, 124, 245, 605)).toBe(true);
    // nos de 2019 em diante o título é o nome (Basri Ket, M21: 201 px, nome de 158)
    expect(titleIsEmblemWord(201, 124, 158, 605)).toBe(false);
    // nome comprido, apertado na barra
    expect(titleIsEmblemWord(590, 124, 700, 605)).toBe(false);
  });

  it("acha o texto centralizado (Domri Rade, MM3) e o alinhado à esquerda (Sephiroth, FIN)", () => {
    const w = 600;
    const h = 120;
    const lines = (spans: [number, number][]) => {
      const mask = new Uint8Array(w * h);
      spans.forEach(([a, b], i) => {
        for (let y = 10 + i * 30; y < 28 + i * 30; y++) for (let x = a; x < b; x += 3) mask[y * w + x] = mask[y * w + x + 1] = 1;
      });
      // a marca-d'água no meio da caixa, de cima a baixo, liga as linhas
      for (let y = 0; y < h; y++) for (let x = 280; x < 300; x++) mask[y * w + x] = 1;
      return { rect: { x0: 60, y0: 900, x1: 60 + w, y1: 900 + h }, mask };
    };
    // linhas de larguras diferentes com o meio no mesmo lugar
    expect(
      textCentered(
        lines([
          [90, 510],
          [120, 480],
          [200, 400],
        ]),
        1,
      ),
    ).toBe(true);
    // o começo no mesmo lugar, o fim muda
    expect(
      textCentered(
        lines([
          [20, 560],
          [20, 540],
          [20, 120],
        ]),
        1,
      ),
    ).toBe(false);
    // uma linha só, longe da margem e com o meio no meio da caixa: centralizada (Wrenn and
    // Seven, INR); o português que quebra em duas linhas sai centralizado também
    expect(textCentered(lines([[44, 556]]), 1)).toBe(true);
    // uma linha curta que começa na margem: alinhada à esquerda (Druida Elfo, CMM; Boo,
    // AFR), e o português de uma linha também sai assim
    expect(textCentered(lines([[20, 300]]), 1)).toBe(false);
    // de ponta a ponta: quem decide é quem chama
    expect(textCentered(lines([[10, 590]]), 1)).toBeNull();
    // linhas de mesma largura longe da margem: não dá para dizer
    expect(
      textCentered(
        lines([
          [100, 500],
          [102, 498],
        ]),
        1,
      ),
    ).toBeNull();
    // com a margem do texto alinhado à esquerda conhecida (as divididas antigas, ADR 0038), dá: o
    // que começa depois dela é centralizado (Wane, INV 296), numa linha só também (Suffering,
    // INV 294), e o que começa nela é alinhado à esquerda
    expect(
      textCentered(
        lines([
          [100, 500],
          [102, 498],
        ]),
        1,
        12,
      ),
    ).toBe(true);
    expect(textCentered(lines([[24, 368]]), 1, 12)).toBe(true);
    expect(
      textCentered(
        lines([
          [8, 560],
          [8, 300],
        ]),
        1,
        12,
      ),
    ).toBe(false);
  });

  it("um pingo da textura longe das letras não faz a linha do meio começar na margem (Pássaro, P03)", () => {
    const w = 617;
    const h = 166;
    const mask = new Uint8Array(w * h);
    // "Flying" no meio da caixa
    for (let y = 70; y < 105; y++) for (let x = 250; x < 360; x += 3) mask[y * w + x] = mask[y * w + x + 1] = 1;
    // e uma bolha da textura, pequena, perto da margem, na altura do alto das letras
    for (let y = 69; y < 75; y++) for (let x = 15; x < 25; x++) mask[y * w + x] = 1;
    expect(textCentered({ rect: { x0: 65, y0: 756, x1: 65 + w, y1: 756 + h }, mask }, 1)).toBe(true);
  });

  it("nome de carta na moldura de ficha, na esquerda (Marit Lage da SLD 1681), e os centralizados", () => {
    const bar = { x0: 70, x1: 675 };
    expect(titleIsLeftAligned({ x0: 67, x1: 527 }, bar)).toBe(true);
    // centralizados: curto, comprido e quase de ponta a ponta
    expect(titleIsLeftAligned({ x0: 330, x1: 415 }, bar)).toBe(false);
    expect(titleIsLeftAligned({ x0: 165, x1: 540 }, bar)).toBe(false);
    expect(titleIsLeftAligned({ x0: 80, x1: 660 }, bar)).toBe(false);
  });
});
