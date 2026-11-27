import { describe, expect, it } from "vitest";
import { BATTLE, battleBox, battleCostLeft, battleFrame, battleNotch, battleShield } from "../../src/engine/battle";

// a carta deitada (ver battle.ts)
const W = 1040;
const H = 745;

type Color = [number, number, number];
const gray = (v: number): Color => [v, v, v];

function canvas(bg: Color, w = W, h = H) {
  const data = new Uint8ClampedArray(w * h * 4);
  const img = { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
        const i = (y * w + x) * 4;
        data.set(c, i);
        data[i + 3] = 255;
      }
  };
  fill(0, 0, w, h, bg);
  return { img, fill };
}

/**
 * Batalha falsa nas medidas de MOM 194 (Invasion of Zendikar) deitada: a barra do nome e a de tipo
 * claras, com o fio escuro abaixo de cada uma, a caixa de papel com o fio da moldura em volta, o
 * P/R do verso na ponta da caixa e o escudo da defesa (uma estrela preta, com o número branco no
 * meio e o aro claro em volta) no canto de baixo. Com `white`, a moldura tem a cor do papel.
 */
function battle({ white = false, shield = true } = {}) {
  const c = canvas(gray(14));
  const frame = white ? gray(236) : ([24, 110, 70] as Color);
  c.fill(100, 25, 1015, 725, frame);
  c.fill(186, 37, 972, 89, gray(205));
  c.fill(110, 89, 985, 96, gray(30));
  c.fill(110, 96, 985, 430, gray(90));
  c.fill(120, 434, 975, 485, gray(205));
  c.fill(110, 486, 985, 497, gray(30));
  // na moldura branca o bisel cinza fica no alto e à direita da caixa; no lado esquerdo, nada
  if (white) {
    c.fill(118, 497, 975, 501, gray(180));
    c.fill(966, 497, 969, 712, gray(180));
    c.fill(118, 711, 975, 714, gray(180));
  }
  c.fill(126, 501, 966, 711, gray(232));
  // a ponta do P/R do verso, com o "4/4"
  c.fill(966, 596, 990, 638, gray(232));
  c.fill(921, 607, 962, 630, gray(80));
  // texto
  for (let y = 512; y < 690; y += 32) for (let x = 140; x < 900; x += 16) c.fill(x, y, x + 6, y + 18, gray(30));
  for (let x = 196; x < 500; x += 18) c.fill(x, 50, x + 8, 77, gray(30));
  if (shield) {
    // o aro claro e a estrela preta (um losango largo), com o número branco no meio
    c.fill(940, 649, 1015, 727, gray(225));
    c.fill(946, 655, 1009, 721, gray(20));
    c.fill(966, 672, 989, 705, gray(240));
  }
  return c;
}

describe("battleFrame", () => {
  it("reconhece a moldura da batalha deitada, de moldura colorida e branca", () => {
    expect(battleFrame(battle().img)).toBe(true);
    expect(battleFrame(battle({ white: true }).img)).toBe(true);
  });

  it("recusa a carta de pé, a caixa escura e a carta sem o escudo da defesa", () => {
    const standing = { width: 745, height: 1040, data: new Uint8ClampedArray(745 * 1040 * 4), colorSpace: "srgb" } as ImageData;
    expect(battleFrame(standing)).toBe(false);
    const dark = battle();
    dark.fill(126, 501, 966, 711, gray(70));
    expect(battleFrame(dark.img)).toBe(false);
    expect(battleFrame(battle({ shield: false }).img)).toBe(false);
  });

  it("recusa a barra de tipo sem o fio escuro embaixo (outra moldura)", () => {
    const c = battle();
    c.fill(110, 485, 985, 501, gray(205));
    expect(battleFrame(c.img)).toBe(false);
  });
});

describe("battleBox", () => {
  it("acha o papel dentro do fio da moldura, 3 px para dentro", () => {
    expect(battleBox(battle().img)).toEqual({ x0: 129, y0: 504, x1: 962, y1: 707 });
  });

  it("na moldura branca, o bisel cinza para a medida no alto e à direita; à esquerda ela vai ao limite", () => {
    const box = battleBox(battle({ white: true }).img);
    expect(box.x0).toBe(BATTLE.box.x0 + 3);
    expect(box.y0).toBe(504);
    expect(box.x1).toBe(962);
  });
});

describe("battleShield", () => {
  it("protege a estrela com o aro, linha a linha, até o fim da carta", () => {
    const rows = battleShield(battle().img);
    expect(rows).not.toBeNull();
    const at = (y: number) => rows?.find((r) => r.y0 === y);
    // a 6 px da estrela (o aro e o contorno), nas linhas do meio
    expect(at(688)?.x0).toBe(940);
    expect(at(688)?.x1).toBe(W);
    // acima da estrela, só o aro de cima, em disco
    expect(at(649)?.x0).toBe(946);
    expect(at(640)).toBeUndefined();
  });

  it("a vírgula a 4 px do aro fica de fora (Invasion of Eldraine, MOM 113)", () => {
    const c = battle();
    c.fill(928, 655, 935, 668, gray(30));
    const rows = battleShield(c.img) ?? [];
    expect(rows.every((r) => r.y0 < 655 || r.y0 >= 668 || r.x0 > 935)).toBe(true);
  });

  it("sem o preto da estrela, ou com o preto vazando para a borda, devolve null", () => {
    expect(battleShield(battle({ shield: false }).img)).toBeNull();
    const c = battle();
    c.fill(946, 655, W, H, gray(20));
    expect(battleShield(c.img)).toBeNull();
  });
});

describe("battleCostLeft e battleNotch", () => {
  it("o custo acaba em x 968, com ~38 px por símbolo e mais nos híbridos", () => {
    expect(battleCostLeft("{3}{G}")).toBe(892);
    expect(battleCostLeft("{W}{U}{B}{R}{G}")).toBe(778);
    expect(battleCostLeft("{2/W}")).toBe(923);
    expect(battleCostLeft(null)).toBe(968);
  });

  it("o canto reservado vai da ponta do P/R do verso ao pé; sem P/R, só o escudo", () => {
    const t = BATTLE.text;
    expect(battleNotch(t, true)).toEqual({ width: 40, height: 110 });
    expect(battleNotch(t, false)).toEqual({ width: 18, height: 60 });
  });
});

describe("escala da prévia", () => {
  it("a moldura e o escudo valem na imagem reduzida", () => {
    const big = battle().img;
    const w = Math.round(W * 0.9);
    const h = Math.round(H * 0.9);
    const small = canvas(gray(0), w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const j = (Math.min(H - 1, Math.round(y / 0.9)) * W + Math.min(W - 1, Math.round(x / 0.9))) * 4;
        small.img.data.set(big.data.subarray(j, j + 4), i);
      }
    expect(battleFrame(small.img)).toBe(true);
    expect(battleShield(small.img)).not.toBeNull();
  });
});
