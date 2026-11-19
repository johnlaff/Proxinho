import { describe, expect, it } from "vitest";
import {
  SUBTITLE,
  borderlessBox,
  borderlessPtBox,
  borderlessStamp,
  boxDividers,
  letterBandCenter,
  lightBorderlessBox,
  screenNoise,
  subtitleLetters,
  subtitleShift,
  whiteTextMask,
} from "../../src/engine/borderless";
import { regrain, tameInvented } from "../../src/engine/erase";
import { ptProtect } from "../../src/engine/geometry";
import { findCardStamp } from "../../src/engine/token";

const W = 745;
const H = 1040;

/** Grão fixo, de −1 a 1 (o mesmo a cada execução). */
const hash = (x: number, y: number, c = 0) => {
  const v = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + c * 37.719) * 43758.5453);
  return (v - Math.floor(v)) * 2 - 1;
};

type Paint = [number, number, number] | ((x: number, y: number, c: number) => number);

function canvas(bg: Paint) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Paint) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) data[i + ch] = typeof c === "function" ? c(x, y, ch) : c[ch];
        data[i + 3] = 255;
      }
  };
  fill(0, 0, W, H, bg);
  return { img, fill };
}

const at = (img: ImageData, x: number, y: number) => img.data[(y * W + x) * 4];

/** Arte colorida com grão, que passa por trás de tudo. */
const art: Paint = (x, y, c) => [90, 110, 130][c] + 25 * Math.sin(x / 37 + y / 53) + 8 * hash(x, y, c);
/** A arte vista através da caixa escura translúcida. */
const dark: Paint = (x, y, c) => 25 + 5 * hash(x, y, c);
const RIM: [number, number, number] = [170, 170, 170];

/**
 * Moldura sem borda falsa: barra do nome com os dois aros no alto e a caixa de texto com aro
 * (3 px) de x = 50 a 691 e de y = 644 a 958, medidas das amostras de SLD e FDN.
 */
function frame({ title = true, box = true } = {}) {
  const c = canvas(art);
  if (title) {
    c.fill(50, 40, 695, 43, RIM);
    c.fill(50, 100, 695, 103, RIM);
  }
  if (box) {
    c.fill(50, 644, 691, 958, RIM);
    c.fill(53, 647, 688, 955, dark);
  }
  return c;
}

describe("borderlessBox", () => {
  it("acha a caixa por dentro do aro", () => {
    const box = borderlessBox(frame().img);
    expect(box).not.toBeNull();
    // por dentro do aro de cada lado, sem pegar a arte de fora
    expect(box!.x0).toBeGreaterThanOrEqual(53);
    expect(box!.x0).toBeLessThanOrEqual(59);
    expect(box!.x1).toBeGreaterThanOrEqual(684);
    expect(box!.x1).toBeLessThanOrEqual(688);
    expect(box!.y0).toBeGreaterThanOrEqual(647);
    expect(box!.y0).toBeLessThanOrEqual(650);
    expect(box!.y1).toBeGreaterThanOrEqual(950);
    expect(box!.y1).toBeLessThanOrEqual(955);
  });

  it("sem a caixa com aro não é a moldura padrão (texto solto sobre a arte, TLE)", () => {
    const { img, fill } = frame({ box: false });
    for (let x = 100; x < 600; x += 12) fill(x, 720, x + 4, 744, [240, 240, 240]);
    expect(borderlessBox(img)).toBeNull();
  });

  it("sem a barra do nome no alto também não (terrenos Stellar Sights de Edge of Eternities)", () => {
    // a caixa tem aro, mas o nome fica logo acima dela e o tipo dentro: o inglês ficava
    expect(borderlessBox(frame({ title: false }).img)).toBeNull();
  });
});

