import { describe, expect, it } from "vitest";
import {
  barCapGuard,
  centralSpan,
  coloredInk,
  darkTextBox,
  dividerRows,
  eraseBackPtNotch,
  eraseRegions,
  findSetSymbolLeft,
  hasLessonIcon,
  inpaint,
  insideBoxSides,
  liftShadedBands,
  maskRegions,
  notM15Frame,
  ptBoxLeft,
  ptBoxTop,
  textBandCenter,
  textMask,
  textPolarity,
  smoothNoisyPaper,
  symbolRowsFrom,
  symbolRowsLeft,
  typeBarEdges,
  typeBarTop,
} from "../../src/engine/erase";
import { ptProtect } from "../../src/engine/geometry";
import { findBoxHighlight, findStamp, findTokenBoxBottom, measureCentered, stampShape } from "../../src/engine/token";

/** Imagem falsa 745×1040 de uma cor só, com um pintor de retângulos. */
function canvas(bg: [number, number, number] = [210, 210, 210], width = 745) {
  const height = 1040;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
    data[i + 3] = 255;
  }
  const img = { width, height, data, colorSpace: "srgb" } as ImageData;
  type Paint = [number, number, number] | ((x: number, y: number, c: number) => number);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Paint) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const v = typeof c === "function" ? [c(x, y, 0), c(x, y, 1), c(x, y, 2)] : c;
        data[i] = v[0];
        data[i + 1] = v[1];
        data[i + 2] = v[2];
      }
  };
  return { img, fill };
}

/** Grão colorido fixo, de −20 a 20 por canal (o mesmo a cada execução). */
const noise = (x: number, y: number, c: number) => {
  const v = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + c * 37.719) * 43758.5453);
  return Math.round((v - Math.floor(v)) * 40 - 20);
};

describe("textPolarity em caixa de duas cores", () => {
  it("creme à esquerda e cinza à direita, letras pretas: texto escuro (Orzhov Basilica DMC)", () => {
    const { img, fill } = canvas();
    fill(0, 0, 370, 200, [235, 228, 190]);
    fill(370, 0, 745, 200, [150, 150, 150]);
    for (let x = 20; x < 720; x += 14) fill(x, 80, x + 4, 120, [20, 20, 20]);
    expect(textPolarity(img, { x0: 0, y0: 50, x1: 745, y1: 150 })).toBe("dark");
  });
});

describe("textMask em caixa translúcida metade sobre a arte", () => {
  /** Caixa lisa à esquerda e, à direita, arte escura com grão e pintas (ficha Espírito, EVE). */
  function halfArt() {
    const c = canvas([20, 20, 20]);
    c.fill(60, 760, 680, 920, (x, y, ch) => {
      // da esquerda lisa para a arte, num degradê de 100 px
      const art = Math.min(1, Math.max(0, (x - 330) / 100));
      // pintas escuras de 3 px, soltas, como as bolhas e manchas da arte
      const spot = x % 6 < 3 && y % 6 < 3 && noise(Math.floor(x / 6), Math.floor(y / 6), 9) < -12;
      // (medido no Espírito de EVE: a pinta mais escura da arte foge do fundo uns 50, a
      // letra, 160 ou mais)
      const v = spot ? 80 + noise(x, y, ch) / 2 : 110 + noise(x, y, ch);
      return Math.round((1 - art) * (215 + noise(x, y, ch) / 4) + art * v);
    });
    // "Flying": hastes pretas que atravessam a divisa
    for (let x = 250; x < 470; x += 12) c.fill(x, 830, x + 5, 856, [15, 15, 15]);
    return c.img;
  }

  it("a textura da arte não vira texto, as letras sim", () => {
    const img = halfArt();
    const rect = { x0: 60, y0: 760, x1: 680, y1: 920 };
    const m = textMask(img, rect, 14, [], 34, "dark");
    const at = (x: number, y: number) => m[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];
    for (let x = 252; x < 470; x += 12) expect(at(x, 843)).toBe(1);
    let art = 0;
    let total = 0;
    for (const [y0, y1] of [
      [770, 815],
      [870, 912],
    ])
      for (let y = y0; y < y1; y++)
        for (let x = 450; x < 670; x++) {
          total++;
          art += at(x, y);
        }
    // antes, com um limiar só para a caixa inteira, a metade da arte saía quase toda
    expect(art / total).toBeLessThan(0.02);
  });
});

describe("textPolarity com letras grandes", () => {
  it("nome branco e largo na barra verde-escura: texto claro (ficha Rhino C19)", () => {
    const { img, fill } = canvas([35, 60, 45]);
    // "RHINO": letras de 9 px de traço com 4 de folga, que tomam as fatias do meio
    for (let x = 314; x < 434; x += 13) fill(x, 66, x + 9, 96, [250, 250, 250]);
    expect(textPolarity(img, { x0: 60, y0: 57, x1: 685, y1: 104 })).toBe("light");
  });
});

describe("insideBoxSides", () => {
  /** Caixa de papel de 70 a 675 × 650 a 952, cercada de moldura escura. */
  function box(paper: (x: number, y: number, c: number) => number) {
    const c = canvas([30, 60, 40]);
    c.fill(70, 650, 675, 952, paper);
    return c;
  }

  it("acha os quatro fios da caixa mesmo com a medida fixa passando deles", () => {
    const { img } = box(() => 210);
    const r = insideBoxSides(img, { x0: 58, y0: 640, x1: 688, y1: 954 }, 30, true);
    expect(r.x0).toBeGreaterThanOrEqual(70);
    expect(r.x0).toBeLessThan(76);
    expect(r.x1).toBeLessThanOrEqual(675);
    expect(r.x1).toBeGreaterThan(668);
    expect(r.y0).toBeGreaterThanOrEqual(650);
    expect(r.y1).toBeLessThanOrEqual(952);
    expect(r.y1).toBeGreaterThan(945);
  });

  it("papel granulado com letras grandes no fim: não para no meio da última linha (Lignify GVL)", () => {
    const { img, fill } = box((x, y, c) => 205 + noise(x, y, c));
    // última linha de texto, grossa, cobrindo quase toda a esquerda
    // (cada letra começa e acaba numa altura, como as de verdade)
    for (let k = 0, x = 72; x < 670; k++, x += 6) fill(x, 918 + ((k * 3) % 9), x + 4, 934 + ((k * 5) % 9), [25, 25, 25]);
    const r = insideBoxSides(img, { x0: 58, y0: 640, x1: 688, y1: 954 }, 30, true);
    expect(r.y1).toBeGreaterThan(945);
  });

  it("assinatura do flavor comprida perto do pé não é o fio (Corpse Hauler JMP)", () => {
    // caixa que desce até 962 e, logo acima da medida padrão, a assinatura em itálico
    // cobrindo o terço da esquerda inteiro. Na linha do pé dela (938) quase toda coluna
    // clareia em relação a seis linhas acima, como num fio; mas ali há preto, cinza e
    // papel misturados, e na linha de um fio há um tom só
    const c = canvas([30, 60, 40]);
    c.fill(70, 650, 675, 962, (x, y, ch) => 222 + Math.round(noise(x, y, ch) / 4));
    const rows: [number, number[]][] = [
      [920, [30, 222, 222, 222, 222]],
      [932, [30, 30, 125, 60, 60]],
      [934, [30, 222, 222, 222, 222]],
      [938, [125, 60, 222, 222, 100]],
      [939, [222, 30, 60, 222, 125]],
    ];
    for (let k = 0; k < rows.length; k++) {
      const [y, tones] = rows[k];
      const end = k + 1 < rows.length ? rows[k + 1][0] : 940;
      c.fill(72, y, 310, end, (x) => tones[(x - 72) % 5]);
    }
    const r = insideBoxSides(c.img, { x0: 58, y0: 640, x1: 688, y1: 954 }, 30, true);
    expect(r.y1).toBeGreaterThan(950);
  });

  it("pé do flavor em papel com grão em faixas não é o fio (Holdout Settlement OGW)", () => {
    // caixa que desce até 962. Na linha 937 o papel é um pouco mais claro que seis
    // linhas acima (o grão de OGW vem em faixas) e um quarto dela é o pé das letras
    // pretas do flavor: quase toda coluna muda, três quartos clareiam e a linha tem um
    // tom dominante, como um fio. Mas, na média, a linha quase não muda de tom; num
    // fio de verdade ela muda inteira
    const c = canvas([30, 60, 40]);
    c.fill(70, 650, 675, 962, [200, 200, 200]);
    c.fill(72, 937, 310, 938, (x) => (x % 4 === 3 ? 120 : 230));
    const r = insideBoxSides(c.img, { x0: 58, y0: 640, x1: 688, y1: 954 }, 30, true);
    expect(r.y1).toBeGreaterThan(950);
  });

  it("começo das linhas de texto claro com sombra não é o fio da esquerda (Thunderbreak Regent, promo de DTK)", () => {
    // caixa translúcida escura de 58 a 686, com fio claro em 54–58. As linhas de texto
    // branco começam todas em x = 83, e cada letra tem a sombra preta logo abaixo: a
    // coluna 83 muda contra a vizinha em quase toda linha (clareia no alto da letra,
    // escurece na sombra), mas para os dois lados; o fio muda sempre para o mesmo
    const c = canvas([20, 20, 20]);
    c.fill(54, 640, 58, 962, [200, 90, 70]);
    c.fill(58, 640, 690, 962, (x, y) => 75 + ((x * 3 + y * 7) % 11));
    for (let y = 646; y < 954; y += 34) {
      c.fill(83, y, 86, y + 13, [240, 240, 240]);
      c.fill(83, y + 13, 86, y + 26, [5, 5, 5]);
    }
    const r = insideBoxSides(c.img, { x0: 58, y0: 646, x1: 688, y1: 954 }, 30, true);
    expect(r.x0).toBeLessThanOrEqual(62);
  });

  it("papel logo abaixo da última linha de letras grandes não é o fio (emblema do Daretti C16)", () => {
    // ficha com a caixa até 966 e o texto descendo até 948. Seis linhas abaixo da
    // linha das serifas (938 a 941, tinta de vários tons em quase toda coluna) o papel
    // clareia em quase toda coluna, do mesmo lado e de uma vez, e a linha é lisa: tudo
    // como um fio. Mas o degrau é contra letras, não contra papel
    const c = canvas([20, 20, 20]);
    c.fill(56, 650, 690, 966, [228, 228, 228]);
    c.fill(56, 961, 690, 964, [207, 207, 207]);
    const ink = [30, 50, 70, 90, 110, 130, 150, 40, 60, 80, 100, 120];
    c.fill(58, 918, 670, 938, (x) => (x % 14 < 3 ? 40 : x % 14 === 3 ? 120 : 228));
    c.fill(58, 938, 670, 942, (x) => ink[x % 14] ?? 228);
    // rabo do g e do p
    c.fill(58, 942, 670, 949, (x) => (x % 56 < 3 ? 40 : 228));
    const r = insideBoxSides(c.img, { x0: 56, y0: 773, x1: 683, y1: 960 }, 30);
    expect(r.y1).toBeGreaterThanOrEqual(949);
  });
});

