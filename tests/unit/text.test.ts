import { describe, expect, it } from "vitest";
import { buildParagraphs, fitText, tokenize, toChunks, type Measurer } from "../../src/engine/text";
import { costLeft, countSymbols, m15Layout } from "../../src/engine/geometry";
import { normalizeName } from "../../src/lib/normalize";

// Medidor falso: cada caractere mede metade do corpo.
const fake: Measurer = { text: (v, size) => v.length * size * 0.5 };

describe("tokenize", () => {
  it("separa símbolos de mana do texto", () => {
    expect(tokenize("{T}: Adicione {C}{C}.")).toEqual([
      { kind: "symbol", value: "T", italic: false },
      { kind: "text", value: ": Adicione ", italic: false },
      { kind: "symbol", value: "C", italic: false },
      { kind: "symbol", value: "C", italic: false },
      { kind: "text", value: ".", italic: false },
    ]);
  });

  it("coloca o texto de lembrete em itálico", () => {
    const runs = tokenize("Atropelar (Esta criatura pode causar dano excedente.)");
    expect(runs.find((r) => r.value.startsWith("("))?.italic).toBe(true);
    expect(runs[0].italic).toBe(false);
  });

  it("mantém o símbolo grudado na pontuação ao quebrar em pedaços", () => {
    const chunks = toChunks(tokenize("{T}: Adicione {G}."));
    expect(chunks[0].map((r) => r.value)).toEqual(["T", ":"]);
    expect(chunks.at(-1)?.map((r) => r.value)).toEqual(["G", "."]);
  });
});

describe("fitText", () => {
  it("reduz o corpo até o texto caber na caixa", () => {
    const long = "Toda vez que você ganhar pontos de vida, coloque um marcador +1/+1 nesta criatura. ".repeat(4);
    const res = fitText(long, null, 600, 260, fake);
    expect(res.height).toBeLessThanOrEqual(260);
    expect(res.size).toBeLessThan(34);
  });

  it("descarta o flavor quando ele apertaria demais o texto", () => {
    const rules = "Uma regra comprida que ocupa bastante espaço na caixa de texto da carta. ".repeat(3);
    const res = fitText(rules, "Um texto de ambientação também comprido. ".repeat(3), 600, 200, fake);
    expect(res.flavorStart).toBe(-1);
  });

  it("desvia do canto reservado ao lembrete do verso (“4/4”)", () => {
    // texto que enche a caixa: a última linha não pode passar por baixo do canto
    const rules = "palavra ".repeat(60).trim();
    const notch = { width: 120, height: 40 };
    const res = fitText(rules, null, 600, 300, fake, 34, 15, notch);
    const last = res.lines[res.lines.length - 1];
    const width = last.chunks.reduce(
      (w, c, i) => w + (i ? fake.text(" ", res.size, false) : 0) + fake.text(c.map((r) => r.value).join(""), res.size, false),
      0,
    );
    expect(res.height).toBeLessThanOrEqual(300);
    expect(width).toBeLessThanOrEqual(600 - notch.width);
  });

  it("monta um parágrafo por habilidade", () => {
    expect(buildParagraphs("Voar\nVigilância", null)).toHaveLength(2);
  });
});

describe("geometria", () => {
  it("conta os símbolos do custo de mana", () => {
    expect(countSymbols("{2}{W}{W}")).toBe(3);
    expect(countSymbols(null)).toBe(0);
  });
  it("calcula onde começa o custo", () => {
    expect(costLeft("{1}{W}")).toBe(614);
  });
  it("cartas de duas faces: nome depois do ícone, tipo depois da bolinha de cor", () => {
    const front = m15Layout("{1}{R}{G}", true, 640, { leftIcon: true });
    expect(front.title.x).toBe(120);
    expect(front.erase[0].rect.x0).toBeGreaterThan(105);
    const back = m15Layout(null, true, 640, { leftIcon: true, indicator: true });
    expect(back.type.x).toBe(98);
  });
  it("verso com ícone à direita não apaga o ícone", () => {
    const back = m15Layout(null, false, 640, { rightIcon: true });
    expect(back.erase[0].rect.x1).toBeLessThanOrEqual(640);
    expect(back.title.x).toBe(66);
  });
  it("carta modal: a caixa para antes da faixa do outro lado", () => {
    const mdfc = m15Layout("{1}{W}", false, 640, { leftIcon: true, mdfcStrip: true });
    expect(mdfc.box.y1).toBeLessThan(922);
    expect(mdfc.erase[2].rect.y1).toBeLessThan(925);
  });
});

describe("normalizeName", () => {
  it("tira acentos, pontuação e caixa", () => {
    expect(normalizeName("Dízimo Sufocante")).toBe("dizimo sufocante");
    expect(normalizeName("Bolas's Citadel")).toBe("bolas s citadel");
  });
});