describe("whiteTextMask", () => {
  const rect = { x0: 57, y0: 648, x1: 684, y1: 952 };
  const inMask = (m: Uint8Array, x: number, y: number) => m[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];

  it("leva junto o contorno escuro colado nas letras (Shards of Narsil, LTC)", () => {
    const { img, fill } = canvas([20, 20, 20]);
    for (let x = 100; x < 600; x += 20) {
      fill(x, 700, x + 5, 720, [240, 240, 240]);
      fill(x + 5, 700, x + 7, 720, [80, 80, 80]);
      fill(x + 7, 700, x + 9, 720, [2, 2, 2]);
    }
    const m = whiteTextMask(img, rect);
    expect(inMask(m, 102, 710)).toBe(1);
    // o contorno, 3 a 4 px depois do fim da letra
    expect(inMask(m, 108, 710)).toBe(1);
    // o fundo longe da letra, não
    expect(inMask(m, 114, 710)).toBe(0);
  });

  it("marca as letras brancas e deixa a arte vista através da caixa", () => {
    const { img, fill } = frame();
    // arte agitada atrás da caixa, mas escurecida por ela (robôs do Ultron, MSH)
    fill(400, 700, 600, 800, (x, y, c) => 50 + 30 * Math.sin(x / 5) * Math.cos(y / 7) + 4 * c);
    for (let x = 100; x < 300; x += 12) fill(x, 720, x + 4, 744, [240, 240, 240]);
    const m = whiteTextMask(img, rect);
    expect(inMask(m, 102, 730)).toBe(1);
    expect(inMask(m, 500, 750)).toBe(0);
    expect(inMask(m, 350, 850)).toBe(0);
  });

  it("com arte cinza atrás de metade da caixa, só as letras entram (Adult Gold Dragon, AFR 297)", () => {
    const { img, fill } = frame();
    // metade esquerda vermelha escura, metade direita cinza com desenho (de 100 a 165 tons)
    fill(57, 648, 360, 952, (x, y, c) => [130, 55, 45][c] + 6 * hash(x, y, c));
    fill(360, 648, 684, 952, (x, y) => 132 + 22 * Math.sin(x / 9) * Math.cos(y / 11) + 8 * hash(x, y));
    for (let x = 100; x < 330; x += 12) fill(x, 800, x + 4, 824, [240, 240, 240]);
    const m = whiteTextMask(img, rect, [], 110, true);
    expect(inMask(m, 102, 810)).toBe(1);
    let gray = 0;
    for (let y = 660; y < 940; y++) for (let x = 400; x < 670; x++) gray += inMask(m, x, y);
    expect(gray / (280 * 270)).toBeLessThan(0.01);
  });

  it("traço claro comprido é desenho da moldura, não letra (aro rente ao topo, Rivendell HOC; aro em volta do selo de LTR)", () => {
    const { img, fill } = frame();
    fill(80, 652, 640, 654, [235, 235, 235]);
    for (let x = 100; x < 300; x += 12) fill(x, 720, x + 4, 744, [240, 240, 240]);
    const m = whiteTextMask(img, rect);
    expect(inMask(m, 300, 653)).toBe(0);
    expect(inMask(m, 102, 730)).toBe(1);
  });

  it("o miolo escuro de um símbolo de mana entra junto com o círculo", () => {
    const { img, fill } = frame();
    // círculo claro de 36 px com desenho escuro no meio
    fill(200, 800, 236, 836, (x, y) => (Math.hypot(x - 218, y - 818) < 18 ? 230 : 25));
    fill(212, 812, 224, 824, [30, 30, 30]);
    const m = whiteTextMask(img, rect);
    expect(inMask(m, 218, 818)).toBe(1);
  });

  it("não marca o que está protegido", () => {
    const { img, fill } = frame();
    fill(600, 900, 640, 940, [240, 240, 240]);
    const m = whiteTextMask(img, rect, [{ x0: 590, y0: 890, x1: 650, y1: 952 }]);
    expect(inMask(m, 620, 920)).toBe(0);
  });
});