describe("findBoxHighlight", () => {
  /** Caixa de ficha até 966, borda preta abaixo, e a última linha de texto em 918–948. */
  function tokenBox() {
    const c = canvas([20, 20, 20]);
    c.fill(56, 650, 690, 966, [228, 228, 228]);
    // letras grossas: um terço da linha é tinta, e em 938–940 as serifas tomam mais
    c.fill(72, 918, 670, 938, (x) => (x % 14 < 5 ? 40 : 228));
    c.fill(72, 938, 670, 941, (x) => (x % 14 < 9 ? 50 : 228));
    return c;
  }

  it("texto descendo até a referência do papel não vira brilho (emblema do Daretti C16)", () => {
    // a média das linhas com letras escurece o "papel" e o papel comum de baixo parecia brilho
    expect(findBoxHighlight(tokenBox().img, 966)).toBeNull();
  });

  it("acha o brilho de verdade no pé da caixa, mesmo com texto perto", () => {
    const c = tokenBox();
    c.fill(56, 957, 690, 966, [255, 255, 250]);
    expect(findBoxHighlight(c.img, 966)).toBe(957);
  });
});

describe("findTokenBoxBottom com o fio do flavor", () => {
  /** Caixa de ficha de 761 a 960: bisel claro de 955 a 959 e borda escura de 960 em diante. */
  function token(paper: [number, number, number]) {
    const c = canvas(paper);
    c.fill(0, 955, 745, 960, [238, 238, 238]);
    c.fill(0, 960, 745, 1040, [15, 15, 15]);
    return c;
  }
  const bar = { y0: 702, y1: 761 };

  it("o fio fino entre as regras e o flavor não é o pé da caixa (Boo, AFR)", () => {
    const { img, fill } = token([202, 202, 202]);
    fill(60, 865, 690, 868, [150, 150, 150]);
    expect(findTokenBoxBottom(img, bar)).toBe(960);
  });
  it("nem o papel logo abaixo de um filete claro depois do fio (SLD 1681)", () => {
    const { img, fill } = token([155, 155, 155]);
    fill(60, 863, 690, 866, [125, 125, 125]);
    fill(60, 866, 690, 868, [205, 205, 205]);
    expect(findTokenBoxBottom(img, bar)).toBe(960);
  });
  it("sem fio no meio, o pé de sempre", () => {
    const { img } = token([202, 202, 202]);
    expect(findTokenBoxBottom(img, bar)).toBe(960);
  });
});

describe("typeBarTop", () => {
  it("acha a barra na moldura padrão", () => {
    const { img, fill } = canvas();
    fill(0, 589, 745, 592, [20, 20, 20]);
    fill(0, 642, 745, 645, [20, 20, 20]);
    expect(typeBarTop(img)).toBe(589);
  });
  it("acha a barra mais baixa da arte estendida (VOW)", () => {
    const { img, fill } = canvas();
    fill(0, 633, 745, 636, [20, 20, 20]);
    fill(0, 686, 745, 689, [20, 20, 20]);
    expect(typeBarTop(img)).toBe(633);
  });
  it("sem o fio de baixo, não é barra", () => {
    const { img, fill } = canvas();
    fill(0, 600, 745, 603, [20, 20, 20]);
    expect(typeBarTop(img)).toBeNull();
  });
});

describe("typeBarEdges", () => {
  it("devolve também o fio de baixo, mais fundo nas molduras escuras de BRO", () => {
    const { img, fill } = canvas();
    fill(0, 591, 745, 594, [20, 20, 20]);
    fill(0, 649, 745, 652, [20, 20, 20]);
    expect(typeBarEdges(img)).toEqual({ top: 591, bottom: 649 });
  });
});

describe("textBandCenter", () => {
  it("acha o centro das letras numa faixa", () => {
    const { img, fill } = canvas();
    for (let x = 80; x < 400; x += 9) fill(x, 615, x + 5, 632, [20, 20, 20]);
    expect(textBandCenter(img, { x0: 70, y0: 597, x1: 420, y1: 645 })).toBeCloseTo(623, 0);
  });
});

