import { describe, expect, it } from "vitest";
import { keepAttachedBelow } from "../../src/engine/erase";
import {
  abilityKinds,
  alignOnIcon,
  countLoyaltyAbilities,
  findLoyaltyIcons,
  isTallPlaneswalker,
  measureBoxBottom,
  measureTallPlaneswalker,
  planeswalkerRows,
  splitAbilities,
  stripLoyaltyCost,
} from "../../src/engine/planeswalker";

/**
 * Planeswalker falso 745×1040: caixa clara, faixas alternando de tom e
 * escudos pretos nos centros pedidos. A moldura à esquerda é preta (como nos
 * planeswalkers pretos) e não pode virar escudo.
 */
function fakePw(icons: number[], bands: number[]): ImageData {
  const width = 745;
  const height = 1040;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const band = bands.filter((b) => b <= y).length % 2;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v = band ? 200 : 216;
      if (x >= 45 && x < 89) v = (x + y) % 3 ? 10 : 60; // moldura preta, escura como o escudo
      if (icons.some((c) => Math.abs(y - c) < 15) && x >= 46 && x < 106) v = 12;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

/** Põe uma linha de tipo clara, com fios escuros em cima (`y0`) e embaixo (`y1`). */
function withTypeBar(img: ImageData, y0: number, y1: number): ImageData {
  for (let y = y0 - 3; y < y1 + 3; y++)
    for (let x = 30; x < 715; x++) {
      const i = (y * img.width + x) * 4;
      const v = y < y0 || y >= y1 ? 20 : 225;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
  return img;
}

describe("planeswalker", () => {
  it("mede na imagem se a moldura é a alta ou a normal (Vivien, Protetora dos Monstros, IKO)", () => {
    // quatro habilidades (duas estáticas num bloco só) na caixa normal: a contagem diz "alta"
    expect(isTallPlaneswalker(4)).toBe(true);
    expect(measureTallPlaneswalker(withTypeBar(fakePw([785, 885], [725]), 590, 646))).toBe(false);
    expect(measureTallPlaneswalker(withTypeBar(fakePw([700, 790, 885], []), 520, 574))).toBe(true);
    // sem linha de tipo visível, quem decide é a contagem
    expect(measureTallPlaneswalker(fakePw([785, 885], [725]))).toBeNull();
  });

  it("o texto curto da última habilidade fica na altura do escudo, não no meio da faixa (Liliana, −7)", () => {
    // faixa de 852 a 941 (vai até o pé da caixa), escudo em 872, uma linha de 22 px
    const text = { x0: 138, y0: 852, x1: 680, y1: 941 };
    expect(alignOnIcon(text, 22, 872, true)).toMatchObject({ y0: 861, y1: 883 });
    // texto alto: não sai da faixa
    expect(alignOnIcon(text, 80, 872, true)).toMatchObject({ y0: 852, y1: 932 });
    // com o canto da lealdade inicial, só sobe (as linhas desviam dele com o texto no meio)
    expect(alignOnIcon(text, 22, 920, true)).toMatchObject({ y0: 885.5, y1: 907.5 });
    // sem o canto, desce até o escudo
    expect(alignOnIcon({ ...text, y1: 900 }, 22, 885, false)).toMatchObject({ y0: 874, y1: 896 });
    // estática: no meio da faixa, como antes
    expect(alignOnIcon(text, 22, undefined, true)).toBe(text);
  });

  it("apaga até o fio da caixa só o pé das letras de cima (Grão-mestre das Flores, AFR)", () => {
    // caixa clara com o fio escuro de baixo em 952; a vírgula da última linha desce até 948
    const img = fakePw([885], []);
    for (let y = 952; y < 956; y++) for (let x = 90; x < 690; x++) img.data.fill(20, (y * 745 + x) * 4, (y * 745 + x) * 4 + 3);
    expect(measureBoxBottom(img)).toBe(952);
    expect(measureBoxBottom(fakePw([885], []))).toBeNull();
    // máscara da última faixa (de 900 a 950): a vírgula, presa à letra de cima, e um pedaço
    // de moldura solto, só embaixo da medida padrão (944)
    const rect = { x0: 100, y0: 900, x1: 300, y1: 950 };
    const mask = new Uint8Array(200 * 50);
    const on = (x: number, y: number) => (mask[(y - 900) * 200 + x - 100] = 1);
    for (let y = 930; y < 949; y++) on(150, y);
    for (let y = 946; y < 950; y++) for (let x = 100; x < 104; x++) on(x, y);
    const m = { rect, mask, polarity: "dark" as const };
    keepAttachedBelow(m, 944);
    expect(mask[(948 - 900) * 200 + 50]).toBe(1);
    expect(mask[(947 - 900) * 200 + 1]).toBe(0);
    expect(mask[(940 - 900) * 200 + 50]).toBe(1);
  });

  it("acha os escudos de lealdade e ignora a moldura texturizada", () => {
    const icons = findLoyaltyIcons(fakePw([700, 790, 885], []), 656, 944);
    expect(icons).toHaveLength(3);
    [700, 790, 885].forEach((c, i) => expect(Math.abs(icons[i] - c)).toBeLessThanOrEqual(2));
  });

  it("divisa entre faixas fora das linhas do texto em inglês (Nissa dos Ramos Umbrosos, ZNR)", () => {
    // faixas do mesmo tom: só as linhas de texto mudam a mediana (o contorno das letras)
    const img = fakePw([790, 882], []);
    const lines = [670, 694, 718, 778, 802, 850, 874, 898];
    for (const top of lines)
      for (let y = top; y < top + 14; y++)
        for (let x = 104; x < 680; x++) {
          const i = (y * img.width + x) * 4;
          const v = x % 7 < 3 ? 20 : 190; // traço da letra e contorno suavizado
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        }
    const rows = planeswalkerRows(img, 3, 2, false, { above: 1, below: 0 });
    expect(rows).not.toBeNull();
    // a estática termina no vão entre "718" e "778"; o +1, no vão entre "816" e "850"
    expect(rows![0].y1).toBeGreaterThan(735);
    expect(rows![0].y1).toBeLessThan(775);
    expect(rows![1].y1).toBeGreaterThan(820);
    expect(rows![1].y1).toBeLessThan(848);
  });

  it("divide a caixa nas divisas de tom, com a estática em cima", () => {
    const rows = planeswalkerRows(fakePw([790, 885], [745, 835]), 3);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.loyalty)).toEqual([false, true, true]);
    expect(rows![0].y1).toBeGreaterThan(735);
    expect(rows![0].y1).toBeLessThan(755);
    expect(rows![1].y1).toBeGreaterThan(825);
    expect(rows![1].y1).toBeLessThan(845);
  });

  it("estáticas do mesmo lado formam um bloco só, com a altura toda (A Imperatriz Errante, NEO)", () => {
    const rows = planeswalkerRows(fakePw([747, 816, 889], [705, 780, 855]), 5);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.paragraphs)).toEqual([2, 1, 1, 1]);
    expect(rows![0].y0).toBe(586);
    expect(rows![0].y1).toBeGreaterThan(695);
  });

  it("sem espaço para outra faixa, a estática entra no bloco que já existe (Jace, Mago dos Espelhos)", () => {
    const img = fakePw([793, 887], [763, 840]);
    const rows = planeswalkerRows(img, 4, undefined, false);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => [r.loyalty, r.paragraphs])).toEqual([
      [false, 2],
      [true, 1],
      [true, 1],
    ]);
  });

  it("com os custos no texto, cada estática vai para o lado dela (Jeska, CMR)", () => {
    // estática, 0, −X, "pode ser seu comandante", "Parceiro": uma em cima, duas embaixo
    const text = "Jeska entra com marcadores.\n0: Escolha uma criatura.\n−X: Causa X de dano.\nJeska pode ser seu comandante.\nParceiro";
    const kinds = abilityKinds(text);
    expect(kinds).toEqual([false, true, true, false, false]);
    const rows = planeswalkerRows(fakePw([716, 806], [690, 760, 840]), 5, 2, true, { above: 1, below: 2 });
    expect(rows!.map((r) => [r.loyalty, r.paragraphs])).toEqual([
      [false, 1],
      [true, 1],
      [true, 1],
      [false, 2],
    ]);
  });

  it("desiste quando há mais escudos que habilidades", () => {
    expect(planeswalkerRows(fakePw([700, 790, 885], []), 2)).toBeNull();
  });

  it("4 habilidades usam a caixa alta", () => {
    expect(isTallPlaneswalker(4)).toBe(true);
    expect(isTallPlaneswalker(3)).toBe(false);
  });

  it("tira o custo de lealdade do começo da habilidade", () => {
    expect(stripLoyaltyCost("+1: Compre um card.")).toBe("Compre um card.");
    expect(stripLoyaltyCost("−3: Destrua.")).toBe("Destrua.");
    expect(stripLoyaltyCost("[-X]: Algo.")).toBe("Algo.");
    expect(stripLoyaltyCost("Voar")).toBe("Voar");
  });

  it("separa habilidades do texto impresso que veio sem quebras de linha", () => {
    expect(splitAbilities('+1: Desvire.−2: Revele.−8: Você recebe um emblema com "Algo." Depois, crie.')).toEqual([
      "Desvire.",
      "Revele.",
      'Você recebe um emblema com "Algo." Depois, crie.',
    ]);
  });
});

describe("countLoyaltyAbilities", () => {
  it("conta só as habilidades com custo de lealdade", () => {
    const kaito =
      "Toda vez que uma ou mais criaturas que você controla causam dano…\n+1: Até uma criatura alvo não pode atacar.\n0: Compre um card.\n−2: Crie uma ficha.";
    expect(countLoyaltyAbilities(kaito)).toBe(3);
  });
  it("acha os custos mesmo sem quebra de linha (texto impresso)", () => {
    expect(countLoyaltyAbilities("+1: Compre um card.−2: Revele.−7: Você recebe um emblema.")).toBe(3);
  });
});