describe("lightBorderlessBox", () => {
  it("caixa clara (o brilho dourado do Fabled Passage da Secret Lair) não tem como receber letra branca", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 952 };
    expect(lightBorderlessBox(img, box)).toBe(false);
    fill(53, 647, 688, 955, (x, y, c) => [200, 175, 110][c] + 6 * hash(x, y, c));
    expect(lightBorderlessBox(img, box)).toBe(true);
  });

  it("basta uma parte grande clara: a metade esquerda do foil do Simian Spirit Guide (SLD 1548★)", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 952 };
    // degradê claro (165 a 140) nos 40% da esquerda e escuro no resto: a mediana fica abaixo de 150
    fill(53, 647, 688, 955, (x, y, c) => {
      const base = x < 300 ? 165 - (x - 53) / 10 : 50;
      return base + [4, -2, 6][c] + 5 * hash(x, y, c);
    });
    // letras brancas por cima, nas duas metades
    for (let y = 700; y < 900; y += 34) for (let x = 80; x < 640; x += 11) fill(x, y, x + 4, y + 22, [245, 245, 245]);
    expect(lightBorderlessBox(img, box)).toBe(true);
  });

  it("uns poucos clarões da arte atrás da caixa escura não bastam", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 952 };
    // duas luzes da arte (uns 4% da caixa) e o texto branco denso
    fill(560, 700, 640, 760, [215, 205, 170]);
    fill(90, 860, 150, 920, [210, 210, 200]);
    for (let y = 700; y < 900; y += 34) for (let x = 80; x < 640; x += 11) fill(x, y, x + 4, y + 22, [245, 245, 245]);
    expect(lightBorderlessBox(img, box)).toBe(false);
  });
});

describe("screenNoise", () => {
  const box = { x0: 57, y0: 648, x1: 684, y1: 952 };

  it("arte lisa ou de grão fino fica abaixo do limite", () => {
    expect(screenNoise(frame().img, box)).toBeLessThan(16);
  });

  it("retícula grossa da gravura (Shivan Dragon da Secret Lair) passa do limite", () => {
    const { img, fill } = frame();
    // pontos de 2 px de 20 a 100 tons, soltos, como a retícula impressa (na gravura, 22 de ruído)
    fill(53, 647, 688, 955, (x, y) => 60 + 40 * hash(x >> 1, y >> 1));
    for (let x = 100; x < 300; x += 12) fill(x, 720, x + 4, 744, [240, 240, 240]);
    expect(screenNoise(img, box)).toBeGreaterThan(16);
  });
});

describe("borderlessStamp", () => {
  it("cobre o selo ligado ao pé da caixa, e não o ponto final ao lado dele (Tellah, FIN)", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 955 };
    // triângulo dourado que sobe do aro de baixo para dentro da caixa
    for (let y = 935; y < 955; y++)
      for (let x = 350; x < 396; x++)
        if (Math.abs(x - 372) < (y - 935) * 1.2) {
          const i = (y * W + x) * 4;
          img.data[i] = 200;
          img.data[i + 1] = 170;
          img.data[i + 2] = 60;
        }
    // ponto final da última linha, solto do selo, dentro do retângulo com folga de findStamp
    fill(330, 926, 335, 931, [240, 240, 240]);
    const rects = borderlessStamp(img, { x0: 320, y0: 927, x1: 426, y1: 955 }, box);
    const covers = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(covers(372, 950)).toBe(true);
    expect(covers(372, 945)).toBe(true);
    expect(covers(332, 929)).toBe(false);
    expect(covers(420, 950)).toBe(false);
  });
});

describe("borderlessStamp com letra encostada no aro", () => {
  it("o aro em volta do selo fica; o fim do flavor encostado nele, não (Mana Crypt, SPG)", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 955 };
    // aro verde, simétrico em volta do meio da carta (x = 372), subindo do pé da caixa
    fill(280, 945, 465, 955, [70, 170, 70]);
    fill(352, 935, 393, 955, [200, 170, 60]);
    // "l." do fim da última linha, encostado no aro só do lado esquerdo
    fill(290, 922, 293, 945, [240, 240, 240]);
    fill(297, 940, 300, 945, [240, 240, 240]);
    const rects = borderlessStamp(img, { x0: 250, y0: 920, x1: 495, y1: 955 }, box);
    const covers = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(covers(372, 940)).toBe(true);
    expect(covers(300, 950)).toBe(true);
    expect(covers(450, 950)).toBe(true);
    expect(covers(291, 930)).toBe(false);
    expect(covers(298, 941)).toBe(false);
  });
});