describe("findSetSymbolLeft com símbolo colorido", () => {
  it("o selo laranja do Core Set 2021 colado no fio do fim da barra fica inteiro", () => {
    const { img, fill } = canvas([200, 200, 195]);
    // fim do tipo em inglês, o selo (contorno preto e miolo laranja) e o fio da barra
    fill(560, 600, 576, 626, [20, 20, 20]);
    fill(598, 596, 692, 630, [20, 20, 20]);
    fill(601, 599, 689, 627, [230, 140, 40]);
    fill(692, 594, 711, 634, [30, 30, 30]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(598);
  });
  it("símbolo colorido encostado no texto, sem lacuna nenhuma: a cor diz onde ele começa", () => {
    const { img, fill } = canvas([200, 200, 195]);
    // letras de 6 px com 2 de folga, a última encostada no contorno do símbolo
    for (let x = 542; x < 598; x += 8) fill(x, 600, Math.min(598, x + 6), 626, [20, 20, 20]);
    fill(596, 600, 598, 626, [20, 20, 20]);
    fill(598, 596, 692, 630, [20, 20, 20]);
    fill(601, 599, 689, 627, [230, 140, 40]);
    fill(692, 594, 711, 634, [30, 30, 30]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(598);
  });
});

describe("findSetSymbolLeft com o fio do fim da barra longe do fim da busca", () => {
  it("o símbolo de M3C fica inteiro numa digitalização de 744 px (Brushland)", () => {
    // barra cinza; o símbolo vai de 641 a 680 e o contorno da ponta da barra, de 694 a
    // 699, acaba 12 px antes do fim da busca (711). Com 744 px de largura, 12 px na
    // escala de 745 viravam 11,98 e o contorno passava por "símbolo": o símbolo de
    // verdade era cortado pelo apagamento do tipo
    const { img, fill } = canvas([200, 198, 196], 744);
    fill(80, 600, 150, 626, [20, 20, 20]);
    fill(641, 596, 681, 630, [30, 25, 20]);
    fill(648, 600, 674, 626, [190, 150, 80]);
    fill(694, 594, 700, 632, [40, 40, 40]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(641);
  });
});

describe("findSetSymbolLeft com o símbolo colado no fim da busca", () => {
  it('o "M" da Marvel cheio, a 3 px do começo da ponta da barra, não passa por fio: o fim do tipo em inglês sai (ficha Doombot, MSH)', () => {
    // barra azul-clara de ficha; "…Villain" até 633, lacuna de 20 px e o "M" (quadro
    // branco com a letra preta, 654 a 677), que acaba a 3 px do fim da busca (680, o
    // começo da curva da ponta). Com 24 px, o "M" passava por "fio" da borda da barra,
    // e o "Villain" inteiro, pelo símbolo: ficava em inglês ao lado do português
    const { img, fill } = canvas([165, 178, 186]);
    for (let x = 540; x < 634; x += 9) fill(x, 868, x + 6, 890, [25, 25, 30]);
    fill(654, 864, 678, 894, [245, 245, 245]);
    fill(658, 868, 674, 890, [20, 20, 20]);
    expect(findSetSymbolLeft(img, 863, 894, 680)).toBe(654);
  });
});

describe("findSetSymbolLeft com o símbolo perto do contorno da barra", () => {
  it('o "M" da Marvel a 11 px do contorno vermelho não é segunda camada dele: o "ro" de "Hero" sai (Mercúrio, MSH)', () => {
    // barra preta de carta; o tipo em letras brancas vai até 588, passando do começo da
    // busca (559); o quadro dourado do "M" (655 a 677) e o contorno vermelho grosso do fim
    // da barra (687 a 711). O "M" passava por segunda camada do contorno, e o fim do tipo
    // em inglês, por símbolo
    const { img, fill } = canvas([20, 20, 20]);
    for (let x = 400; x < 589; x += 10) fill(x, 600, x + 4, 626, [245, 245, 245]);
    fill(655, 598, 677, 628, [200, 180, 100]);
    fill(659, 602, 673, 624, [30, 30, 30]);
    fill(687, 594, 712, 632, [200, 60, 40]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(655);
  });
});

describe("findSetSymbolLeft com o símbolo colado no fim do tipo, sem cor", () => {
  it('um trecho de 30 px de tinta sem vão é o símbolo: o "tive" de "Detective" sai (Lazav, MKM 216)', () => {
    // barra dourada; as letras escuras vão até 630, com vãos de 2 a 5 px entre elas; a adaga
    // (contorno escuro e miolo dourado-claro, da cor da barra) começa a 2 px, em 632, e é um
    // trecho só de 51 px; o fio do fim da barra, de 694 a 709. O corte pelas lacunas caía
    // entre as letras
    const { img, fill } = canvas([200, 170, 100]);
    const letters: [number, number][] = [
      [558, 570],
      [573, 584],
      [588, 593],
      [597, 601],
      [606, 616],
      [618, 630],
    ];
    for (const [a, b] of letters) fill(a, 603, b + 1, 627, [30, 25, 15]);
    fill(632, 596, 683, 630, [30, 25, 15]);
    fill(640, 604, 676, 622, [230, 200, 120]);
    fill(694, 594, 710, 632, [40, 35, 30]);
    const info: { colored: number; lim: number; tight?: boolean } = { colored: -1, lim: 0 };
    expect(findSetSymbolLeft(img, 594, 632, undefined, 100, info)).toBe(632);
    expect(info.tight).toBe(true);
  });
});

describe("symbolRowsFrom", () => {
  it("cobre, linha a linha, do contorno do símbolo ao fim, e deixa a barra antes dele", () => {
    // adaga na diagonal: o contorno começa em 632 na primeira linha e anda 1 px por linha
    const { img, fill } = canvas([200, 170, 100]);
    for (let y = 600; y < 610; y++) fill(632 + (y - 600), y, 640 + (y - 600), y + 1, [30, 25, 15]);
    const rows = symbolRowsFrom(img, 625, 598, 610);
    expect(rows.map((r) => r.y0)).toEqual([600, 601, 602, 603, 604, 605, 606, 607, 608, 609]);
    expect(rows[0].x0).toBe(631);
    expect(rows[9].x0).toBe(640);
    expect(rows.every((r) => r.x1 === 745)).toBe(true);
  });
});

describe("findSetSymbolLeft com o símbolo da 30th Edition", () => {
  it('o "E" dourado de braços finos fica junto do resto, mesmo com uma coluna vazia antes do "D" (Icy Manipulator, 30A)', () => {
    // barra clara; o traço do "E" (587 a 590) é tinta, os braços (591 a 598) são só um
    // pouco mais escuros que a barra, a coluna 599 é barra pura e o "DITION" começa em 600
    const { img, fill } = canvas([205, 205, 203]);
    fill(80, 600, 150, 626, [20, 20, 20]);
    fill(587, 610, 591, 630, [150, 135, 90]);
    for (const y of [610, 619, 627]) fill(591, y, 599, y + 3, [175, 165, 135]);
    for (let x = 600; x < 690; x += 9) fill(x, 610, x + 6, 630, [150, 135, 90]);
    fill(604, 596, 660, 608, [150, 135, 90]);
    fill(700, 594, 711, 634, [40, 40, 40]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(587);
  });
});

describe("findSetSymbolLeft em barra translúcida com a arte no alto", () => {
  it("o fim do tipo em inglês não vira símbolo por causa da cor da arte (Orthion, MOM)", () => {
    // barra escura translúcida; nas linhas de cima a arte laranja aparece de ponta a
    // ponta. O tipo em branco acaba em 619 e o símbolo dourado começa em 626, a uma
    // folga de letra: as linhas laranja davam cor a toda coluna e o "símbolo" começava
    // no meio do "Soldier"
    const { img, fill } = canvas([60, 55, 50]);
    fill(0, 594, 745, 600, [210, 100, 40]);
    for (let x = 501; x < 619; x += 8) fill(x, 604, x + 6, 628, [235, 235, 240]);
    fill(626, 600, 690, 630, [200, 170, 60]);
    fill(700, 590, 703, 636, [150, 140, 120]);
    const left = findSetSymbolLeft(img, 594, 632);
    expect(left).toBeGreaterThanOrEqual(619);
    expect(left).toBeLessThanOrEqual(626);
  });

  it('a arte no alto de só um pedaço da barra não vira símbolo (o "rior" do Mog, FIC)', () => {
    // barra quase preta; o tipo em branco acaba em 632 e o símbolo amarelo começa em 649.
    // No alto da barra, de 597 a 655, o céu azul da arte aparece até a linha 607 e cobre
    // a folga entre os dois: o "símbolo" começava no meio do "Warrior"
    const { img, fill } = canvas([15, 20, 30]);
    fill(560, 609, 632, 627, [235, 235, 235]);
    fill(597, 597, 655, 608, [90, 150, 200]);
    fill(649, 596, 684, 629, [200, 170, 90]);
    fill(700, 590, 703, 636, [120, 130, 140]);
    const left = findSetSymbolLeft(img, 594, 632);
    expect(left).toBeGreaterThanOrEqual(632);
    expect(left).toBeLessThanOrEqual(649);
  });
});

describe("symbolRowsLeft com o símbolo na diagonal", () => {
  it("a adaga dourada que avança sobre o fim do tipo começa, linha a linha, depois das letras (Lazav, MKM)", () => {
    // barra creme; o tipo em marrom-escuro acaba em 624 e a adaga dourada (contorno escuro
    // de 4 px) desce na diagonal de 625 (alto) a 658 (pé). Coluna nenhuma separa as duas:
    // a busca por colunas parava antes das últimas letras
    const { img, fill } = canvas([225, 210, 170]);
    // "…Detect" e, depois de uma folga de 6 px, "ive" encostado na ponta da adaga
    for (let x = 560; x < 592; x += 8) fill(x, 603, x + 5, 627, [60, 30, 15]);
    for (let x = 595; x < 625; x += 8) fill(x, 603, x + 5, 627, [60, 30, 15]);
    for (let y = 596; y < 630; y++) {
      const left = 625 + (y - 596);
      // a ponta da lâmina é estreita (3 px de dourado entre os contornos); depois alarga
      const gold = y < 608 ? 3 : 12;
      fill(left, y, left + 4, y + 1, [40, 25, 10]);
      fill(left + 4, y, left + 4 + gold, y + 1, [215, 170, 60]);
      fill(left + 4 + gold, y, left + 8 + gold, y + 1, [40, 25, 10]);
    }
    const info = { colored: -1, lim: 0 };
    const cut = findSetSymbolLeft(img, 594, 632, undefined, 100, info);
    expect(info.colored).toBeGreaterThan(cut + 8);
    const rows = symbolRowsLeft(img, 594, 632, info.colored, info.lim, 711);
    // nas linhas da adaga, a borda dela; acima e abaixo, nada
    expect(rows[0]).toBeNull();
    for (let y = 597; y < 629; y++) {
      expect(rows[y - 594]).toBeGreaterThanOrEqual(625 + (y - 596) - 1);
      expect(rows[y - 594]).toBeLessThanOrEqual(625 + (y - 596) + 1);
    }
  });

  it("a ponta avermelhada da barra não vira símbolo", () => {
    const { img, fill } = canvas([200, 200, 200]);
    fill(560, 600, 640, 626, [20, 20, 20]);
    fill(700, 590, 711, 636, [150, 40, 30]);
    const rows = symbolRowsLeft(img, 594, 632, 600, 60, 711);
    expect(rows.every((v) => v === null)).toBe(true);
  });
});

describe("findSetSymbolLeft com selo largo longe do texto", () => {
  it("o selo do Core Set 2020 colado na ponta da barra fica inteiro (Chandra's Regulator M20)", () => {
    // barra salmão (já colorida), selo de contorno preto, dourado apagado à esquerda e
    // forte à direita, com uma fresta entre o "M" e o "20", e a ponta vermelha da barra
    // encostada nele: o bloco passa de 100 px
    const { img, fill } = canvas([230, 175, 155]);
    fill(598, 597, 692, 631, [30, 25, 15]);
    fill(601, 600, 640, 628, [160, 145, 110]);
    fill(640, 600, 689, 628, [205, 170, 75]);
    fill(667, 597, 668, 631, [205, 170, 75]);
    // traços do "M" e do "20"
    for (const x of [606, 620, 634, 648]) fill(x, 603, x + 7, 625, [40, 35, 20]);
    for (const x of [671, 682]) fill(x, 603, x + 5, 618, [40, 35, 20]);
    fill(692, 594, 711, 634, [200, 40, 30]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(598);
  });
});

describe("findSetSymbolLeft com selo largo e cheio", () => {
  it("o selo dourado M19 fica inteiro, mesmo tomando mais da metade da busca (Serra's Guardian)", () => {
    // barra clara de 590 a 636 com "Creature — Angel" até 250 e, de 600 a 690, o selo
    // dourado com contorno preto, o "M" (612 a 648) e o "19" (655 a 682); a barra
    // acaba num fio escuro em 700
    const { img, fill } = canvas([228, 226, 220]);
    for (let x = 66; x < 250; x += 9) fill(x, 600, x + 5, 626, [25, 25, 25]);
    fill(600, 594, 690, 632, [25, 25, 20]);
    fill(603, 597, 687, 629, [190, 160, 75]);
    for (let x = 612; x < 648; x += 8) fill(x, 600, x + 5, 626, [20, 20, 15]);
    for (let x = 655; x < 682; x += 9) fill(x, 602, x + 4, 622, [20, 20, 15]);
    fill(700, 588, 704, 640, [30, 30, 30]);
    const left = findSetSymbolLeft(img, 594, 632);
    expect(left).toBeLessThanOrEqual(602);
    expect(left).toBeGreaterThan(560);
  });
});

describe("findSetSymbolLeft com três fios no fim da barra", () => {
  it("o símbolo das Duel Decks fica inteiro (Soul Parry, The List)", () => {
    // papel claro, "Instant" longe à esquerda, símbolo de três bolas (637 a 683) e três
    // fios finos no fim da barra (693 a 699, 704 a 706 e 710): o terceiro passava por
    // "símbolo" e o símbolo de verdade era apagado
    const { img, fill } = canvas([220, 218, 214]);
    fill(80, 600, 150, 626, [20, 20, 20]);
    fill(637, 610, 660, 624, [20, 20, 20]);
    fill(649, 597, 674, 631, [20, 20, 20]);
    fill(660, 610, 684, 624, [20, 20, 20]);
    fill(693, 594, 700, 632, [40, 40, 40]);
    fill(704, 594, 707, 632, [40, 40, 40]);
    fill(710, 594, 711, 632, [40, 40, 40]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(637);
  });
});

describe("hasLessonIcon", () => {
  it("acha o ícone das Lições pelo fio preto em curva que começa a barra do nome (Restoration Seminar, SOS 290)", () => {
    // barra cinza; o disco claro do ícone à esquerda e o fio preto em curva de x = 100 a 109
    const { img, fill } = canvas([150, 150, 150]);
    for (let y = 52; y < 104; y++) {
      const cx = 100 + Math.round(9 * Math.sin((Math.PI * (y - 52)) / 52));
      fill(40, y, cx, y + 1, [240, 240, 240]);
      fill(cx, y, cx + 3, y + 1, [5, 5, 5]);
    }
    expect(hasLessonIcon(img)).toBe(true);
  });

  it("um nome sem ícone, com letra preta nesse lugar, não engana", () => {
    // barra clara de carta comum; letras pretas de 27 px de altura desde x = 66
    const { img, fill } = canvas([222, 215, 200]);
    for (let x = 66; x < 300; x += 12) fill(x, 68, x + 4, 95, [15, 15, 15]);
    expect(hasLessonIcon(img)).toBe(false);
  });
});

describe("findSetSymbolLeft com a ponta solta do rabo do cometa da Secret Lair", () => {
  it("a estrela fica inteira mesmo com um pingo do rabo separado por 16 px (Sol Ring, SLD 2467)", () => {
    // barra escura da sem borda, tipo curto longe à esquerda; a estrela (597 a 625) com o rabo
    // em curva até 657, em traço fino com folgas de 3 a 4 px, e a ponta do rabo, uma coluna
    // só em 672. O aro da caixa fica fora da busca (xMax 688). Com o pingo como "símbolo", a
    // estrela inteira era apagada
    const { img, fill } = canvas([32, 30, 34]);
    for (let x = 80; x < 170; x += 10) fill(x, 600, x + 5, 626, [240, 240, 240]);
    fill(597, 600, 626, 628, [200, 170, 90]);
    for (let x = 626; x < 645; x++) fill(x, 600 + Math.floor((x - 626) / 4), x + 1, 604 + Math.floor((x - 626) / 4), [200, 170, 90]);
    for (const x of [648, 649, 653, 656]) fill(x, 606, x + 1, 611, [200, 170, 90]);
    fill(672, 612, 673, 616, [200, 170, 90]);
    expect(findSetSymbolLeft(img, 594, 632, 688)).toBe(597);
  });
});

describe("findSetSymbolLeft na barra arco-íris do foil", () => {
  it('a barra clara à esquerda e escura no fim não toma o vão antes do símbolo: o "tist" sai (Ian Malcolm, REX 38)', () => {
    // barra de 594 a 632: clara (155) antes da busca, com letras brancas; na busca, um degradê
    // de 70 a 31 com o fim do "Scientist" (traços brancos de 559 a 623) e, depois de 20 px
    // vazios, o símbolo dourado claro com miolo escuro (643 a 684). A barra à esquerda virava a
    // referência, a faixa inteira passava por tinta e, por linha, o vão também
    const { img, fill } = canvas([20, 20, 20]);
    fill(380, 594, 559, 632, [155, 155, 155]);
    for (let x = 400; x < 555; x += 12) fill(x, 604, x + 4, 626, [245, 245, 245]);
    fill(559, 594, 689, 632, (x) => Math.round(70 - (x - 559) * 0.3));
    for (let x = 559; x < 620; x += 7) fill(x, 604, x + 4, 627, [240, 240, 240]);
    fill(620, 604, 624, 627, [240, 240, 240]);
    fill(643, 600, 685, 628, [200, 170, 90]);
    fill(655, 608, 672, 620, [30, 25, 20]);
    const left = findSetSymbolLeft(img, 594, 632, 689, 100, undefined, true);
    expect(left).toBeGreaterThanOrEqual(640);
    expect(left).toBeLessThanOrEqual(643);
  });
});

describe("findSetSymbolLeft com lacuna entre letras quase igual à do símbolo", () => {
  it('o fim de "Werewolf" é apagado e o símbolo de EMN fica inteiro', () => {
    const { img, fill } = canvas([190, 170, 100]);
    // "…ewol" colado, lacuna de 5 px, "f", lacuna de 6 px e o símbolo (contorno escuro,
    // miolo laranja a partir de 642), colado no fio do fim da barra
    fill(560, 600, 604, 626, [20, 20, 20]);
    fill(610, 600, 620, 626, [20, 20, 20]);
    fill(626, 598, 700, 630, [90, 40, 30]);
    fill(642, 601, 697, 627, [235, 120, 30]);
    fill(700, 594, 711, 634, [30, 30, 30]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(626);
  });
});

describe("findSetSymbolLeft com o símbolo da 30th Edition numa barra cinza", () => {
  it("o traço do E e o D fraco ficam com o resto do símbolo (Demonic Tutor, 30A)", () => {
    // barra cinza (200); "Sorcery" longe, à esquerda. O símbolo: traço do "E" (588 a 592,
    // tinta de verdade), braços finos e o "D" quase da cor da barra (só "fracos"), uma
    // coluna de barra pura no meio, e o resto do símbolo em tinta a partir de 614
    const { img, fill } = canvas([200, 200, 200]);
    fill(80, 600, 200, 626, [20, 20, 20]);
    fill(588, 600, 593, 627, [140, 140, 140]);
    for (const y of [600, 611, 622]) fill(593, y, 603, y + 5, [172, 172, 172]);
    fill(604, 600, 613, 627, [172, 172, 172]);
    fill(614, 598, 650, 630, [60, 60, 60]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(588);
  });
  it("no fim de uma linha de tipo, colado na palavra de antes, o bloco não se junta ao símbolo", () => {
    // mesma lacuna fraca, mas o bloco da esquerda é o fim de "Sorcery", colado no resto
    const { img, fill } = canvas([200, 200, 200]);
    fill(470, 600, 580, 626, [20, 20, 20]);
    fill(584, 600, 593, 627, [20, 20, 20]);
    fill(593, 611, 613, 616, [172, 172, 172]);
    fill(614, 598, 650, 630, [60, 60, 60]);
    expect(findSetSymbolLeft(img, 594, 632)).toBe(614);
  });
});

describe("textMask com arte invadindo a barra", () => {
  it("a sombra da arte embaixo do nome fica; as letras e o pé do g saem (Ashiok THB)", () => {
    // barra clara de 58 a 106; letras de 60 a 78 (com o pé de um "g" até 84) e, embaixo
    // da metade da direita, a sombra da arte, salpicada de pontos claros
    const { img, fill } = canvas([225, 210, 160]);
    for (let x = 60; x < 540; x += 10) fill(x, 60, x + 5, 78, [20, 20, 20]);
    fill(100, 78, 105, 85, [20, 20, 20]);
    fill(360, 79, 560, 93, (x, y) => ((x * 7 + y * 3) % 5 === 0 ? 200 : 60));
    const rect = { x0: 50, y0: 58, x1: 560, y1: 106 };
    const mask = textMask(img, rect, 28, [], 0, "dark", true);
    const at = (x: number, y: number) => mask[(y - rect.y0) * (rect.x1 - rect.x0) + (x - rect.x0)];
    expect(at(63, 70)).toBe(1);
    expect(at(102, 82)).toBe(1);
    let art = 0;
    for (let y = 82; y < 92; y++) for (let x = 380; x < 540; x++) art += at(x, y);
    expect(art).toBeLessThan(50);
  });
});

describe("textMask com arte no alto da barra", () => {
  it("a arte clara acima da barra escura não toma o lugar das letras (Austere Command PIP)", () => {
    // barra escura de 590 a 636 com letras brancas e grossas de 605 a 629; nas duas
    // primeiras linhas do retângulo entra a arte clara de cima, salpicada, com mais
    // pixels por linha que as letras. Ela não é a linha das letras: com ela como
    // referência, as letras inteiras ficavam "abaixo do texto" e saíam da máscara
    const { img, fill } = canvas([30, 30, 30]);
    fill(50, 590, 600, 592, (x) => (x % 10 < 3 ? 235 : 40));
    for (let x = 60; x < 180; x += 9) fill(x, 605, x + 6, 629, [240, 240, 240]);
    const rect = { x0: 50, y0: 590, x1: 600, y1: 636 };
    const mask = textMask(img, rect, 28, [], 0, "light", true);
    const at = (x: number, y: number) => mask[(y - rect.y0) * (rect.x1 - rect.x0) + (x - rect.x0)];
    expect(at(63, 608)).toBe(1);
    expect(at(63, 626)).toBe(1);
  });
});

describe("textMask com símbolo cinza em papel colorido", () => {
  it("leva o círculo cinza do {T} inteiro, com a borda suavizada (Mossfire Valley PIP)", () => {
    const { img, fill } = canvas([240, 200, 180]);
    const cx = 120;
    const cy = 700;
    fill(cx - 20, cy - 20, cx + 21, cy + 21, (x, y, c) => {
      const r = Math.hypot(x - cx, y - cy);
      const paper = [240, 200, 180][c];
      if (r <= 11) return 205;
      // borda suavizada larga: o cinza vai sumindo no papel de 11 a 19 px do centro
      if (r <= 19) return Math.round(205 + ((paper - 205) * (r - 11)) / 8);
      return paper;
    });
    // a seta do {T} no meio do círculo
    fill(cx - 4, cy - 6, cx + 4, cy + 6, [20, 20, 20]);
    const rect = { x0: 60, y0: 660, x1: 300, y1: 740 };
    const mask = textMask(img, rect, 14, [], 34);
    const at = (x: number, y: number) => mask[(y - rect.y0) * (rect.x1 - rect.x0) + (x - rect.x0)];
    // sem a histerese, a máscara parava a 6 px do centro e sobrava uma lua cinza
    expect(at(cx - 10, cy)).toBe(1);
    expect(at(cx - 12, cy)).toBe(1);
    // o papel além da borda fica
    expect(at(cx - 24, cy)).toBe(0);
  });

  it("leva o círculo azul do {U} em papel granulado (Lonely Sandbar C14)", () => {
    // papel azul com grão forte (±20 por canal); círculo ciano claro de raio 10 com a
    // gota escura no meio: pixel a pixel, o círculo muda a cor tanto quanto o grão
    const paper = [180, 204, 231];
    const { img, fill } = canvas([180, 204, 231]);
    const cx = 160;
    const cy = 700;
    fill(60, 660, 300, 740, (x, y, c) => {
      const r = Math.hypot(x - cx, y - cy);
      const base = r <= 10 ? [176, 236, 250][c] : paper[c];
      return base + noise(x, y, c);
    });
    fill(cx - 3, cy - 5, cx + 4, cy + 5, [10, 20, 40]);
    const rect = { x0: 60, y0: 660, x1: 300, y1: 740 };
    const mask = textMask(img, rect, 14, [], 34);
    const at = (x: number, y: number) => mask[(y - rect.y0) * (rect.x1 - rect.x0) + (x - rect.x0)];
    // a borda do círculo, dos dois lados, entra (sobrava uma lua crescente clara)
    let ring = 0;
    for (let a = 0; a < 32; a++)
      ring += at(Math.round(cx + 9 * Math.cos((a * Math.PI) / 16)), Math.round(cy + 9 * Math.sin((a * Math.PI) / 16)));
    expect(ring).toBeGreaterThanOrEqual(30);
    // o papel longe do círculo fica
    expect(at(cx + 26, cy)).toBe(0);
    expect(at(cx - 26, cy)).toBe(0);
  });
});

describe("eraseRegions com a caixa de P/R", () => {
  /** Papel claro, caixa de P/R dourada e a última linha em inglês logo acima dela. */
  function card() {
    const c = canvas([232, 228, 222]);
    c.fill(590, 918, 700, 990, [200, 165, 70]);
    for (let x = 560; x < 690; x += 7) c.fill(x, 902, x + 4, 917, [20, 20, 20]);
    return c;
  }
  const region = { rect: { x0: 58, y0: 860, x1: 688, y1: 954 }, threshold: 14, colorThreshold: 34 };
  const pt = { x0: 568, y0: 915, x1: 745, y1: 1040 };
  /** quanto o azul caiu (o dourado tem pouco azul) logo acima da caixa */
  const goldTint = (img: ImageData) => {
    let worst = 0;
    for (let y = 905; y < 915; y++) for (let x = 600; x < 680; x++) worst = Math.max(worst, 222 - img.data[(y * img.width + x) * 4 + 2]);
    return worst;
  };

  it("a cor da caixa não vaza para o papel apagado acima dela", () => {
    const { img } = card();
    eraseRegions(img, [region], [], [pt]);
    expect(goldTint(img)).toBeLessThan(25);
  });
  it("só protegida, sem ser opaca, a caixa vira fonte e mancha o papel (o defeito antigo)", () => {
    const { img } = card();
    eraseRegions(img, [region], [pt]);
    expect(goldTint(img)).toBeGreaterThan(25);
  });
});

describe("eraseRegions com o pé da caixa mais alto à direita", () => {
  /**
   * A caixa medida no terço da esquerda vai até 963; à direita do selo o pé dela é mais
   * alto: bisel claro de 955 a 958 e fio escuro de 959 a 962 (Zahur, Passado da Glória,
   * PDFT). A última letra desce até 958.
   */
  function card() {
    const c = canvas([229, 229, 229]);
    c.fill(450, 955, 560, 959, [252, 252, 252]);
    c.fill(450, 959, 560, 963, [50, 50, 50]);
    c.fill(100, 930, 106, 958, [20, 20, 20]);
    return c;
  }
  const region = { rect: { x0: 58, y0: 900, x1: 688, y1: 963 }, threshold: 14, colorThreshold: 34, stains: true };
  const lum = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4];

  it("abaixo da medida fixa só o pé das letras sai: o fio e o bisel ficam", () => {
    const { img } = card();
    eraseRegions(img, [{ ...region, attachedBelow: 954 }], []);
    expect(lum(img, 103, 940)).toBeGreaterThan(200);
    expect(lum(img, 103, 956)).toBeGreaterThan(200);
    expect(lum(img, 500, 960)).toBeLessThan(100);
    expect(lum(img, 500, 956)).toBeGreaterThan(245);
  });
  it("sem o limite, o fio vira papel (o defeito antigo)", () => {
    const { img } = card();
    eraseRegions(img, [region], []);
    expect(lum(img, 500, 960)).toBeGreaterThan(150);
  });
});

describe("eraseBackPtNotch (lembrete do verso no canto da caixa)", () => {
  /**
   * Caixa com o lado direito em 686 (fio claro de 686 a 689, moldura de 690 em diante),
   * salvo na ponta em "<" de 880 a 910, onde o papel vai até 702 (SOI). Depois do
   * apagamento da caixa até 685 sobra a lasca do "5" do lembrete em 685 e 686.
   */
  function card() {
    const c = canvas([227, 227, 227]);
    for (let y = 860; y < 930; y++) {
      const edge = y >= 880 && y < 910 ? 702 : 686;
      c.fill(edge, y, edge + 4, y + 1, [180, 180, 180]);
      c.fill(edge + 4, y, 745, y + 1, [90, 110, 90]);
    }
    c.fill(685, 885, 687, 905, [60, 60, 60]);
    return c;
  }
  const lum = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4];

  it("apaga a lasca do lembrete e deixa a moldura", () => {
    const { img } = card();
    eraseBackPtNotch(img, { x0: 600, y0: 868, x1: 716, y1: 916 }, 685);
    for (let y = 886; y < 904; y += 3) expect(lum(img, 686, y)).toBeGreaterThan(200);
    expect(lum(img, 703, 895)).toBe(180);
    expect(lum(img, 710, 895)).toBe(90);
    expect(lum(img, 687, 870)).toBe(180);
    expect(lum(img, 695, 912)).toBe(90);
  });
});

describe("fio do flavor nas fichas", () => {
  /** Caixa cinza de ficha com o fio do flavor: escuro em 865, filete claro em 867, ponta esmaecida à esquerda (SLD 1681). */
  function token() {
    const c = canvas([150, 150, 150]);
    // papel com grão leve: a mancha da máscara não corre pelo filete até a ponta
    c.fill(0, 0, 745, 1040, (x, y, ch) => 150 + Math.round(noise(x, y, ch) / 2));
    c.fill(72, 865, 120, 866, [140, 140, 140]);
    c.fill(120, 865, 680, 866, [108, 108, 108]);
    c.fill(72, 867, 680, 868, [176, 176, 176]);
    // as regras em cima e o flavor embaixo
    for (let x = 200; x < 520; x += 9) c.fill(x, 820, x + 4, 845, [20, 20, 20]);
    for (let x = 220; x < 500; x += 9) c.fill(x, 880, x + 4, 900, [20, 20, 20]);
    return c;
  }
  // (sem a mancha: aqui ela corria pelo filete até a ponta; no papel de verdade parava antes)
  const region = { rect: { x0: 56, y0: 770, x1: 683, y1: 950 }, threshold: 14, colorThreshold: 34, polarity: "dark" as const };
  const lum = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4];

  it("acha as linhas do fio, e não as das letras", () => {
    const rows = dividerRows(token().img, region.rect);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((y) => y >= 863 && y <= 869)).toBe(true);
  });
  it("o filete claro sai inteiro, com a ponta", () => {
    const { img } = token();
    eraseRegions(img, [{ ...region, dividers: true }], []);
    for (const x of [76, 90, 110, 300, 600]) expect(Math.abs(lum(img, x, 867) - 150)).toBeLessThan(16);
  });
  it("só com a máscara das letras, a ponta clara fica (o defeito antigo)", () => {
    const { img } = token();
    eraseRegions(img, [region], []);
    expect(lum(img, 90, 867)).toBeGreaterThan(165);
  });
});

describe("ptBoxTop", () => {
  it("acha o topo da caixa de P/R", () => {
    const { img, fill } = canvas();
    fill(600, 918, 700, 990, [60, 60, 60]);
    expect(ptBoxTop(img, 610, 670, 905, 950, 890)).toBe(918);
  });
  it("letras soltas não são caixa", () => {
    const { img, fill } = canvas();
    for (let x = 610; x < 670; x += 10) fill(x, 910, x + 3, 935, [20, 20, 20]);
    expect(ptBoxTop(img, 610, 670, 905, 950, 890)).toBeNull();
  });
});

describe("ptBoxLeft e ptProtect", () => {
  /** Caixa de P/R de canto arredondado: começa em 590 no topo (930) e em 574 de 946 para baixo. */
  function ptCard() {
    const c = canvas([228, 210, 205]);
    const edge = (y: number) => (y < 934 ? 590 : y < 938 ? 584 : y < 942 ? 579 : y < 946 ? 576 : 574);
    for (let y = 930; y < 990; y++) c.fill(edge(y), y, 700, y + 1, [60, 50, 50]);
    // ponto final do flavor no canto vazio ao lado da caixa (Towashi Songshaper, NEO)
    c.fill(566, 934, 574, 942, [20, 20, 20]);
    return c;
  }
  const inside = (rects: { x0: number; y0: number; x1: number; y1: number }[], x: number, y: number) =>
    rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);

  it("mede o lado esquerdo abaixo do canto arredondado", () => {
    const { img } = ptCard();
    expect(ptBoxLeft(img, 952, 545, 610, 890)).toBe(574);
  });
  it("o ponto ao lado do canto fica fora da proteção; a caixa, dentro", () => {
    const { img } = ptCard();
    const top = ptBoxTop(img, 610, 670, 905, 950, 890)!;
    const rects = ptProtect(top, ptBoxLeft(img, top + 22, 545, 610, 890));
    for (let y = 934; y < 942; y++) for (let x = 566; x < 574; x++) expect(inside(rects, x, y)).toBe(false);
    for (const [x, y] of [
      [590, 930],
      [584, 935],
      [579, 939],
      [576, 943],
      [574, 960],
    ])
      expect(inside(rects, x, y)).toBe(true);
  });
  it("caixa mais baixa (936): a proteção começa logo acima dela, não no papel", () => {
    // o ponto final da última linha caía entre 925 e 928, acima da caixa e à direita do
    // lado dela: protegido, o pé dele ficava (Dúplice Debochada, CLB 617)
    const rects = ptProtect(936, 573);
    for (let y = 925; y < 929; y++) for (let x = 576; x < 584; x++) expect(inside(rects, x, y)).toBe(false);
    expect(inside(rects, 590, 934)).toBe(true);
  });
});

describe("findStamp", () => {
  it("acha o selo claro que sobe da borda preta para dentro da caixa", () => {
    const { img, fill } = canvas();
    fill(0, 952, 745, 1040, [15, 15, 15]);
    fill(345, 925, 400, 975, [120, 160, 220]);
    const s = findStamp(img, 948, 60, 30);
    expect(s).not.toBeNull();
    expect(s!.x0).toBeLessThanOrEqual(345);
    expect(s!.x1).toBeGreaterThanOrEqual(400);
    expect(s!.y0).toBeLessThanOrEqual(925);
  });
  it("sem selo, nada", () => {
    const { img, fill } = canvas();
    fill(0, 952, 745, 1040, [15, 15, 15]);
    expect(findStamp(img, 948, 60, 30)).toBeNull();
  });
  it("selo com desenho escuro no meio cobre a cúpula inteira (Strixhaven)", () => {
    // cúpula escura de 328 a 417 e, dentro dela, o oval claro de 341 a 397 com uma mão
    // escura no centro (354 a 376): na linha da borda, o centro é escuro
    const { img, fill } = canvas([235, 240, 245]);
    fill(0, 966, 745, 1040, [15, 15, 15]);
    fill(328, 947, 418, 966, [20, 20, 25]);
    fill(341, 950, 398, 985, [150, 200, 230]);
    fill(354, 950, 377, 985, [30, 30, 35]);
    const s = findStamp(img, 948, 26, 30);
    expect(s).not.toBeNull();
    expect(s!.x0).toBeLessThanOrEqual(328);
    expect(s!.x1).toBeGreaterThanOrEqual(418);
  });
  it("letras da última linha ao lado do selo não alargam a proteção (Thundering Raiju NEO)", () => {
    // cúpula escura de 340 a 405 subindo da borda até 944; a última linha do lembrete,
    // em itálico, passa por x 60 a 300 até a linha 952, e o ")" acaba em 296 a 306. Com
    // as letras na amostra do papel ao lado, uma linha inteira parecia "selo" e a
    // proteção ia até 295: o pé do ")" ficava sem apagar
    // (as letras têm traço preto e borda cinza, como as de verdade, suavizadas)
    const { img, fill } = canvas([228, 205, 205]);
    fill(0, 966, 745, 1040, [15, 15, 15]);
    fill(340, 944, 406, 952, [25, 20, 20]);
    fill(340, 952, 406, 985, [120, 160, 220]);
    for (let x = 60; x < 290; x += 6) {
      fill(x, 930, x + 2, 949, [20, 20, 20]);
      fill(x + 2, 944, x + 5, 949, [130, 120, 120]);
    }
    fill(296, 940, 306, 953, [20, 20, 20]);
    const s = findStamp(img, 948, 26, 30);
    expect(s).not.toBeNull();
    expect(s!.x0).toBeLessThanOrEqual(340);
    expect(s!.x0).toBeGreaterThan(306);
    expect(s!.x1).toBeGreaterThanOrEqual(406);
  });
});

describe("coloredInk", () => {
  const rect = { x0: 60, y0: 57, x1: 685, y1: 104 };
  it("nome dourado na placa preta: devolve o dourado (Myr C18)", () => {
    const { img, fill } = canvas([15, 15, 15]);
    for (let x = 330; x < 420; x += 12) fill(x, 66, x + 7, 96, [225, 200, 120]);
    const [m] = maskRegions(img, [{ rect, threshold: 28, fill: "rows" }], []);
    const [r, g, b] = (coloredInk(img, m) ?? "").match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(190);
    expect(b).toBeLessThan(140);
    expect(g).toBeGreaterThan(b);
  });
  it("nome branco na barra verde: nada (fica o branco de sempre)", () => {
    const { img, fill } = canvas([35, 60, 45]);
    for (let x = 330; x < 420; x += 12) fill(x, 66, x + 7, 96, [250, 250, 250]);
    const [m] = maskRegions(img, [{ rect, threshold: 28, fill: "rows" }], []);
    expect(coloredInk(img, m)).toBeNull();
  });
});

describe("textMask em barra de meia-tinta", () => {
  it("o pé das letras brancas entra na máscara (ficha A Sentinela Oca, ONE)", () => {
    // barra azul-acinzentada com pontos fortes de meia-tinta; letras brancas grandes que
    // ficam acinzentadas no pé, ocupando boa parte da faixa
    const { img, fill } = canvas();
    fill(60, 57, 685, 104, (x, y, c) => [120, 125, 150][c] + Math.round(1.5 * noise(x, y, 0)));
    for (let x = 165; x < 580; x += 20) {
      fill(x, 66, x + 13, 86, [250, 250, 250]);
      fill(x, 86, x + 13, 96, [215, 215, 220]);
    }
    const rect = { x0: 60, y0: 57, x1: 685, y1: 104 };
    const mask = textMask(img, rect, 28, [], 0, "light", true);
    const at = (x: number, y: number) => mask[(y - rect.y0) * (rect.x1 - rect.x0) + (x - rect.x0)];
    let foot = 0;
    let total = 0;
    for (let x = 165; x < 580; x += 20)
      for (let y = 88; y < 95; y++) {
        total++;
        foot += at(x + 6, y);
      }
    expect(foot / total).toBeGreaterThan(0.9);
  });
});

describe("centralSpan", () => {
  it("fica com o nome do meio, sem as pontas claras da barra (ficha Tesouro, FDC)", () => {
    const w = 625;
    const h = 47;
    const mask = new Uint8Array(w * h);
    const mark = (x0: number, x1: number) => {
      for (let y = 10; y < 40; y++) for (let x = x0; x < x1; x++) mask[y * w + x] = 1;
    };
    mark(0, 16); // ponta esquerda
    mark(220, 260); // "TESO"
    mark(268, 405); // "URO" (lacuna de 8 px entre letras: fica junto)
    mark(600, 625); // ponta direita
    const span = centralSpan({ rect: { x0: 60, y0: 57, x1: 685, y1: 104 }, mask, polarity: "light" }, 40);
    expect(span).toEqual({ x0: 280, x1: 465 });
  });

  /** Nome comprido que chega perto das pontas da barra (47 px de altura, letras de 10 a 40). */
  function longName() {
    const w = 625;
    const h = 47;
    const mask = new Uint8Array(w * h);
    const mark = (x0: number, x1: number, y0 = 10, y1 = 40) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * w + x] = 1;
    };
    return { w, h, mask, mark, rect: { x0: 60, y0: 57, x1: 685, y1: 104 } };
  }

  it("o brilho do alto das pontas, perto das letras, não emenda no nome (Icingdeath, AFR)", () => {
    const { mask, mark, rect } = longName();
    mark(0, 40, 0, 16); // brilho da ponta esquerda, só no alto
    mark(0, 28, 40, 47); // e o contorno dela embaixo
    mark(56, 300); // "ICINGDEATH,"
    mark(318, 570); // "FROST TONGUE"
    mark(585, 625, 0, 16); // brilho da ponta direita
    expect(centralSpan({ rect, mask, polarity: "light" }, 40)).toEqual({ x0: 116, x1: 630 });
  });

  it("o contorno claro da ponta, colado no fim do nome, também não (Sephiroth, FIN)", () => {
    const { mask, mark, rect } = longName();
    mark(13, 604); // "SEPHIROTH, ONE-WINGED ANGE"
    mark(604, 611, 26, 40); // o pé do "L"
    mark(610, 614, 6, 18); // risco de brilho logo depois do "L"
    mark(614, 624, 4, 18); // o arco da ponta, em cima
    mark(614, 624, 33, 43); // e embaixo
    expect(centralSpan({ rect, mask, polarity: "light" }, 40)).toEqual({ x0: 73, x1: 671 });
  });

  it('o braço do "T" no fim do nome e a vírgula no meio continuam no bloco', () => {
    const { mask, mark, rect } = longName();
    mark(200, 300); // "SPIR"
    mark(306, 312, 36, 46); // vírgula, só embaixo
    mark(318, 400); // "SPIRI"
    mark(410, 418); // haste do "T"
    mark(398, 432, 10, 16); // braço do "T", só no alto, ligado à haste
    expect(centralSpan({ rect, mask, polarity: "light" }, 40)).toEqual({ x0: 260, x1: 492 });
  });
});

describe("inpaint linha a linha", () => {
  it("segue o degradê da ponta da barra (emblema da Chandra, CMM)", () => {
    // barra que clareia de 60 para 92 nos últimos 80 px da esquerda; uma letra apagada no degradê
    const { img, fill } = canvas();
    const bar = (x: number) => (x < 140 ? Math.round(92 - ((x - 60) * 32) / 80) : 60);
    fill(60, 60, 685, 100, (x) => bar(x));
    const rect = { x0: 60, y0: 60, x1: 685, y1: 100 };
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    for (let y = 5; y < 35; y++) for (let x = 25; x < 60; x++) mask[y * w + x] = 1; // x de 85 a 120
    inpaint(img, rect, mask, "rows");
    let worst = 0;
    for (let y = 70; y < 90; y++)
      for (let x = 85; x < 120; x++) worst = Math.max(worst, Math.abs(img.data[(y * img.width + x) * 4] - bar(x)));
    expect(worst).toBeLessThan(4);
  });

  it("não deixa riscos horizontais numa barra granulada (Tesouro de FIN, Cranial Plating foil)", () => {
    // barra com grão forte; um nome apagado de 100 px: cada linha do remendo saía da
    // mediana de poucos pixels dos lados e ficava um pouco mais clara ou escura que a
    // vizinha, um risco de ponta a ponta
    const { img, fill } = canvas();
    fill(60, 60, 685, 100, (x, y, c) => 190 + noise(x, y, c));
    const rect = { x0: 60, y0: 60, x1: 685, y1: 100 };
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    for (let y = 8; y < 32; y++) for (let x = 140; x < 240; x++) mask[y * w + x] = 1; // x de 200 a 300
    inpaint(img, rect, mask, "rows");
    const rowMean = (y: number, x0: number) => {
      let s = 0;
      for (let x = x0; x < x0 + 100; x++) s += img.data[(y * img.width + x) * 4];
      return s / 100;
    };
    // o remendo leva o grão da barra, então a média de cada linha varia como no papel
    // intacto ao lado (x de 400 a 500); um risco foge bem disso
    const worst = (x0: number) => {
      let m = 0;
      for (let y = 68; y < 91; y++) m = Math.max(m, Math.abs(rowMean(y + 1, x0) - rowMean(y, x0)));
      return m;
    };
    expect(worst(200)).toBeLessThan(worst(400) + 1.5);
  });
});

describe("marca-d'água clara em papel granulado", () => {
  /**
   * Papel cinza-esverdeado com grão forte (±20 por canal) e uma estrela clara de oito
   * raios, ~26 acima do papel, que afinam e somem nas pontas (Preço Final, promo da FNM).
   * Uma linha de letras escuras passa pelo meio da estrela.
   */
  const paper = [211, 219, 209];
  const cx = 300;
  const cy = 780;
  /** brilho da estrela em (x, y): 0 fora dela */
  const star = (x: number, y: number) => {
    let best = 0;
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4 + 0.2;
      const along = (x - cx) * Math.cos(ang) + (y - cy) * Math.sin(ang);
      const across = Math.abs(-(x - cx) * Math.sin(ang) + (y - cy) * Math.cos(ang));
      if (along < 0 || along > 110) continue;
      // o raio vai de 7 px de meia-largura no centro a 1,5 na ponta, e o brilho cai de 26 a 14
      const half = 7 - (5.5 * along) / 110;
      if (across <= half) best = Math.max(best, 26 - (12 * along) / 110);
    }
    return best;
  };
  function card() {
    const c = canvas([211, 219, 209]);
    c.fill(58, 646, 688, 954, (x, y, ch) => paper[ch] + Math.round(star(x, y)) + noise(x, y, ch));
    for (let x = 120; x < 520; x += 14) c.fill(x, 772, x + 8, 792, [25, 25, 25]);
    return c;
  }
  const rect = { x0: 58, y0: 646, x1: 688, y1: 954 };

  it("a estrela entra inteira na máscara, até as pontas finas dos raios", () => {
    const { img } = card();
    const [m] = maskRegions(img, [{ rect, threshold: 14, colorThreshold: 34, stains: true }], []);
    const w = rect.x1 - rect.x0;
    const at = (x: number, y: number) => m.mask[(y - rect.y0) * w + (x - rect.x0)];
    // pontos no eixo de cada raio, a 85% do comprimento (sobravam como riscos claros)
    let tips = 0;
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4 + 0.2;
      tips += at(Math.round(cx + 94 * Math.cos(ang)), Math.round(cy + 94 * Math.sin(ang)));
    }
    expect(tips).toBe(8);
    // o papel longe da estrela e das letras fica
    let paperHits = 0;
    for (let y = 860; y < 940; y += 4) for (let x = 520; x < 670; x += 4) paperHits += at(x, y);
    expect(paperHits).toBe(0);
  });
});

