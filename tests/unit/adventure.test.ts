import { describe, expect, it } from "vitest";
import { ADVENTURE, adventureBook, adventureCostLeft, adventureLayout, pageShade, shadePage } from "../../src/engine/adventure";
import { textMask } from "../../src/engine/erase";

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

/**
 * Livro de Aventura falso: as duas páginas de papel claro, a lombada escura entre elas
 * (x 368 a 373) e, na página da esquerda, as barras escuras da aventura até `barBottom`.
 */
function book(barBottom = 747) {
  const c = canvas(gray(20));
  c.fill(50, 650, 368, 955, gray(200));
  c.fill(374, 650, 696, 955, gray(212));
  c.fill(368, 650, 374, 955, gray(70));
  c.fill(371, 650, 373, 955, gray(40));
  // barra do nome (vermelha) e do tipo (mais escura), com letras brancas
  c.fill(44, 652, 368, 698, [150, 50, 40]);
  c.fill(44, 698, 368, 701, gray(25));
  c.fill(44, 701, 368, barBottom, [110, 30, 25]);
  for (let x = 66; x < 230; x += 16) c.fill(x, 712, x + 5, 734, gray(245));
  // texto das duas páginas
  for (let y = 780; y < 900; y += 30) {
    for (let x = 64; x < 340; x += 16) c.fill(x, y, x + 6, y + 16, gray(30));
    for (let x = 398; x < 670; x += 16) c.fill(x, y, x + 6, y + 16, gray(30));
  }
  return c;
}

describe("adventureBook", () => {
  it("acha a lombada e as barras, e o papel logo abaixo da barra do tipo", () => {
    // (a lombada na coluna mais escura; o pé das páginas na sombra logo abaixo do papel)
    expect(adventureBook(book().img)).toEqual({ leftTop: 747, spine: 371, bottom: 955 });
    // o Presságio de TDM: o papel começa mais abaixo, depois do filete da caixa
    const omen = book(752);
    omen.fill(50, 752, 368, 760, gray(60));
    expect(adventureBook(omen.img)?.leftTop).toBe(760);
  });

  it("sem a lombada (a caixa inteira de papel) não é Aventura", () => {
    const c = book();
    c.fill(368, 650, 374, 955, gray(205));
    expect(adventureBook(c.img)).toBeNull();
  });

  it("digitalização clara demais (promos de pré-estreia) sai na original", () => {
    // papel quase branco e as letras do nome a poucos tons da barra: o apagamento não as pegava e
    // o inglês ficava por baixo do português (Chop Down, Cast Off de ELD; Ysgard's Call de CLB)
    const scan = (paper: number, bar: number, letters: number) => {
      const c = book();
      c.fill(50, 747, 368, 955, gray(paper));
      c.fill(374, 650, 696, 955, gray(paper));
      c.fill(368, 650, 374, 955, gray(70));
      c.fill(44, 652, 368, 698, gray(bar));
      for (let x = 66; x < 230; x += 16) c.fill(x, 664, x + 5, 688, gray(letters));
      return adventureBook(c.img);
    };
    expect(scan(251, 226, 251)).toBeNull();
    expect(scan(242, 202, 250)).toBeNull();
    // papel claro com letras bem marcadas, ou letras fracas em papel comum: é Aventura
    expect(scan(235, 170, 250)).not.toBeNull();
    expect(scan(226, 201, 255)).not.toBeNull();
  });

  it("sem as barras escuras da aventura também não", () => {
    const c = book();
    c.fill(50, 652, 368, 747, gray(200));
    expect(adventureBook(c.img)).toBeNull();
  });
});

describe("adventureCostLeft", () => {
  it("conta os símbolos do custo da aventura a partir do fim da barra", () => {
    expect(adventureCostLeft("{1}{R}")).toBe(ADVENTURE.costRight - 2 * ADVENTURE.costSymbol);
    expect(adventureCostLeft("{3}{W}{W}")).toBe(ADVENTURE.costRight - 3 * ADVENTURE.costSymbol);
    expect(adventureCostLeft(null)).toBe(ADVENTURE.costRight);
  });

  it("os símbolos híbridos são maiores: o nome não passa do fim das letras em inglês", () => {
    // Bring Back (ELD 212): as letras acabam em x ≈ 208 e o primeiro {G/W} começa em 213
    const left = adventureCostLeft("{G/W}{G/W}{G/W}{G/W}");
    expect(left).toBeLessThanOrEqual(214);
    expect(left - 5).toBeGreaterThanOrEqual(209);
    expect(adventureLayout({ leftTop: 747, spine: 372, bottom: 956 }, "{G/W}{G/W}{G/W}{G/W}").name.rect.x1).toBeLessThan(213);
  });
});