describe("borderlessStamp com letra colada na arte simétrica", () => {
  it("a folga em volta da arte que sobe dos dois lados do selo não guarda o ponto final ao lado (Roaming Throne, LCI 344)", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 955 };
    for (let y = 935; y < 955; y++)
      for (let x = 350; x < 396; x++)
        if (Math.abs(x - 372) < (y - 935) * 1.2) {
          const i = (y * W + x) * 4;
          [img.data[i], img.data[i + 1], img.data[i + 2]] = [200, 170, 60];
        }
    // faixas rosa da arte, simétricas em volta do meio da carta (x = 372), do pé da caixa para cima
    fill(320, 915, 330, 955, [190, 110, 140]);
    fill(415, 915, 425, 955, [190, 110, 140]);
    // ponto final da última linha, colado no lado de fora da faixa da esquerda, com a borda
    // suavizada em cinza
    fill(316, 934, 320, 939, [150, 150, 150]);
    fill(317, 935, 320, 938, [245, 245, 245]);
    const rects = borderlessStamp(img, { x0: 300, y0: 925, x1: 445, y1: 955 }, box);
    const covers = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(covers(372, 950)).toBe(true);
    expect(covers(320, 945)).toBe(true);
    for (const x of [317, 318, 319]) expect(covers(x, 936)).toBe(false);
    // a borda cinza do ponto também sai (senão ficava um "c" cinza)
    expect(covers(316, 936)).toBe(false);
    expect(covers(318, 934)).toBe(false);
  });

  it("o brilho branco de um lado só do aro claro continua guardado (Adult Gold Dragon, AFR 297)", () => {
    const { img } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 955 };
    for (let y = 925; y < 955; y++)
      for (let x = 330; x < 415; x++) {
        const r = Math.hypot(x - 372, y - 966);
        const i = (y * W + x) * 4;
        // aro claro e simétrico, com o miolo do selo
        if (r >= 20 && r <= 24) [img.data[i], img.data[i + 1], img.data[i + 2]] = [190, 180, 175];
        else if (r < 20) [img.data[i], img.data[i + 1], img.data[i + 2]] = [200, 170, 60];
        // brilho quase branco por fora do aro, só do lado direito (a arte atrás é outra)
        else if (r <= 25.5 && x > 380) img.data[i] = img.data[i + 1] = img.data[i + 2] = 215;
      }
    const rects = borderlessStamp(img, { x0: 300, y0: 925, x1: 445, y1: 955 }, box);
    const covers = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(covers(372, 950)).toBe(true);
    // pontos do brilho, a 25 px do centro do aro
    for (const [x, y] of [
      [390, 950],
      [394, 954],
    ])
      expect(covers(x, y)).toBe(true);
  });

  it("pingo branco de 1 px ao lado de parte escura do selo continua guardado (Pteranodonte, REX 44)", () => {
    const { img } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 955 };
    // miolo escuro do selo, simétrico, do pé da caixa para cima
    for (let y = 935; y < 955; y++)
      for (let x = 340; x < 405; x++)
        if (Math.abs(x - 372) < (y - 935) * 1.6) {
          const i = (y * W + x) * 4;
          [img.data[i], img.data[i + 1], img.data[i + 2]] = [120, 20, 20];
        }
    // grão quase branco do aro em degradê, de um lado só, encostado no miolo
    const speck = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 230;
    };
    speck(390, 946);
    speck(397, 950);
    const rects = borderlessStamp(img, { x0: 300, y0: 925, x1: 445, y1: 955 }, box);
    const covers = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(covers(372, 950)).toBe(true);
    expect(covers(390, 946)).toBe(true);
    expect(covers(397, 950)).toBe(true);
  });
});