describe("pedaços soltos de marca-d'água", () => {
  /**
   * Papel creme com um pouco de grão e duas linhas de letras. Longe delas, um pedaço
   * avermelhado da marca-d'água (as pontas da marca do Recepcionista Diabólico, SNC, sem
   * letra encostada) e, numa caixa translúcida, os brilhos claros e sem cor das bolhas
   * (Vampiro de ISD, Espírito de EVE).
   */
  const rect = { x0: 58, y0: 646, x1: 688, y1: 954 };
  function card() {
    const c = canvas([236, 230, 220]);
    c.fill(rect.x0, rect.y0, rect.x1, rect.y1, (x, y, ch) => [236, 230, 220][ch] + Math.round(noise(x, y, ch) / 8));
    for (let x = 100; x < 600; x += 14) {
      c.fill(x, 700, x + 8, 720, [25, 25, 25]);
      c.fill(x, 740, x + 8, 760, [25, 25, 25]);
    }
    // pedaço da marca: triângulo avermelhado, quase no brilho do papel (abaixo do limiar
    // das letras), mas de outra cor
    c.fill(320, 800, 350, 822, (x, y, ch) => (x - 320 <= (y - 800) * 1.3 ? [244, 218, 210][ch] : [236, 230, 220][ch]));
    // ponta cinza-azulada da marca Dimir: quase sem cor, mas escura de verdade
    c.fill(420, 800, 450, 826, (x, y, ch) => [225, 219, 209][ch] + Math.round(noise(x, y, ch) / 8));
    // brilhos das bolhas: discos brancos, sem cor
    for (const [bx, by] of [
      [150, 880],
      [480, 870],
      [600, 900],
    ])
      c.fill(bx - 5, by - 5, bx + 5, by + 5, (x, y, ch) => ((x - bx) ** 2 + (y - by) ** 2 <= 25 ? 255 : [236, 230, 220][ch]));
    return c;
  }
  const at = (m: { mask: Uint8Array }, x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + (x - rect.x0)];

  it("o pedaço colorido da marca, sem letra encostada, entra na máscara", () => {
    const [m] = maskRegions(card().img, [{ rect, threshold: 14, colorThreshold: 34, stains: true }], []);
    expect(at(m, 328, 815)).toBe(1);
  });

  it("o pedaço sem cor, mas bem mais escuro que o papel, também entra (Inseto-espião Dimir)", () => {
    const [m] = maskRegions(card().img, [{ rect, threshold: 14, colorThreshold: 34, stains: true }], []);
    expect(at(m, 435, 813)).toBe(1);
  });

  it("o brilho claro e sem cor das bolhas fica: é textura, não tinta", () => {
    const [m] = maskRegions(card().img, [{ rect, threshold: 14, colorThreshold: 34, stains: true }], []);
    expect(at(m, 150, 880) + at(m, 480, 870) + at(m, 600, 900)).toBe(0);
  });
});

