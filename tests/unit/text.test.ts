import { describe, expect, it } from "vitest";
import { buildParagraphs, fitText, layoutAt, lineText, TABLE_ROW, tokenize, toChunks, type Measurer } from "../../src/engine/text";
import { costLeft, countSymbols, frame2003Start, hasLeftIcon, m15Layout } from "../../src/engine/geometry";
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

  it("no flavor, o trecho entre asteriscos sai em pé, sem os asteriscos (Glory, DMR 264)", () => {
    const runs = tokenize("— *Pergaminho dos Primórdios*", true);
    expect(runs.map((r) => [r.value, r.italic])).toEqual([
      ["— ", true],
      ["Pergaminho dos Primórdios", false],
    ]);
    expect(tokenize("Reforço *e* refresco!", true).map((r) => r.italic)).toEqual([true, false, true]);
    // asterisco sozinho fica como está, e nas regras o asterisco não muda nada
    expect(tokenize("Poder *", true)[0].value).toBe("Poder *");
    expect(tokenize("ganha +*/+0 e *x*")[0].value).toBe("ganha +*/+0 e *x*");
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

describe("layoutAt com opções", () => {
  it("a continuação de uma opção começa embaixo do texto, não do marcador (Brecha na Quilha, SDS)", () => {
    // corpo 10: cada caractere mede 5 e o espaço também; "• " mede 10
    const paragraphs = buildParagraphs("Escolha um —\n•Destrua o artefato alvo e o encantamento alvo.", null);
    const res = layoutAt(paragraphs, 10, 150, fake);
    const lines = res.lines.map((l) => ({ text: lineText(l.chunks), indent: l.indent ?? 0 }));
    expect(lines[0]).toEqual({ text: "Escolha um —", indent: 0 });
    expect(lines[1]).toEqual({ text: "• Destrua o artefato alvo e o", indent: 0 });
    expect(lines[2]).toEqual({ text: "encantamento alvo.", indent: 10 });
    // a continuação recua 10 e tem só os 140 que sobram: "o encantamento alvo." (100) cabia
    // nos 150, mas a linha de cima, com 145, já não aceitava mais nada
    expect(lines).toHaveLength(3);
  });

  it("o recuo também conta na largura das continuações", () => {
    // "• " + 26 caracteres (140) cabe nos 150 da primeira; a continuação de 29 caracteres
    // (145) cabe nos 150 sem o recuo, mas não nos 140 com ele
    const res = layoutAt(buildParagraphs("•aaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbb cccccccccccccc", null), 10, 150, fake);
    expect(res.lines.map((l) => lineText(l.chunks))).toEqual(["• aaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbb", "cccccccccccccc"]);
  });

  it("parágrafo sem marcador não recua", () => {
    const res = layoutAt(buildParagraphs("Destrua o artefato alvo e o encantamento alvo.", null), 10, 150, fake);
    expect(res.lines.every((l) => !l.indent)).toBe(true);
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

  it("desvia do canto da esquerda começando a linha mais para dentro (a curva das Invocações)", () => {
    const rules = "palavra ".repeat(40).trim();
    const notch = { width: 24, height: 40, left: true };
    const res = fitText(rules, null, 600, 200, fake, 34, 15, notch);
    expect(res.height).toBeLessThanOrEqual(200);
    // a última linha, no pé da caixa, começa depois do canto e cabe no que sobra
    const last = res.lines[res.lines.length - 1];
    expect(last.indent).toBe(24);
    const width = last.chunks.reduce(
      (w, c, i) => w + (i ? fake.text(" ", res.size, false) : 0) + fake.text(c.map((r) => r.value).join(""), res.size, false),
      0,
    );
    expect(width).toBeLessThanOrEqual(600 - 24);
    // e a primeira, longe do pé, não
    expect(res.lines[0].indent).toBeUndefined();
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
  it("moldura de 2003: o nome e o tipo começam onde começavam na época da impressão", () => {
    // 6 cartas de cada coleção, de Eighth Edition a Magic 2010
    expect(frame2003Start("2003-07-28")).toEqual({ title: 65, type: 67 }); // 8ED
    expect(frame2003Start("2004-06-04")).toEqual({ title: 63, type: 64 }); // 5DN
    expect(frame2003Start("2004-10-01")).toEqual({ title: 63, type: 72 }); // CHK
    expect(frame2003Start("2006-10-06")).toEqual({ title: 63, type: 72 }); // TSP
    expect(frame2003Start("2007-02-02")).toEqual({ title: 67, type: 75 }); // PLC
    expect(frame2003Start(null)).toEqual({ title: 67, type: 75 });
  });
  it("cartas de duas faces: nome depois do ícone, tipo depois da bolinha de cor", () => {
    const front = m15Layout("{1}{R}{G}", true, 640, { leftIcon: true });
    expect(front.title.x).toBe(120);
    expect(front.erase[0].rect.x0).toBeGreaterThan(105);
    const back = m15Layout(null, true, 640, { leftIcon: true, indicator: true });
    expect(back.type.x).toBe(98);
  });
  it("moldura de 2003: caixa mais estreita e curta, barras sem a ponta funda (ADR 0024)", () => {
    const m15 = m15Layout("{2}{R}{R}", false, 640);
    const m03 = m15Layout("{2}{R}{R}", false, 640, { frame2003: true });
    // papel da caixa de x 61 a 679 e fio de baixo em ~936 (Uncontrollable Anger 10E 244)
    expect(m03.box).toEqual({ x0: 72, y0: 660, x1: 668, y1: 926 });
    expect(m15Layout("{1}{G}", true, 640, { frame2003: true }).box.y1).toBe(918); // a caixa de P/R começa em ~927
    // a ponta de 2003 vai até x ≈ 60 no alto e no pé das barras (Divination M10 49)
    expect(m03.erase[0].rect.x0).toBe(60);
    expect(m03.erase[1].rect.x0).toBe(60);
    // as linhas no centro das minúsculas medido nas cartas, onde a Matrix Bold é escrita; o
    // apagamento do nome desce junto, até o pé das letras com perna
    expect(m03.title.centerY).toBe(88);
    expect(m03.type.centerY).toBe(617.5);
    expect(m03.erase[0].rect).toMatchObject({ y0: 64.5, y1: 112.5 });
    expect(m03.erase[1].rect).toEqual({ ...m15.erase[1].rect, x0: 60 });
    // a primeira letra (1 px depois da posição da linha) onde começava na época
    expect([m03.title.x, m03.type.x]).toEqual([66, 74]); // de Planar Chaos em diante
    const mrd = m15Layout("{2}{R}{R}", false, 640, { frame2003: true, released: "2003-10-02" });
    expect([mrd.title.x, mrd.type.x]).toEqual([62, 63]); // Mirrodin: o tipo em x ≈ 64
    expect(mrd.type.maxWidth - m03.type.maxWidth).toBe(11);
    // o resto continua como na M15
    expect(m03.title.size).toBe(m15.title.size);
    expect(m03.erase[0].rect.x1).toBe(m15.erase[0].rect.x1);
    expect(m03.erase[2]).toEqual(m15.erase[2]);
    expect(m15.box).toEqual({ x0: 68, y0: 656, x1: 677, y1: 944 });
    expect(m15.erase[1].rect.x0).toBe(50);
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
  it("verso sem símbolo da coleção: o tipo vai até o fim da barra, como o nome sem custo (Kefka, FIN 231)", () => {
    const back = m15Layout(null, true, 693, { leftIcon: true, indicator: true, noSetSymbol: true });
    expect(back.erase[1].rect.x1).toBe(687);
    expect(back.type.maxWidth).toBe(693 - 10 - back.type.x);
    // (e nunca além do fim do nome sem custo)
    expect(m15Layout(null, true, 711, { noSetSymbol: true }).erase[1].rect.x1).toBe(m15Layout(null, true, 711).erase[0].rect.x1);
    // com símbolo, o limite de sempre: nenhum símbolo começa depois de 660
    expect(m15Layout(null, true, 693, { leftIcon: true }).erase[1].rect.x1).toBe(654);
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