describe("adventureLayout", () => {
  it("apaga o nome até o custo e a página a partir do papel medido", () => {
    const l = adventureLayout({ leftTop: 760, spine: 372, bottom: 956 }, "{1}{R}");
    expect(l.name.rect.x1).toBe(adventureCostLeft("{1}{R}") - 5);
    expect(l.name.x + l.name.maxWidth).toBeLessThan(adventureCostLeft("{1}{R}"));
    expect(l.spell.erase.y0).toBe(762);
    expect(l.spell.text.y0).toBeGreaterThan(l.spell.erase.y0);
    // as páginas vão até a lombada, sem o fio dela, e até o pé medido
    expect(l.spell.erase.x1).toBe(369);
    expect(l.creature.erase.x0).toBe(376);
    expect(l.spell.erase.y1).toBe(956);
    expect(l.spell.text.x1).toBeLessThan(l.spell.erase.x1);
  });
});

describe("barras da aventura", () => {
  it("a máscara pega a borda suavizada das letras numa barra cinza clara", () => {
    // pontas suavizadas a 24 tons da barra ficavam fora da máscara, e o remendo da linha saía
    // como um risco claro atravessando o nome em PT (Birthright Boon da pré-estreia de WOE)
    const c = canvas(gray(20));
    c.fill(50, 655, 366, 697, gray(180));
    for (let x = 70; x < 250; x += 30) c.fill(x, 664, x + 5, 690, gray(248));
    c.fill(262, 670, 265, 673, gray(204));
    const rect = { x0: 50, y0: 655, x1: 366, y1: 697 };
    const at = (mask: Uint8Array) => mask[(671 - rect.y0) * (rect.x1 - rect.x0) + 263 - rect.x0];
    expect(at(textMask(c.img, rect, ADVENTURE.barThreshold, [], 0, "light", true))).toBe(1);
    expect(at(textMask(c.img, rect, 28, [], 0, "light", true))).toBe(0);
  });
});

describe("pageShade e shadePage", () => {
  /** Página da direita falsa: o papel escurece de 210 a 100 nos 100 px colados na lombada (x 376). */
  function shadedPage() {
    const c = canvas(gray(210));
    for (let x = 376; x < 476; x++) c.fill(x, 650, x + 1, 955, gray(100 + (x - 376) * 1.1));
    // linhas de texto por cima da sombra
    for (let y = 700; y < 900; y += 32) for (let x = 398; x < 660; x += 16) c.fill(x, y, x + 6, y + 18, gray(25));
    return c;
  }
  const rect = { x0: 376, y0: 656, x1: 690, y1: 950 };
  const at = (img: ImageData, x: number, y: number) => img.data[(y * W + x) * 4];

  it("tira a sombra da lombada: o papel fica no tom da coluna mais clara", () => {
    const c = shadedPage();
    const shade = pageShade(c.img, rect);
    shadePage(c.img, rect, shade);
    // papel colado na lombada, no meio da sombra e longe dela: o mesmo tom, o do papel
    for (const x of [380, 420, 600]) expect(Math.abs(at(c.img, x, 690) - 210)).toBeLessThanOrEqual(6);
    // as letras longe da lombada continuam como eram (escurecer o papel tirava o contraste
    // delas, e o {T} cinza do Midgar, FIN 286, saía da máscara)
    expect(at(c.img, 592, 705)).toBe(25);
    expect(at(c.img, 398, 705)).toBeLessThan(60);
  });

  it("devolve a sombra: o que não foi apagado volta exatamente como era, o remendo ganha a sombra", () => {
    const c = shadedPage();
    const before = new Uint8ClampedArray(c.img.data);
    const shade = pageShade(c.img, rect);
    const back = shadePage(c.img, rect, shade);
    // um "remendo" de papel liso, no tom da página já sem sombra, colado na lombada
    c.fill(380, 900, 390, 940, gray(210));
    back();
    let worst = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (x >= 380 && x < 390 && y >= 900 && y < 940) continue;
        const i = (y * W + x) * 4;
        worst = Math.max(worst, Math.abs(before[i] - c.img.data[i]));
      }
    expect(worst).toBe(0);
    // o remendo volta com a sombra da coluna dele (o papel ali é ~105)
    expect(Math.abs(at(c.img, 384, 920) - before[(690 * W + 384) * 4])).toBeLessThanOrEqual(6);
  });
});
