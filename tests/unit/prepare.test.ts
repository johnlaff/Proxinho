import { describe, expect, it } from "vitest";
import { adventureBook } from "../../src/engine/adventure";
import { PREPARE, prepareCostLeft, prepareFrame, prepareLayout } from "../../src/engine/prepare";

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
 * Caixa do Preparar falsa, nas medidas de SOS 98 (Scathing Shadelock): a página da criatura de
 * papel claro, o fio escuro entre as caixas (x 366 a 377, o mais escuro em 372), as barras da
 * mágica à direita e a caixa dela, de papel mais escuro, entre o bisel claro e o da caixa de P/R.
 */
function frame() {
  const c = canvas(gray(14));
  c.fill(50, 652, 366, 960, gray(232));
  c.fill(366, 652, 378, 960, gray(90));
  c.fill(371, 652, 374, 960, gray(28));
  // barras do nome e do tipo, com letras brancas, e o bisel claro abaixo delas
  c.fill(378, 657, 700, 700, gray(88));
  c.fill(378, 700, 700, 702, gray(5));
  c.fill(378, 702, 700, 750, gray(52));
  for (let x = 392; x < 560; x += 16) {
    c.fill(x, 668, x + 5, 688, gray(245));
    c.fill(x, 714, x + 5, 738, gray(245));
  }
  c.fill(378, 750, 700, 754, gray(40));
  c.fill(378, 754, 700, 757, gray(240));
  c.fill(378, 757, 700, 760, gray(100));
  c.fill(378, 760, 688, 919, gray(168));
  c.fill(378, 919, 700, 922, gray(225));
  c.fill(378, 922, 700, 960, gray(50));
  // texto das duas caixas
  for (let y = 780; y < 900; y += 30) {
    for (let x = 64; x < 350; x += 16) c.fill(x, y, x + 6, y + 16, gray(30));
    for (let x = 392; x < 670; x += 16) c.fill(x, y, x + 6, y + 16, gray(30));
  }
  return c;
}

describe("prepareFrame", () => {
  it("acha o fio entre as caixas e a caixa da mágica entre os dois biséis", () => {
    // (o topo depois do bisel claro, que passa do tom do papel; o pé no bisel de cima da caixa de P/R)
    expect(prepareFrame(frame().img)).toEqual({ divider: 371, spellTop: 760, spellBottom: 919, bottom: 960 });
  });

  it("uma linha de texto denso no pé da caixa da mágica não passa pelo fim dela", () => {
    // (pela mediana da linha, o fim caía na última linha em inglês e ela ficava: Omit Variables,
    // FRA 156)
    const c = frame();
    for (let x = 392; x < 680; x += 12) c.fill(x, 890, x + 9, 906, gray(30));
    expect(prepareFrame(c.img)?.spellBottom).toBe(919);
  });

  it("o pé de uma última linha baixa na página da criatura não passa pelo fim da página", () => {
    // (pela mediana da linha, o pé da página caía em 944 e o "becomes prepared." ficava embaixo
    // do português: Emeritus of Ideation, SOS 45)
    const c = frame();
    for (let x = 64; x < 350; x += 12) c.fill(x, 930, x + 9, 946, gray(30));
    expect(prepareFrame(c.img)?.bottom).toBe(960);
  });

  it("sem o fio (a caixa inteira de papel) não é Preparar", () => {
    const c = frame();
    c.fill(366, 652, 378, 960, gray(232));
    expect(prepareFrame(c.img)).toBeNull();
  });

  it("sem as barras escuras da mágica também não", () => {
    const c = frame();
    c.fill(378, 657, 700, 750, gray(168));
    expect(prepareFrame(c.img)).toBeNull();
  });

  it("não passa por livro de Aventura: as barras estão do outro lado", () => {
    expect(adventureBook(frame().img)).toBeNull();
  });
});

describe("prepareLayout", () => {
  it("a mágica à direita do fio, a criatura à esquerda, cada uma até o pé medido", () => {
    const l = prepareLayout({ divider: 372, spellTop: 760, spellBottom: 919, bottom: 960 }, "{1}{W}{W}");
    expect(l.name.rect.x0).toBeGreaterThan(372);
    expect(l.name.rect.x1).toBe(prepareCostLeft("{1}{W}{W}") - 5);
    expect(l.name.x + l.name.maxWidth).toBeLessThan(prepareCostLeft("{1}{W}{W}"));
    expect(l.spell.erase).toEqual({ x0: PREPARE.spell.x0, y0: 761, x1: PREPARE.spell.x1, y1: 918 });
    expect(l.spell.text.y0).toBeGreaterThan(l.spell.erase.y0);
    expect(l.spell.text.y1).toBeLessThan(l.spell.erase.y1);
    // a página da criatura para antes da beira do fio, e o texto desce até o pé da caixa comum
    expect(l.creature.erase.x1).toBe(368);
    expect(l.creature.erase.y1).toBe(960);
    expect(l.creature.text.x1).toBeLessThan(l.creature.erase.x1);
    expect(l.creature.text.y1).toBe(PREPARE.creature.textBottom);
    expect(l.shaded).toBe(false);
    // (a linha escura logo abaixo da barra do nome, até 705, fica: apagada, virava um risco claro
    // no alto do tipo em PT, Estrofe Heroica, SOS 170)
    expect(l.type.rect.y0).toBeGreaterThan(705);
  });

  it("o custo conta os híbridos maiores", () => {
    expect(prepareCostLeft("{B}")).toBe(PREPARE.costRight - PREPARE.costSymbol);
    expect(prepareCostLeft("{G/W}{G/W}")).toBe(PREPARE.costRight - 2 * PREPARE.costHybrid);
    expect(prepareCostLeft(null)).toBe(PREPARE.costRight);
  });
});