describe("borderlessStamp com arte lisa entre o aro e a última linha", () => {
  it("a enchente não sobe pela arte lisa nem por uma beira de um lado só até as letras (Underworld Breach, SLD 2045)", () => {
    const { img, fill } = frame();
    const box = { x0: 57, y0: 648, x1: 684, y1: 955 };
    // faixa vinho lisa da arte, fora do centro (x = 300 a 470; o meio da carta é 372)
    fill(300, 931, 470, 955, (x, y, c) => [98, 64, 66][c] + 2 * hash(x, y, c));
    // aro vermelho em arco em volta do selo, com o miolo holográfico (sem simetria)
    for (let y = 930; y < 955; y++)
      for (let x = 330; x < 415; x++) {
        const r = Math.hypot(x - 372, y - 966);
        const i = (y * W + x) * 4;
        if (r >= 20 && r <= 24) [img.data[i], img.data[i + 1], img.data[i + 2]] = [200, 60, 50];
        else if (r < 20) img.data[i] = img.data[i + 1] = img.data[i + 2] = 150 + 40 * hash(x, y);
      }
    // última linha de texto, em traços brancos simétricos em volta do meio por acaso
    for (let x = 80; x < 476; x += 7) fill(x, 916, x + 4, 931, [245, 245, 245]);
    const rects = borderlessStamp(img, { x0: 245, y0: 914, x1: 489, y1: 955 }, box);
    const covers = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(covers(372, 944)).toBe(true);
    expect(covers(372, 950)).toBe(true);
    expect(covers(355, 952)).toBe(true);
    for (const x of [326, 382, 424]) expect(covers(x + 1, 925)).toBe(false);
  });
});

describe("letterBandCenter", () => {
  it("acha o nome em branco numa barra clara com brilho, uns 8 px acima do padrão (Ancient Gold Dragon, CLB)", () => {
    const { img, fill } = canvas(art);
    // barra cinza-clara com uma faixa de brilho no meio e os aros de cima e de baixo
    fill(50, 45, 695, 110, [168, 168, 168]);
    fill(50, 65, 695, 84, [205, 205, 205]);
    fill(50, 45, 695, 48, [235, 235, 235]);
    fill(50, 97, 695, 101, [25, 25, 25]);
    // letras brancas de y = 64 a 84 (o padrão é de 72 a 92)
    for (let x = 80; x < 400; x += 14) fill(x, 64, x + 5, 84, [250, 250, 250]);
    const c = letterBandCenter(img, { x0: 70, y0: 45, x1: 420, y1: 120 });
    expect(c).not.toBeNull();
    expect(Math.abs(c! - 74)).toBeLessThanOrEqual(2);
  });

  it("sem letras não acha faixa", () => {
    const { img, fill } = canvas([40, 40, 40]);
    fill(50, 97, 695, 101, [200, 200, 200]);
    expect(letterBandCenter(img, { x0: 70, y0: 45, x1: 420, y1: 120 })).toBeNull();
  });
});

