import { describe, expect, it } from "vitest";
import { BACK_PT_2003, backPtDigits2003, backPtNotch2003, dfcSymbolLeft2003 } from "../../src/engine/dfc2003";
import { BOX_FOOT_2003, m15Layout } from "../../src/engine/geometry";

/** Imagem falsa da escala-base (745 × 1040), de papel claro, com um pintor de retângulos. */
function canvas(w = 745, h = 1040) {
  const data = new Uint8ClampedArray(w * h * 4).fill(238);
  const img = { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
  };
  return { img, fill };
}

/** Os algarismos cinza do P/R do verso, de `x0` ao fim (677), como os de Innistrad: "3/2" ou "13/13". */
function digits(c: ReturnType<typeof canvas>, x0: number) {
  for (let x = x0; x < 677; x += 13) c.fill(x, 895, Math.min(677, x + 9), 917, 60);
}

describe("backPtDigits2003", () => {
  it("acha os algarismos pelo fim, com a folga", () => {
    const c = canvas();
    digits(c, 633);
    const r = backPtDigits2003(c.img);
    expect(r).not.toBeNull();
    expect(r!.x0).toBe(631);
    expect(r!.x1).toBe(679);
    expect(r!.y0).toBe(BACK_PT_2003.y0);
  });

  it("o fim da última linha em inglês, separado por um vão, fica de fora", () => {
    const c = canvas();
    digits(c, 633);
    // o ponto final de "Secrets." 20 px antes do "3"
    c.fill(605, 900, 613, 916, 30);
    expect(backPtDigits2003(c.img)!.x0).toBe(631);
  });

  it("o 13/13 começa em 611", () => {
    const c = canvas();
    digits(c, 611);
    expect(backPtDigits2003(c.img)!.x0).toBe(609);
  });

  it("sem os algarismos no lugar, nada", () => {
    const c = canvas();
    expect(backPtDigits2003(c.img)).toBeNull();
    // só um traço longe do fim
    c.fill(600, 895, 606, 917, 40);
    expect(backPtDigits2003(c.img)).toBeNull();
  });

  it("vale na imagem de 744 px", () => {
    const c = canvas(744);
    digits(c, 633);
    expect(backPtDigits2003(c.img)).not.toBeNull();
  });
});

describe("backPtNotch2003", () => {
  it("o texto desvia dos algarismos, da ponta ao pé", () => {
    expect(backPtNotch2003({ x0: 72, y0: 660, x1: 668, y1: 918 }, { x0: 631, y0: 891, x1: 679, y1: 920 })).toEqual({
      width: 49,
      height: 29,
    });
  });
});

describe("dfcSymbolLeft2003", () => {
  it("a medida do símbolo fica quando cai onde ele começa", () => {
    expect(dfcSymbolLeft2003(630)).toBe(630);
    expect(dfcSymbolLeft2003(642)).toBe(642);
  });

  it("grudada no fim do tipo em inglês (a promo do Mondronen Shaman), vale a da moldura", () => {
    expect(dfcSymbolLeft2003(565)).toBe(634);
  });
});

describe("o pé da caixa da moldura de 2003", () => {
  it("abaixo do fio de baixo só sai o que se liga às letras; na M15, a medida de sempre", () => {
    expect(m15Layout("{U}", true, 640, { frame2003: true, released: "2008-10-03" }).erase[2].attachedBelow).toBe(BOX_FOOT_2003);
    expect(m15Layout("{U}", true, 640).erase[2].attachedBelow).toBeUndefined();
  });
});

describe("m15Layout na de duas faces de 2003", () => {
  it("o nome começa depois do sol (ou da lua) e o tipo depois do indicador de cor", () => {
    const l = m15Layout("{U}", true, 640, { frame2003: true, leftIcon: true, indicator: true, released: "2011-09-30" });
    expect(l.title.x).toBe(124);
    expect(l.erase[0].rect.x0).toBe(122);
    expect(l.type.x).toBe(108);
    expect(l.erase[1].rect.x0).toBe(100);
  });

  it("sem o indicador, o tipo começa onde começa na de 2003", () => {
    const l = m15Layout("{U}", true, 640, { frame2003: true, leftIcon: true, released: "2011-09-30" });
    expect(l.type.x).toBe(74);
  });
});