describe("inpaint com texto denso em papel pontilhado", () => {
  /**
   * Papel com pontilhado regular (as fichas de CLB) e um bloco de texto largo e alto. No
   * meio dele, tudo a até 4 blocos de distância também é letra: o grão tem de vir de
   * mais longe, senão o meio sai liso (a linha do meio da ficha Lula).
   */
  it("o meio do bloco ganha o grão do papel", () => {
    const { img, fill } = canvas([20, 20, 20]);
    const rect = { x0: 60, y0: 600, x1: 680, y1: 900 };
    fill(rect.x0, rect.y0, rect.x1, rect.y1, (x, y) => 200 + (x % 4 < 2 !== y % 4 < 2 ? 12 : -12));
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    for (let y = 640; y < 860; y++) for (let x = 80; x < 560; x++) mask[(y - rect.y0) * w + x - rect.x0] = 1;
    inpaint(img, rect, mask);
    const vals: number[] = [];
    for (let y = 734; y < 766; y++) for (let x = 304; x < 336; x++) vals.push(img.data[(y * img.width + x) * 4 + 1]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(Math.abs(mean - 200)).toBeLessThan(4);
    expect(sd).toBeGreaterThan(6);
  });
});

describe("smoothNoisyPaper (papel de retícula grossa)", () => {
  /**
   * A pirâmide do preenchimento parte da cor exata dos pixels conhecidos. Na retícula do
   * Dragonskull Summit (C16), que muda 60 tons de um pixel a outro, um pingo claro ou um
   * ponto da retícula na borda do buraco virava uma mancha no remendo. Num papel assim, a
   * cor de partida passa a ser a média dos vizinhos; num papel comum, nada muda.
   */
  const w = 120;
  const h = 80;
  function paper(value: (x: number, y: number) => number) {
    const c = new Float32Array(w * h * 3);
    const a = new Float32Array(w * h).fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < 3; ch++) c[(y * w + x) * 3 + ch] = value(x, y);
    // buraco no meio
    for (let y = 30; y < 50; y++) for (let x = 40; x < 80; x++) a[y * w + x] = 0;
    return { c, a };
  }

  it("na retícula, o pingo e os pontos da borda saem perto da média do papel", () => {
    const { c, a } = paper((x, y) => {
      if (x >= 37 && x < 39 && y >= 38 && y < 40) return 250; // pingo encostado no buraco
      return 170 + ((x >> 1) % 2 === (y >> 1) % 2 ? 30 : -30);
    });
    smoothNoisyPaper(c, a, w, h, 1);
    expect(c[(38 * w + 38) * 3]).toBeLessThan(195);
    expect(Math.abs(c[(20 * w + 20) * 3] - 170)).toBeLessThan(15);
  });

  it("papel comum fica como está", () => {
    const { c, a } = paper((x, y) => 200 + noise(x, y, 0) / 5);
    const before = c.slice();
    smoothNoisyPaper(c, a, w, h, 1);
    expect(c).toEqual(before);
  });
});

