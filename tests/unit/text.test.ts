import { describe, expect, it } from "vitest";
import { buildParagraphs, fitText, lineText, TABLE_ROW, tokenize, toChunks, type Measurer } from "../../src/engine/text";
import { costLeft, countSymbols, hasLeftIcon, m15Layout } from "../../src/engine/geometry";
import { normalizeName } from "../../src/lib/normalize";

// Medidor falso: cada caractere mede metade do corpo.
const fake: Measurer = { text: (v, size) => v.length * size * 0.5 };

describe("tokenize", () => {
  it('põe o espaço depois do marcador das opções ("•Crie", Kayla\'s Command)', () => {
    expect(tokenize("•Crie uma ficha.")[0].value).toBe("• Crie uma ficha.");
    expect(tokenize("• Crie uma ficha.")[0].value).toBe("• Crie uma ficha.");
  });
  it("troca as aspas retas do Arena pelas curvas (Fake Your Own Death)", () => {
    const text = tokenize('ganha "Quando esta criatura morrer, crie um {T}." e "{2}: compre".')
      .map((r) => (r.kind === "text" ? r.value : `{${r.value}}`))
      .join("");
    expect(text).toBe("ganha “Quando esta criatura morrer, crie um {T}.” e “{2}: compre”.");
  });

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

  it("deixa o travessão solto junto da palavra de antes (nunca começa linha)", () => {
    const chunks = toChunks(tokenize("Quando esta criatura entrar, escolha um —"));
    expect(
      chunks
        .at(-1)
        ?.map((r) => r.value)
        .join(""),
    ).toBe("um —");
    const word = toChunks(tokenize("Aterragem — Toda vez"));
    expect(word.map((c) => c.map((r) => r.value).join(""))).toEqual(["Aterragem —", "Toda", "vez"]);
  });

  it("quebra a linha antes da palavra, não antes do travessão", () => {
    // largura em que "escolha um" cabe, mas "escolha um —" não: os dois descem juntos
    // (corpo 20 no medidor falso: 10 px por caractere; "escolha um" = 100, "escolha um —" = 120)
    const res = fitText("escolha um —", null, 105, 400, fake, 20, 20);
    const lines = res.lines.map((l) => l.chunks.map((c) => c.map((r) => r.value).join("")).join(" "));
    expect(lines.some((l) => l.trim() === "—")).toBe(false);
  });
});

describe("número no fim da habilidade", () => {
  it("vai junto da palavra de antes", () => {
    const chunks = toChunks(tokenize("Quando este terreno entrar, use vidência 1."));
    expect(
      chunks
        .at(-1)
        ?.map((r) => r.value)
        .join(""),
    ).toBe("vidência 1.");
    // número no meio da frase fica solto, como sempre
    const mid = toChunks(tokenize("Compre 2 cards."));
    expect(mid.map((c) => c.map((r) => r.value).join(""))).toEqual(["Compre", "2", "cards."]);
  });

  it("nunca fica numa linha só dele (Templo da Epifania, CLB)", () => {
    // corpo 20 no medidor falso: 10 px por caractere; "use vidência" = 120 cabe em 125,
    // "use vidência 1." = 150 não: "vidência 1." desce junto
    const res = fitText("use vidência 1.", null, 125, 400, fake, 20, 20);
    const lines = res.lines.map((l) => l.chunks.map((c) => c.map((r) => r.value).join("")).join(" "));
    expect(lines).toEqual(["use", "vidência 1."]);
  });
});

describe("buildParagraphs com palavra de habilidade", () => {
  it("põe em itálico a palavra de habilidade das linhas marcadas, sem o travessão", () => {
    const [voar, aterragem] = buildParagraphs("Voar\nAterragem — Toda vez que um terreno entra.", null, [1]);
    expect(voar.chunks.flat().every((r) => !r.italic)).toBe(true);
    const runs = aterragem.chunks.flat();
    expect(runs[0]).toMatchObject({ value: "Aterragem", italic: true });
    expect(runs[1]).toMatchObject({ value: " —", italic: false });
    expect(runs.slice(2).every((r) => !r.italic)).toBe(true);
  });

  it("palavra de várias palavras e linha sem marca", () => {
    const [p] = buildParagraphs("Visões não confiáveis — No início da sua fase.", null, [0]);
    expect(p.chunks.slice(0, 3).map((c) => c[0].italic)).toEqual([true, true, true]);
    const [q] = buildParagraphs("Salvaguarda — Pague 2 pontos de vida.", null, []);
    expect(q.chunks.flat().some((r) => r.italic)).toBe(false);
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
  it("símbolos híbridos e phyrexianos são mais largos: o apagamento do nome para antes deles (Karn, Guardião Dourado)", () => {
    // onde começa a sombra do primeiro símbolo, medido nas imagens do Scryfall
    const medidas: [string, number][] = [
      ["{2/W}{2/U}{2/B}{2/R}{2/G}", 464], // Karn, Gilded Guardian (FRA 272)
      ["{2}{B/G}{B/G}", 565], // Desecrator Hag (CM2 153)
      ["{U/R}{U/R}", 601], // Izzet Guildmage (RVR 191)
      ["{4}{B}{B/P}", 569], // Vraska, Betrayal's Sting (PONE 115p)
    ];
    for (const [custo, borda] of medidas) {
      const fim = m15Layout(custo, false, 640).erase[0].rect.x1;
      expect(fim, custo).toBeLessThan(borda);
      expect(fim, custo).toBeGreaterThan(borda - 12);
    }
  });
  it("cartas de duas faces: nome depois do ícone, tipo depois da bolinha de cor", () => {
    const front = m15Layout("{1}{R}{G}", true, 640, { leftIcon: true });
    expect(front.title.x).toBe(120);
    expect(front.erase[0].rect.x0).toBeGreaterThan(105);
    const back = m15Layout(null, true, 640, { leftIcon: true, indicator: true });
    expect(back.type.x).toBe(98);
  });
  it("Lição: nome depois do ícone, como nas de duas faces (Combustion Technique, TLA)", () => {
    expect(hasLeftIcon("lesson", false, false)).toBe(true);
    expect(hasLeftIcon("legendary,lesson", false, false)).toBe(true);
    expect(hasLeftIcon(null, false, false)).toBe(false);
    expect(hasLeftIcon("legendary", false, false)).toBe(false);
    expect(hasLeftIcon(null, true, false)).toBe(true);
    expect(hasLeftIcon(null, true, true)).toBe(false);
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

describe("linhas da tabela de d20", () => {
  it('reconhece as linhas da tabela, com travessão, hífen ou "+"', () => {
    for (const l of ["1—9 | Vire todas as criaturas.", "10–19 | Crie uma ficha.", "20 | Compre sete cards.", "15+ | Use vidência X."])
      expect(TABLE_ROW.test(l)).toBe(true);
  });
  it("o resto do texto não é linha de tabela", () => {
    for (const l of ["Role um d20.", "{T}: Role um d20.", "2 marcadores | não", "Voar"]) expect(TABLE_ROW.test(l)).toBe(false);
  });
  it("a linha diagramada volta a texto corrido para a mesma conferência (Component Pouch, AFC)", () => {
    const res = fitText("1—9 | Coloque um marcador de componente em Bolsa de Componentes.", null, 300, 400, fake, 20, 20);
    expect(TABLE_ROW.test(lineText(res.lines[0].chunks))).toBe(true);
    expect(TABLE_ROW.test(lineText(res.lines[1].chunks))).toBe(false);
  });
});