describe("subtitleLetters", () => {
  /** Aba escura do nome de jogo embaixo da barra do nome, com o nome em inglês em branco. */
  function tab(letters = true) {
    const c = canvas(art);
    c.fill(160, 118, 585, 143, [14, 14, 16]);
    if (letters) for (let x = 233; x < 513; x += 9) c.fill(x, 121, x + 4, 135, [235, 235, 235]);
    return c;
  }

  it("dá as pontas do nome em inglês na aba (Tinybones, the Pickpocket, no Skeletor da Secret Lair)", () => {
    const r = subtitleLetters(tab().img);
    expect(r).not.toBeNull();
    expect(r!.x0).toBeGreaterThanOrEqual(225);
    expect(r!.x0).toBeLessThanOrEqual(233);
    expect(r!.x1).toBeGreaterThanOrEqual(512);
    expect(r!.x1).toBeLessThanOrEqual(520);
    expect([r!.y0, r!.y1]).toEqual([118, 143]);
  });

  it("aceita arte clara atrás de parte da aba e deixa de fora as luzes longe das letras (Awesome Android, MSC)", () => {
    const c = tab();
    // a mão cinza atrás do pé das letras: a mediana dessas linhas passa de 110
    c.fill(160, 131, 585, 135, (x, y, ch) => (x % 9 < 4 && x >= 233 && x < 513 ? 235 : 118 + 4 * hash(x, y, ch)));
    // uma lâmpada da arte no fim da aba, longe do nome, e uma folha cinza encostada nele
    c.fill(556, 122, 568, 134, [240, 230, 190]);
    c.fill(186, 126, 231, 142, [136, 136, 136]);
    const r = subtitleLetters(c.img);
    expect(r).not.toBeNull();
    expect(r!.x0).toBeGreaterThanOrEqual(225);
    expect(r!.x1).toBeLessThanOrEqual(520);
    // a folha cinza dentro do retângulo não vira letra
    const rect = { x0: 186, y0: 118, x1: 520, y1: 143 };
    const mask = whiteTextMask(c.img, rect, [], SUBTITLE.ink);
    const w = rect.x1 - rect.x0;
    expect(mask[(132 - rect.y0) * w + (205 - rect.x0)]).toBe(0);
    expect(mask[(128 - rect.y0) * w + (235 - rect.x0)]).toBe(1);
  });

  it("acompanha a aba mais alta pelo aro de baixo, sem pegar a lua branca abaixo dele (Yojimbo, SLD 7004)", () => {
    /** Aba de retícula clara com aros escuros; `dy` desloca tudo da medida padrão. */
    function rimmed(dy: number) {
      const c = canvas(art);
      c.fill(160, 116 + dy, 585, 118 + dy, [12, 12, 12]);
      c.fill(160, 118 + dy, 585, 143 + dy, (x, y, ch) => 100 + 12 * hash(x, y, ch));
      c.fill(160, 143 + dy, 585, 145 + dy, [30, 30, 30]);
      c.fill(160, 145 + dy, 585, 150 + dy, [240, 240, 240]);
      for (let x = 233; x < 513; x += 9) c.fill(x, 121 + dy, x + 4, 135 + dy, [235, 235, 235]);
      return c.img;
    }
    expect(subtitleShift(rimmed(0))).toBe(0);
    expect(subtitleShift(rimmed(-3))).toBe(-3);
    const r = subtitleLetters(rimmed(-3));
    expect(r).not.toBeNull();
    expect([r!.y0, r!.y1]).toEqual([115, 140]);
  });

  it("acompanha a letra tingida pela digitalização (lilás no Shards of Narsil, LTC)", () => {
    const c = canvas(art);
    c.fill(160, 118, 585, 143, [40, 36, 48]);
    for (let x = 233; x < 513; x += 9) c.fill(x, 121, x + 4, 135, [175, 150, 195]);
    const r = subtitleLetters(c.img);
    expect(r).not.toBeNull();
    expect(r!.x0).toBeLessThanOrEqual(233);
    expect(r!.x1).toBeGreaterThanOrEqual(512);
    expect(r!.ink).toBeLessThan(140);
    const rect = { x0: 225, y0: 118, x1: 520, y1: 143 };
    const mask = whiteTextMask(c.img, rect, [], r!.ink);
    expect(mask[(128 - rect.y0) * (rect.x1 - rect.x0) + (235 - rect.x0)]).toBe(1);
  });

  it("pega o nome inteiro quando o arco-íris do foil deixa uma metade escura (Dr. Ian Malcolm, SLD)", () => {
    const c = canvas(art);
    c.fill(160, 118, 585, 143, [40, 36, 48]);
    // metade esquerda do nome num tom escuro do arco-íris, abaixo do limiar; a direita, clara
    for (let x = 233; x < 513; x += 9) c.fill(x, 121, x + 4, 135, x < 372 ? [120, 95, 150] : [235, 235, 235]);
    const r = subtitleLetters(c.img);
    expect(r).not.toBeNull();
    expect(r!.x0).toBeLessThanOrEqual(233);
    expect(r!.x1).toBeGreaterThanOrEqual(512);
  });

  it("sem aba escura ou sem letras, não há o que trocar", () => {
    expect(subtitleLetters(tab(false).img)).toBeNull();
    const { img, fill } = canvas([200, 200, 200]);
    for (let x = 233; x < 513; x += 9) fill(x, 121, x + 4, 135, [250, 250, 250]);
    expect(subtitleLetters(img)).toBeNull();
  });
});

