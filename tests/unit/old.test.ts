import { describe, expect, it } from "vitest";
import { OLD, oldCostLeft, oldLetters, oldTypeEnds } from "../../src/engine/old";

const W = 745;
const H = 640;

type Color = [number, number, number];

/** Moldura antiga falsa: textura cinza (110 a 130) em xadrez fino, como o mármore. */
function frame() {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = 110 + ((x * 7 + y * 13) % 21);
      const i = (y * W + x) * 4;
      data.set([v, v, v, 255], i);
    }
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...c, 255], (y * W + x) * 4);
  };
  /** uma "letra": haste branca de 4 px, com a sombra preta 2 px à direita e abaixo */
  const letter = (x: number, top: number, base: number) => {
    fill(x + 2, top + 2, x + 6, base + 2, [30, 30, 30]);
    fill(x, top, x + 4, base, [236, 234, 228]);
  };
  return { img, fill, letter };
}

const at = (l: ReturnType<typeof oldLetters>, x: number, y: number) => l.mask[(y - l.rect.y0) * (l.rect.x1 - l.rect.x0) + x - l.rect.x0];

describe("moldura antiga (ADR 0031)", () => {
  it("o custo: um símbolo a cada 40 px, o último acabando em 690", () => {
    expect(oldCostLeft("{2}{W}")).toBe(610);
    expect(oldCostLeft("{X}{R}{R}{R}")).toBe(530);
    // sem custo (terreno), o nome vai até a ponta
    expect(oldCostLeft("")).toBe(700);
    expect(oldCostLeft(null)).toBe(700);
  });

  it("acha as letras brancas com sombra do nome, as palavras e a linha de base", () => {
    const { img, fill, letter } = frame();
    for (const x of [80, 90, 100, 110]) letter(x, 58, 81);
    for (const x of [140, 150, 160]) letter(x, 58, 81);
    // uma haste alta (o "l") e o pingo de um "i", solto da haste dele por 3 px: fora da faixa das
    // minúsculas, mas é letra (o pingo sobrava ao lado do português, JUD 28)
    letter(120, 50, 81);
    letter(100, 52, 55);
    // o filete claro do bisel da arte, logo abaixo das letras: comprido, não é letra
    fill(74, 98, 700, 100, [228, 226, 220]);
    // e o mesmo filete partido pela textura em pedaços curtos: somados, enchem mais a linha que
    // as letras, mas são baixos (Standardize, ONS 116)
    for (let x = 74; x < 590; x += 40) fill(x, 91, x + 30, 93, [228, 226, 220]);
    const name = { x0: OLD.name.x0, y0: OLD.name.y0, x1: 600, y1: OLD.name.y1 };
    const l = oldLetters(img, name);
    expect(l.blocks).toEqual([
      { x0: 80, x1: 124 },
      { x0: 140, x1: 164 },
    ]);
    expect(l.baseline).toBe(81);
    // letra e sombra (com a folga) entram na máscara; o bisel e a textura longe delas, não
    expect(at(l, 82, 70)).toBe(1);
    expect(at(l, 102, 53)).toBe(1);
    expect(at(l, 117, 82)).toBe(1);
    expect(at(l, 300, 99)).toBe(0);
    expect(at(l, 300, 92)).toBe(0);
    expect(at(l, 300, 70)).toBe(0);
  });

  it("o símbolo com contorno branco, depois de um vão, sai das letras do tipo", () => {
    const { img, letter } = frame();
    for (const x of [80, 90, 100, 110, 130, 140, 150]) letter(x, 588, 608);
    for (const x of [640, 648, 656, 664]) letter(x, 584, 612);
    const t = oldLetters(img, { x0: OLD.type.x0, y0: OLD.type.y0, x1: OLD.type.x1, y1: OLD.type.y1 });
    expect(oldTypeEnds(img, t)).toEqual({ textEnd: 154, symbol: 640 });
  });

  it("o símbolo colorido, sem letra branca, é achado pela cor, da ponta para a esquerda", () => {
    const { img, fill, letter } = frame();
    for (const x of [80, 90, 100, 110]) letter(x, 588, 608);
    fill(650, 586, 680, 612, [190, 40, 30]);
    const t = oldLetters(img, { x0: OLD.type.x0, y0: OLD.type.y0, x1: OLD.type.x1, y1: OLD.type.y1 });
    expect(oldTypeEnds(img, t)).toEqual({ textEnd: 114, symbol: 650 });
  });

  it("sem símbolo, o tipo acaba nas letras e o símbolo fica nulo", () => {
    const { img, letter } = frame();
    for (const x of [80, 90, 100, 110]) letter(x, 588, 608);
    const t = oldLetters(img, { x0: OLD.type.x0, y0: OLD.type.y0, x1: OLD.type.x1, y1: OLD.type.y1 });
    expect(oldTypeEnds(img, t)).toEqual({ textEnd: 114, symbol: null });
  });

  it("uma letra comprida perto do fim, colada no texto, não passa por símbolo", () => {
    const { img, letter } = frame();
    // "Summon Legend" até x 590: o último trecho começa depois de 575, mas sem vão antes
    for (let x = 80; x <= 590; x += 10) letter(x, 588, 608);
    const t = oldLetters(img, { x0: OLD.type.x0, y0: OLD.type.y0, x1: OLD.type.x1, y1: OLD.type.y1 });
    expect(oldTypeEnds(img, t)).toEqual({ textEnd: 594, symbol: null });
  });
});