describe("darkTextBox", () => {
  const box = { x0: 68, y0: 656, x1: 677, y1: 944 };
  it("papel claro com texto escuro: é a caixa da M15", () => {
    const { img, fill } = canvas([20, 20, 20]);
    fill(68, 656, 677, 944, [225, 218, 205]);
    for (let y = 680; y < 900; y += 34) fill(80, y, 640, y + 18, [25, 25, 25]);
    expect(darkTextBox(img, box)).toBe(false);
  });

  it("caixa translúcida escura sobre a arte, com texto branco (Crucible of Worlds, NAC): não é", () => {
    const { img, fill } = canvas([20, 20, 20]);
    fill(68, 656, 677, 944, (x, y, ch) => [40, 60, 90][ch] + Math.round(30 * Math.sin(x / 40) * Math.cos(y / 30)));
    for (let y = 680; y < 900; y += 34) fill(80, y, 640, y + 18, [240, 240, 240]);
    expect(darkTextBox(img, box)).toBe(true);
  });
});

describe("notM15Frame", () => {
  const box = { x0: 68, y0: 656, x1: 677, y1: 944 };
  it("caixa clara e os dois fios da barra de tipo: é a M15", () => {
    const { img, fill } = canvas([20, 20, 20]);
    fill(40, 589, 705, 592, [230, 225, 215]);
    fill(40, 592, 705, 642, [200, 195, 185]);
    fill(68, 656, 677, 944, [225, 218, 205]);
    expect(notM15Frame(img, box)).toBe(false);
  });

  it("papel solto com o desenho onde seria a barra (Shivan Dragon da MSCHF, SLZ 380): não é", () => {
    // sem barra: o papel vai de ponta a ponta, o nome solto no alto e o dragão preto, de
    // contorno irregular, atravessando a altura da barra de tipo
    const { img, fill } = canvas([232, 228, 220]);
    for (let x = 40; x < 600; x += 46) fill(x, 50, x + 30, 95, [30, 30, 30]);
    for (let y = 540; y < 780; y++) {
      const end = 430 + Math.round(120 * Math.sin(y / 17) + 60 * Math.cos(y / 7));
      fill(30 + Math.round(20 * Math.sin(y / 9)), y, end, y + 1, [25, 25, 25]);
    }
    expect(darkTextBox(img, box)).toBe(false);
    expect(notM15Frame(img, box)).toBe(true);
  });

  it("caixa escura (Crucible of Worlds, NAC): não é, mesmo com os fios", () => {
    const { img, fill } = canvas([20, 20, 20]);
    fill(40, 589, 705, 592, [230, 225, 215]);
    fill(40, 592, 705, 642, [200, 195, 185]);
    fill(68, 656, 677, 944, [50, 60, 80]);
    expect(notM15Frame(img, box)).toBe(true);
  });
});