describe("boxDividers", () => {
  it("acha o fio claro entre as regras e o flavor, e não as linhas de texto (Thoughtcast, SPG)", () => {
    const c = frame();
    // duas linhas de texto branco e, entre elas e o flavor, o fio claro de 2 px
    for (const top of [700, 730, 830])
      for (let x = 70; x < 600; x += 12) {
        c.fill(x, top, x + 3, top + 16, [240, 240, 240]);
        c.fill(x, top + 7, x + 9, top + 9, [240, 240, 240]);
      }
    c.fill(53, 800, 688, 802, [70, 70, 70]);
    const rows = boxDividers(c.img, { x0: 56, y0: 650, x1: 685, y1: 952 });
    expect(rows).toEqual([800, 801]);
  });
});

describe("regrain", () => {
  it("devolve o grão da vizinhança a um remendo liso", () => {
    const { img, fill } = canvas((x, y) => 100 + (((x >> 1) + (y >> 1)) % 2 ? 25 : -25));
    fill(80, 40, 140, 80, [100, 100, 100]);
    const rect = { x0: 0, y0: 0, x1: 240, y1: 120 };
    const hole = new Uint8Array(W * H);
    for (let y = 40; y < 80; y++) hole.fill(1, y * W + 80, y * W + 140);
    regrain(img, rect, hole);
    const vals: number[] = [];
    for (let y = 45; y < 75; y++) for (let x = 85; x < 135; x++) vals.push(at(img, x, y));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    expect(Math.abs(mean - 100)).toBeLessThan(8);
    expect(sd).toBeGreaterThan(10);
    // fora do remendo, nada muda
    expect(at(img, 10, 10)).toBe(75);
    expect(at(img, 12, 10)).toBe(125);
  });

  it("não traz a forma da arte de longe: o remendo numa parte lisa fica liso (Molten Duplication, SLC 54)", () => {
    // arte em faixas verticais (60 e 100, de 5 px) com um trecho liso e escuro (30) no meio, e
    // o buraco de uma letra apagada nele, já preenchido de liso. O desvio copiado das faixas
    // deixava a letra listrada
    const { img, fill } = canvas((x) => (Math.floor(x / 5) % 2 ? 100 : 60));
    fill(70, 5, 140, 55, [30, 30, 30]);
    const rect = { x0: 0, y0: 0, x1: 200, y1: 60 };
    const hole = new Uint8Array(W * H);
    for (let y = 25; y < 35; y++) hole.fill(1, y * W + 98, y * W + 112);
    regrain(img, rect, hole);
    let worst = 0;
    for (let y = 25; y < 35; y++) for (let x = 98; x < 112; x++) worst = Math.max(worst, Math.abs(at(img, x, y) - 30));
    expect(worst).toBeLessThanOrEqual(3);
  });
});

describe("tameInvented", () => {
  it("tira o anel de cor que a rede neural inventou na arte escura e calma (o {U} do Dol Amroth, LTC 399)", () => {
    const { img, fill } = canvas((x, y, c) => [38, 53, 41][c] + 4 * hash(x, y, c));
    // buraco de um símbolo apagado, já preenchido pelo modelo com um anel laranja
    const hole = new Uint8Array(W * H);
    for (let y = 60; y < 100; y++)
      for (let x = 100; x < 140; x++) {
        const r = Math.hypot(x - 120, y - 80);
        if (r < 19) hole[y * W + x] = 1;
        const i = (y * W + x) * 4;
        if (r >= 8 && r < 14) [img.data[i], img.data[i + 1], img.data[i + 2]] = [90, 74, 52];
      }
    // uma faixa clara da arte que passa por baixo de outro buraco e segue dos dois lados
    fill(200, 40, 400, 46, [150, 140, 120]);
    for (let y = 30; y < 56; y++) hole.fill(1, y * W + 280, y * W + 320);
    const rect = { x0: 0, y0: 0, x1: 480, y1: 160 };
    tameInvented(img, rect, hole);
    let worst = 0;
    for (let y = 60; y < 100; y++)
      for (let x = 100; x < 140; x++) if (hole[y * W + x]) worst = Math.max(worst, Math.abs(img.data[(y * W + x) * 4] - 38));
    expect(worst).toBeLessThan(12);
    // a faixa da arte fica, e fora dos buracos nada muda
    expect(at(img, 300, 43)).toBe(150);
    expect(at(img, 20, 20)).toBe(Math.round(38 + 4 * hash(20, 20, 0)));
  });
});

