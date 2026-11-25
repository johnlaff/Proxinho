import { describe, expect, it } from "vitest";
import { AFTERMATH, aftermathBox, aftermathCostLeft, aftermathFrame, barSpan } from "../../src/engine/aftermath";

type Color = [number, number, number];
const gray = (v: number): Color => [v, v, v];

function canvas(w: number, h: number, bg: Color) {
  const data = new Uint8ClampedArray(w * h * 4);
  const img = { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        data.set(c, i);
        data[i + 3] = 255;
      }
  };
  fill(0, 0, w, h, bg);
  return { img, fill };
}

/**
 * Consequência falsa nas medidas de Dusk // Dawn (AKH 210): a carta de pé com a metade de cima
 * (barra do nome de 52 a 105, barra de tipo de 358 a 410, caixa de 424 a 557) e a carta girada no
 * sentido anti-horário com a de baixo (barra do nome de 57 a 110, tipo de 345 a 397, caixa de 408
 * a 690). `dy` desce as barras de cima, como nas reimpressões.
 */
function aftermath({ dy = 0, white = false } = {}) {
  const up = canvas(745, 1040, gray(14));
  up.fill(30, 30, 715, 600, white ? gray(236) : ([30, 90, 170] as Color));
  // cada barra com o contorno escuro dela (na moldura branca, é ele que separa a barra)
  up.fill(38, 49 + dy, 708, 108 + dy, gray(12));
  up.fill(42, 52 + dy, 704, 105 + dy, gray(205));
  for (let x = 64; x < 200; x += 18) up.fill(x, 66 + dy, x + 9, 92 + dy, gray(30));
  up.fill(48, 112, 698, 350, gray(60));
  up.fill(38, 355 + dy, 708, 413 + dy, gray(12));
  up.fill(42, 358 + dy, 704, 410 + dy, gray(210));
  for (let x = 64; x < 170; x += 14) up.fill(x, 370 + dy, x + 6, 398 + dy, gray(30));
  if (!white) up.fill(51, 420, 693, 561, gray(70));
  up.fill(55, 424, 689, 557, gray(232));
  for (let y = 440; y < 520; y += 30) for (let x = 70; x < 600; x += 16) up.fill(x, y, x + 7, y + 20, gray(30));
  const turned = canvas(1040, 745, gray(14));
  turned.fill(560, 30, 990, 715, white ? gray(236) : ([30, 90, 170] as Color));
  turned.fill(566, 54, 959, 113, gray(12));
  turned.fill(570, 57, 955, 110, gray(205));
  for (let x = 588; x < 700; x += 18) turned.fill(x, 70, x + 9, 96, gray(30));
  turned.fill(578, 121, 945, 334, gray(60));
  turned.fill(566, 342, 949, 400, gray(12));
  turned.fill(570, 345, 945, 397, gray(210));
  if (!white) turned.fill(581, 404, 956, 694, gray(70));
  turned.fill(585, 408, 952, 690, gray(232));
  for (let y = 440; y < 640; y += 30) for (let x = 600; x < 920; x += 16) turned.fill(x, y, x + 7, y + 20, gray(30));
  return { up, turned };
}

describe("aftermathFrame", () => {
  it("reconhece as duas metades e mede as barras", () => {
    const { up, turned } = aftermath();
    const f = aftermathFrame(up.img, turned.img);
    expect(f).not.toBeNull();
    expect(f!.top.name.y0).toBeCloseTo(52, 0);
    expect(f!.top.name.y1).toBeCloseTo(105, 0);
    expect(f!.top.type.center).toBeCloseTo(384, 0);
    expect(f!.bottom.name.center).toBeCloseTo(83.5, 0);
    expect(f!.bottom.type.y0).toBeCloseTo(345, 0);
    expect(aftermathFrame(aftermath({ white: true }).up.img, aftermath({ white: true }).turned.img)).not.toBeNull();
  });

  it("acompanha a barra que sobe nas reimpressões", () => {
    const { up } = aftermath({ dy: -3 });
    expect(barSpan(up.img, "top", "name")?.y0).toBeCloseTo(49, 0);
    expect(barSpan(up.img, "top", "type")?.y1).toBeCloseTo(407, 0);
  });

  it("recusa a carta comum de pé e a metade de baixo sem as barras", () => {
    const { up, turned } = aftermath();
    const plain = canvas(1040, 745, gray(40));
    expect(aftermathFrame(up.img, plain.img)).toBeNull();
    const noType = aftermath();
    noType.up.fill(42, 340, 704, 420, gray(50));
    expect(aftermathFrame(noType.up.img, turned.img)).toBeNull();
    expect(aftermathFrame(turned.img, up.img)).toBeNull();
  });
});

describe("aftermathCostLeft", () => {
  it("conta o custo a partir do fim da barra da metade de baixo", () => {
    expect(aftermathCostLeft("{4}{U}{U}")).toBeCloseTo(AFTERMATH.bottom.name.costRight - 3 * AFTERMATH.costSymbol);
    expect(aftermathCostLeft(null)).toBe(AFTERMATH.bottom.name.costRight);
  });
});

describe("aftermathBox", () => {
  it("mede o papel de cada caixa dentro do fio, e fica no limite na moldura branca", () => {
    const { up, turned } = aftermath();
    const top = aftermathBox(up.img, "top");
    expect(top.x0).toBeGreaterThanOrEqual(55 + 3 - 1);
    expect(top.x0).toBeLessThanOrEqual(55 + 3 + 1);
    expect(top.y1).toBeLessThanOrEqual(557 - 3 + 1);
    const bottom = aftermathBox(turned.img, "bottom");
    expect(bottom.y0).toBeGreaterThanOrEqual(408 + 3 - 1);
    expect(bottom.x1).toBeLessThanOrEqual(952 - 3 + 1);
    const w = aftermath({ white: true });
    const wb = aftermathBox(w.turned.img, "bottom");
    expect(wb.y1).toBeLessThanOrEqual(AFTERMATH.bottom.box.y1);
    expect(wb.x0).toBeGreaterThanOrEqual(AFTERMATH.bottom.box.x0);
  });
});