describe("inpaint linha a linha em barra de grão forte", () => {
  /**
   * Barra de tipo com grão forte (Corpse Augur, C15: ~18 tons de desvio típico) e letras
   * de 6 px com vãos de 8 px. O remendo tem de levar o grão: com o "calmo" fixo em 12
   * tons, quase nenhum pixel dos vãos servia de fonte e o trecho saía liso.
   */
  it("o remendo das letras ganha o grão da barra", () => {
    const { img, fill } = canvas([20, 20, 20]);
    const rect = { x0: 50, y0: 590, x1: 650, y1: 636 };
    const grain = (x: number, y: number) => Math.round(noise(x, y, 0) * 1.6);
    fill(rect.x0, rect.y0, rect.x1, rect.y1, (x, y) => 190 + grain(x, y));
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    for (let x = 100; x < 400; x += 14)
      for (let y = 600; y < 626; y++) for (let xx = x; xx < x + 6; xx++) mask[(y - rect.y0) * w + xx - rect.x0] = 1;
    inpaint(img, rect, mask, "rows");
    const vals: number[] = [];
    for (let k = 0; k < mask.length; k++)
      if (mask[k]) vals.push(img.data[((rect.y0 + Math.floor(k / w)) * img.width + rect.x0 + (k % w)) * 4]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(sd).toBeGreaterThan(10);
  });

  it("um trecho apagado de 200 px seguidos também ganha o grão (fim do tipo comprido)", () => {
    const { img, fill } = canvas([20, 20, 20]);
    const rect = { x0: 50, y0: 590, x1: 650, y1: 636 };
    fill(rect.x0, rect.y0, rect.x1, rect.y1, (x, y) => 190 + Math.round(noise(x, y, 0) * 1.6));
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    for (let y = 600; y < 626; y++) for (let x = 300; x < 500; x++) mask[(y - rect.y0) * w + x - rect.x0] = 1;
    inpaint(img, rect, mask, "rows");
    // o meio do trecho, a mais de 10 px de qualquer papel
    const vals: number[] = [];
    for (let y = 604; y < 622; y++) for (let x = 360; x < 440; x++) vals.push(img.data[(y * img.width + x) * 4]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(sd).toBeGreaterThan(10);
  });
});

describe("measureCentered nas cartas", () => {
  // caixa de texto de carta (papel claro), medida antes de apagar
  const box = { x0: 60, y0: 650, x1: 686, y1: 950 };
  it("o texto curto centrado de alguns feitiços de CMR sai centrado (Counterspell 395, Triumphant Reckoning 628)", () => {
    const { img, fill } = canvas([232, 230, 226]);
    // uma linha só, no meio da caixa
    for (let x = 205; x < 540; x += 11) fill(x, 790, x + 8, 812, [25, 25, 25]);
    expect(measureCentered(img, box, [], 1)).toBe(true);
    // três linhas de larguras diferentes com o meio no mesmo lugar
    const c = canvas([232, 230, 226]);
    for (const [a, b, y] of [
      [140, 606, 770],
      [125, 621, 806],
      [190, 556, 842],
    ])
      for (let x = a; x < b; x += 11) c.fill(x, y, Math.min(b, x + 8), y + 22, [25, 25, 25]);
    expect(measureCentered(c.img, box, [], 1)).toBe(true);
  });
  it("o texto comum, alinhado à esquerda, fica à esquerda", () => {
    const { img, fill } = canvas([232, 230, 226]);
    for (const [b, y] of [
      [660, 700],
      [640, 736],
      [300, 772],
    ])
      for (let x = 70; x < b; x += 11) fill(x, y, Math.min(b, x + 8), y + 22, [25, 25, 25]);
    expect(measureCentered(img, box, [], 1)).toBe(false);
    // "Flying" sozinho na primeira linha
    const c = canvas([232, 230, 226]);
    for (let x = 70; x < 150; x += 11) c.fill(x, 700, x + 8, 722, [25, 25, 25]);
    expect(measureCentered(c.img, box, [], 1)).toBe(false);
  });
});

describe("stampShape (a proteção do selo seguindo a cúpula)", () => {
  /** Papel, borda preta a partir de 961, cúpula escura que sobe em curva até 944 e o selo claro. */
  function stampCard() {
    const c = canvas([225, 222, 215]);
    c.fill(0, 961, 745, 1040, [15, 15, 15]);
    for (let y = 944; y < 961; y++) {
      const out = Math.round((y - 944) * 2);
      c.fill(362 - out, y, 398 + out, y + 1, [25, 20, 20]);
    }
    c.fill(350, 952, 410, 990, [150, 200, 230]);
    // o pé do "l." da última linha (Dança Macabra, AFC 22): bem ao lado da cúpula, mas
    // dentro do retângulo de folga do selo
    c.fill(326, 941, 332, 947, [30, 30, 30]);
    c.fill(336, 943, 340, 947, [30, 30, 30]);
    return c;
  }

  it("o pé das letras no canto de cima do retângulo fica fora da proteção", () => {
    const { img } = stampCard();
    const found = findStamp(img, 948, 26, 30);
    expect(found).not.toBeNull();
    const stamp = { ...found!, y0: found!.y0 + 3 };
    // (o retângulo de antes cobria o pé das letras)
    expect(stamp.x0).toBeLessThanOrEqual(326);
    expect(stamp.y0).toBeLessThanOrEqual(944);
    const rows = stampShape(img, stamp);
    const inside = (x: number, y: number) => rows.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    for (let y = 941; y < 947; y++) for (const x of [326, 329, 331, 336, 339]) expect(inside(x, y)).toBe(false);
  });

  it("o fio do chanfro perto da aba, solto dela por uma fresta de papel, continua protegido (Chave da Cidade, FIC)", () => {
    const { img, fill } = stampCard();
    // fio cinza em diagonal, a 9 px da cúpula, de 944 a 958
    for (let y = 944; y < 958; y++) {
      const x = 362 - Math.round((y - 944) * 2) - 12;
      fill(x, y, x + 3, y + 1, [125, 125, 125]);
    }
    const found = findStamp(img, 948, 26, 30)!;
    const rows = stampShape(img, { ...found, y0: found.y0 + 3 });
    const inside = (x: number, y: number) => rows.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    for (let y = 944; y < 958; y++) expect(inside(362 - Math.round((y - 944) * 2) - 11, y)).toBe(true);
    // e o pé das letras, mais longe, continua de fora
    expect(inside(328, 945)).toBe(false);
  });

  it("a cúpula e o selo continuam protegidos", () => {
    const { img } = stampCard();
    const found = findStamp(img, 948, 26, 30)!;
    const rows = stampShape(img, { ...found, y0: found.y0 + 3 });
    const inside = (x: number, y: number) => rows.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    for (const [x, y] of [
      [362, 945],
      [397, 945],
      [345, 953],
      [380, 955],
      [414, 953],
      [332, 960],
    ])
      expect(inside(x, y)).toBe(true);
  });
});

describe("faixas da tabela de d20", () => {
  /** Caixa com papel de grão leve e duas faixas cinza (a primeira e a terceira linha da tabela). */
  function tableBox() {
    const c = canvas([20, 20, 20]);
    c.fill(60, 700, 685, 940, (x, y, ch) => 222 + Math.round(noise(x, y, ch) / 6));
    const band = (y0: number, y1: number) => c.fill(66, y0, 676, y1, (x, y, ch) => [186, 186, 196][ch] + Math.round(noise(x, y, ch) / 6));
    band(780, 810);
    band(850, 880);
    // letras pretas por cima de tudo
    for (const y of [760, 790, 825, 860, 895]) for (let x = 80; x < 640; x += 13) c.fill(x, y, x + 5, y + 14, [25, 25, 25]);
    return c;
  }
  const box = { x0: 60, y0: 700, x1: 685, y1: 940 };

  it("acha as duas faixas, onde começam e acabam e a cor delas (Cone of Cold, CLB)", () => {
    const { img } = tableBox();
    const copy = { ...img, data: new Uint8ClampedArray(img.data) } as ImageData;
    const bands = liftShadedBands(copy, box);
    expect(bands).not.toBeNull();
    expect(bands!.bands.length).toBe(2);
    expect(Math.abs(bands!.bands[0].y0 - 780)).toBeLessThanOrEqual(2);
    expect(Math.abs(bands!.bands[0].y1 - 810)).toBeLessThanOrEqual(2);
    expect(Math.abs(bands!.bands[1].y0 - 850)).toBeLessThanOrEqual(2);
    expect(Math.abs(bands!.x0 - 66)).toBeLessThanOrEqual(3);
    expect(Math.abs(bands!.x1 - 676)).toBeLessThanOrEqual(3);
    for (const [c, v] of [186, 186, 196].entries()) expect(Math.abs(bands!.color[c] - v)).toBeLessThanOrEqual(6);
    // na cópia, a faixa fica da cor do papel
    const at = (x: number, y: number) => copy.data[(y * copy.width + x) * 4];
    expect(Math.abs(at(400, 784) - 222)).toBeLessThanOrEqual(10);
  });

  it("papel sem faixa: nada", () => {
    const c = canvas([20, 20, 20]);
    c.fill(60, 700, 685, 940, [222, 222, 222]);
    for (const y of [760, 800, 840]) for (let x = 80; x < 640; x += 13) c.fill(x, y, x + 5, y + 14, [25, 25, 25]);
    expect(liftShadedBands(c.img, box)).toBeNull();
  });

  it("com `force`, a faixa sai inteira no apagamento e vira papel", () => {
    const { img } = tableBox();
    const copy = { ...img, data: new Uint8ClampedArray(img.data) } as ImageData;
    const bands = liftShadedBands(copy, box)!;
    const force = bands.bands.map((b) => ({ x0: bands.x0 - 3, y0: b.y0 - 3, x1: bands.x1 + 3, y1: b.y1 + 3 }));
    // (sem marca-d'água: a faixa, larga, é o fundo da própria linha e não vira "letra")
    eraseRegions(img, [{ rect: box, threshold: 14, colorThreshold: 34, force }], []);
    let sum = 0;
    let n = 0;
    for (let y = 784; y < 806; y++)
      for (let x = 100; x < 640; x += 3) {
        sum += img.data[(y * img.width + x) * 4];
        n++;
      }
    expect(Math.abs(sum / n - 222)).toBeLessThanOrEqual(8);
  });
});

describe("barCapGuard (a ponta arredondada das barras)", () => {
  /**
   * Barra de nome falsa como a da Konia (DSK): moldura verde, ponta em arco raso (meia
   * elipse de 14 px de fundo e 27 de altura), contorno preto de 3 px, relevo de 5 px que
   * clareia até o papel e uma letra a partir de x = 66 (onde começa o nome). `side`
   * escolhe de que lado fica a ponta. Devolve também a distância de cada pixel até a borda
   * (0 a 2 é contorno, 3 a 7 relevo).
   */
  function bar(side: "left" | "right" = "left", paperAt: (x: number) => number = () => 215) {
    const c = canvas([40, 120, 70]);
    const cy = 82;
    const edge = (y: number) => 14 * Math.sqrt(Math.max(0, 1 - ((y - cy) / 27) ** 2));
    const dist = (x: number, y: number) => {
      const dy = Math.min(y - 55, 108 - y);
      if (dy < 0) return -1;
      const dx = side === "left" ? x - (60 - edge(y)) : 680 + edge(y) - x;
      const inner = side === "left" ? x > 60 : x < 680;
      return inner ? dy : Math.min(dx, dy);
    };
    c.fill(30, 50, 720, 115, (x, y, ch) => {
      const d = dist(x, y);
      if (d < 0) return [40, 120, 70][ch];
      if (d < 3) return 25;
      const p = paperAt(x);
      if (d < 8) return Math.round(120 + ((p - 120) * (d - 3)) / 5);
      return p;
    });
    // primeira letra (um "I" grosso) no começo do nome, longe da ponta
    if (side === "left") c.fill(66, 66, 78, 98, [20, 20, 20]);
    return { ...c, dist };
  }
  const covered = (guard: { x0: number; y0: number; x1: number; y1: number }[], x: number, y: number) =>
    guard.some((g) => x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y1);
  const lum = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4 + 1];

  it("cobre o contorno e o relevo da curva, linha a linha, sem chegar à letra", () => {
    const { img, dist } = bar();
    const rect = { x0: 50, y0: 58, x1: 688, y1: 106 };
    const guard = barCapGuard(img, rect, "left");
    let checked = 0;
    for (let y = 63; y < 101; y++)
      for (let x = 50; x < 66; x++)
        if (dist(x, y) >= 0 && dist(x, y) < 5) {
          expect(covered(guard, x, y), `(${x}, ${y})`).toBe(true);
          checked++;
        }
    expect(checked).toBeGreaterThan(60);
    for (const g of guard) expect(g.x1).toBeLessThanOrEqual(62);
  });

  it("do lado direito (barra de nome sem custo de mana) também", () => {
    const { img, dist } = bar("right");
    const rect = { x0: 50, y0: 58, x1: 692, y1: 106 };
    const guard = barCapGuard(img, rect, "right");
    let checked = 0;
    for (let y = 63; y < 101; y++)
      for (let x = 676; x < 692; x++)
        if (dist(x, y) >= 0 && dist(x, y) < 5) {
          expect(covered(guard, x, y), `(${x}, ${y})`).toBe(true);
          checked++;
        }
    expect(checked).toBeGreaterThan(40);
    for (const g of guard) expect(g.x0).toBeGreaterThanOrEqual(681);
  });

  it("papel com degradê forte: para antes da letra que começa perto da ponta (o R do Rumble, PSTX)", () => {
    // papel mais escuro na ponta (160) que no meio da barra (220), e uma letra em x = 58
    const { img, fill } = bar("left", (x) => (x < 100 ? 160 : 220));
    fill(58, 70, 63, 95, [20, 20, 20]);
    const guard = barCapGuard(img, { x0: 50, y0: 58, x1: 688, y1: 106 }, "left");
    for (let y = 70; y < 95; y++) for (let x = 58; x < 63; x++) expect(covered(guard, x, y), `(${x}, ${y})`).toBe(false);
  });

  it("linha de sombra no pé da barra: o contorno logo depois da primeira coluna (Espectrolume Errante, CLU)", () => {
    // papel 200 e, na última linha, a sombra do pé (97) com o contorno da curva em 51 e 52
    const { img, fill } = canvas([200, 200, 200]);
    fill(40, 104, 700, 106, [97, 97, 97]);
    fill(50, 104, 51, 106, [84, 84, 84]);
    fill(51, 104, 53, 106, [10, 10, 10]);
    const guard = barCapGuard(img, { x0: 50, y0: 58, x1: 688, y1: 106 }, "left");
    expect(covered(guard, 51, 104)).toBe(true);
    expect(covered(guard, 52, 104)).toBe(true);
  });

  it("apagando a barra, a ponta fica como está (Konia, Monstrinha de Resgate, DSK)", () => {
    const { img } = bar();
    const rect = { x0: 50, y0: 58, x1: 688, y1: 106 };
    const guard = barCapGuard(img, rect, "left");
    eraseRegions(img, [{ rect, threshold: 28, fill: "rows" }], [], [], guard);
    // contorno nos cantos de cima e de baixo da curva, ainda escuros
    expect(lum(img, 50, 64)).toBeLessThan(60);
    expect(lum(img, 50, 100)).toBeLessThan(60);
    // e a letra saiu
    expect(lum(img, 72, 82)).toBeGreaterThan(180);
  });

  it("sem a proteção, o contorno dos cantos vira papel (o defeito antigo)", () => {
    const { img } = bar();
    const rect = { x0: 50, y0: 58, x1: 688, y1: 106 };
    eraseRegions(img, [{ rect, threshold: 28, fill: "rows" }], []);
    expect(Math.max(lum(img, 50, 64), lum(img, 50, 100))).toBeGreaterThan(120);
  });

  it('sem borda, a letra branca colada na ponta fica de fora dela (o "S" do Regrowth, SLD 866)', () => {
    // barra escura de grão forte (70 a 110) com a arte mais escura (30) no meio da linha, e a
    // primeira letra em x = 57 (borda suavizada em 57, branca de 58 a 62). Nada perto da
    // ponta parecia papel, e ela ia até 61, por cima do "S"
    const { img, fill } = canvas([20, 20, 20]);
    fill(40, 590, 700, 636, (x, y, c) => 90 + noise(x, y, c));
    fill(250, 590, 560, 636, [30, 30, 30]);
    fill(57, 604, 58, 626, [150, 150, 150]);
    fill(58, 604, 63, 626, [250, 250, 250]);
    const rect = { x0: 50, y0: 590, x1: 560, y1: 636 };
    const guard = barCapGuard(img, rect, "left", true);
    for (let y = 604; y < 626; y++) for (let x = 57; x < 63; x++) expect(covered(guard, x, y), `(${x}, ${y})`).toBe(false);
    // sem a regra das letras brancas (moldura comum), a ponta passava por cima (o defeito antigo)
    const old = barCapGuard(img, rect, "left");
    expect(old.some((g) => g.y0 >= 604 && g.y0 < 626 && g.x1 > 58)).toBe(true);
  });

  it("a ponta não semeia a máscara: a folga dela não passa da proteção", () => {
    const { img } = bar();
    const rect = { x0: 50, y0: 58, x1: 688, y1: 106 };
    const guard = barCapGuard(img, rect, "left");
    const y = 66;
    const end = Math.max(...guard.filter((g) => g.y0 === y).map((g) => g.x1));
    const w = rect.x1 - rect.x0;
    const seeded = textMask(img, rect, 28, guard, 0, "dark", true);
    const unseeded = textMask(img, rect, 28, guard, 0, "dark", true, true, guard);
    // só protegida, a folga do contorno entra no papel logo depois da ponta
    expect(seeded[(y - rect.y0) * w + end - rect.x0]).toBe(1);
    expect(unseeded[(y - rect.y0) * w + end - rect.x0]).toBe(0);
  });
});