describe("findCardStamp", () => {
  it("na sem borda a caixa escura até o pé não passa pela borda preta (Reassembling Skeleton, SLD 1406)", () => {
    const { img, fill } = frame();
    // borda preta abaixo do aro da caixa e o selo claro nela, sem nada aceso dentro da caixa
    fill(0, 958, W, H, [10, 10, 10]);
    fill(340, 960, 405, 985, [180, 180, 180]);
    const stamp = findCardStamp(img, 955);
    expect(stamp).not.toBeNull();
    expect(stamp!.x0).toBeLessThanOrEqual(345);
    expect(stamp!.x1).toBeGreaterThanOrEqual(400);
    // sem o pé da caixa, o selo não é achado (a caixa é escura como a borda)
    expect(findCardStamp(img)).toBeNull();
  });
});

describe("borderlessPtBox", () => {
  it("o ponto final colado na caixa de P/R fica fora da proteção (Shigeki, Jukai Visionary, SLD 2843)", () => {
    // arte clara (tons de bege) no alto da caixa de texto e quase preta no pé; a caixa de P/R
    // verde de 580 a 700, de 924 ao pé, e o ponto final da última linha (569 a 572, 929 a 932)
    const { img, fill } = canvas([18, 16, 14]);
    fill(60, 700, 690, 910, (x, y, c) => 120 - c * 10 + Math.round(6 * hash(x, y, c)));
    fill(580, 924, 700, 958, [40, 110, 70]);
    fill(569, 929, 573, 933, [245, 245, 245]);
    const pt = borderlessPtBox(img);
    expect(pt.left).toBeGreaterThanOrEqual(576);
    expect(pt.left).toBeLessThanOrEqual(580);
    const inside = (x: number, y: number) => ptProtect(pt.top, pt.left).some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    for (const [x, y] of [
      [569, 929],
      [572, 932],
    ])
      expect(inside(x, y)).toBe(false);
    // a caixa continua protegida, desde o lado dela
    expect(inside(590, 940)).toBe(true);
    expect(inside(580, 950)).toBe(true);
  });

  it("o aro claro do lado da caixa fica protegido abaixo do canto arredondado (Mother of Runes, SLD 296)", () => {
    // arte clara, mais escura acima da caixa (o topo medido sai no começo da busca, 905, e
    // fica em 921); a caixa com o topo em 933, o canto de cima arredondado (o lado recua 1 px
    // por linha até 941), contorno escuro em 583 e 584 e aro claro de 585 a 589. Medido logo
    // abaixo do topo, o lado caía na curva (589) e o aro ficava de fora da proteção
    const { img, fill } = canvas([115, 110, 100]);
    fill(600, 895, 700, 933, [60, 55, 50]);
    for (let y = 933; y < 1000; y++) {
      const x = 583 + Math.max(0, 941 - y);
      fill(x, y, x + 2, y + 1, [40, 40, 40]);
      fill(x + 2, y, x + 7, y + 1, [215, 215, 215]);
      fill(x + 7, y, 700, y + 1, [125, 120, 112]);
    }
    const pt = borderlessPtBox(img);
    const inside = (x: number, y: number) => ptProtect(pt.top, pt.left).some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    for (const y of [945, 950, 960]) expect(inside(585, y)).toBe(true);
  });

  it("sem medida (arte igual à caixa), vale o desenho da moldura", () => {
    const { img } = canvas([40, 110, 70]);
    expect(borderlessPtBox(img)).toEqual({ top: 924, left: 578 });
  });
});
