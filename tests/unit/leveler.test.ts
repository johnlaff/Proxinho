import { describe, expect, it } from "vitest";
import { LEVELER, levelerBoxes, levelerErase, levelerFrame, levelerText, levelerWords, levelerWordSpots } from "../../src/engine/leveler";

const W = 745;
const H = 1040;

/**
 * Uma caixa de níveis: três faixas de papel, cada uma mais escura que a de cima, a caixa de P/R
 * de cada faixa (o contorno, `ptInk`, a partir de `ptX`), a palavra do selo ("LEVEL") de cada
 * nível, em `wordAt` linhas abaixo do começo da faixa, e o filete claro do pé da caixa, `edge`
 * linhas depois da medida.
 */
function card({
  frame2003 = true,
  papers = [235, 215, 200],
  ptX = frame2003 ? 553 : 576,
  ptInk = frame2003 ? 40 : 120,
  wordAt = frame2003 ? [25, 24] : [33, 38],
  wordH = frame2003 ? 12 : 9,
  steps = true,
  edge = 1,
}: {
  frame2003?: boolean;
  papers?: number[];
  ptX?: number;
  ptInk?: number;
  wordAt?: number[];
  wordH?: number;
  steps?: boolean;
  edge?: number | null;
} = {}) {
  const geo = frame2003 ? LEVELER["2003"] : LEVELER.m15;
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const set = (x: number, y: number, v: number) => {
    data.set([v, v, v, 255], (y * W + x) * 4);
  };
  const bands = [geo.top, ...geo.rows, geo.bottom];
  for (let y = 0; y < H; y++) {
    const i = bands.findIndex((b, j) => j < 3 && y >= b && y < bands[j + 1]);
    const v = i < 0 ? 30 : steps ? papers[i] : papers[0];
    for (let x = 0; x < W; x++) set(x, y, v);
  }
  if (edge !== null) for (let y = geo.bottom + edge; y < geo.bottom + edge + 4; y++) for (let x = 0; x < W; x++) set(x, y, 245);
  // as caixas de P/R: o contorno à esquerda, no meio de cada faixa
  for (let j = 0; j < 3; j++) for (let y = bands[j] + 8; y < bands[j + 1] - 8; y++) for (let x = ptX; x < ptX + 3; x++) set(x, y, ptInk);
  // a palavra do selo: letras escuras de x 90 a 130 (com vãos entre elas)
  geo.rows.forEach((r, i) => {
    for (let y = r + wordAt[i]; y <= r + wordAt[i] + wordH; y++) for (let x = 90; x < 130; x++) if (x % 8 < 3) set(x, y, 20);
  });
  return img;
}

describe("levelerFrame", () => {
  it("acha as faixas e as caixas de P/R na moldura de 2003", () => {
    const f = levelerFrame(card(), true);
    expect(f).not.toBeNull();
    expect(f!.rows).toEqual([745, 839]);
    expect(f!.pt).toEqual([553, 553, 553]);
    // a palavra do selo, medida (2 px mais baixa que a medida fixa, como em algumas coleções)
    expect(levelerFrame(card({ wordAt: [27, 26] }), true)!.words).toEqual([
      [772, 784],
      [865, 877],
    ]);
  });

  it("na moldura atual, com o contorno cinza da caixa de P/R", () => {
    const f = levelerFrame(card({ frame2003: false }), false);
    expect(f).not.toBeNull();
    expect(f!.rows).toEqual([747, 848]);
    expect(f!.pt).toEqual([576, 576, 576]);
    expect(f!.words).toEqual([
      [780, 789],
      [886, 895],
    ]);
  });

  it("sem as mudanças de tom ou sem as caixas de P/R, não é a moldura dos níveis", () => {
    expect(levelerFrame(card({ steps: false }), true)).toBeNull();
    // o contorno da caixa de P/R pouco mais escuro que o papel
    expect(levelerFrame(card({ ptInk: 200 }), true)).toBeNull();
    // a caixa de P/R da moldura atual, procurada na de 2003, fica fora da busca
    expect(levelerFrame(card({ ptX: 600 }), true)).toBeNull();
  });
});

describe("levelerText", () => {
  const MAIN =
    "Subir de nível {W} ({W}: Coloque um marcador de nível nesta criatura. Suba de nível somente quando puder jogar um feitiço.)";

  it("parte o texto na faixa do alto e nos dois níveis, com o selo e o P/R de cada um", () => {
    expect(levelerText(`${MAIN}\nNÍVEL 2-6\n3/3\nIniciativa\nNÍVEL 7+\n4/4\nGolpe duplo`)).toEqual({
      main: MAIN,
      levels: [
        { range: "2-6", pt: "3/3", text: "Iniciativa" },
        { range: "7+", pt: "4/4", text: "Golpe duplo" },
      ],
      italic: [[], [], []],
    });
    // um nível sem habilidade (Zulaport Enforcer, ROE 133)
    const zulaport = levelerText(
      `${MAIN}\nNÍVEL 1-2\n3/3\nNÍVEL 3+\n5/5\nImpositor de Zulaport só pode ser bloqueado por criaturas pretas.`,
    );
    expect(zulaport?.levels.map((l) => l.text)).toEqual(["", "Impositor de Zulaport só pode ser bloqueado por criaturas pretas."]);
    // as palavras de habilidade contadas em cada faixa
    expect(levelerText(`${MAIN}\nNÍVEL 1-4\n1/2\nA — x\nNÍVEL 5+\n1/4\nVoar\nB — y`, [3, 7])?.italic).toEqual([[], [0], [1]]);
  });

  it("fora da forma dos níveis, o texto não bate com a moldura", () => {
    expect(levelerText(`${MAIN}\nNÍVEL 2-6\n3/3\nIniciativa`)).toBeNull();
    expect(levelerText(`${MAIN}\nNÍVEL 2-6\nIniciativa\nNÍVEL 7+\n4/4`)).toBeNull();
    // o marcador do Arena, sem passar pelo pipeline (Hexdrinker)
    expect(levelerText("Subir de nível {1}\nNÍVEL [3-7] [4/4] [Proteção contra mágicas instantâneas]")).toBeNull();
    expect(levelerText(null)).toBeNull();
  });
});

describe("caixas dos níveis", () => {
  const f = levelerFrame(card(), true)!;

  it("o texto de cada faixa vai do selo (ou da beira) até a caixa de P/R", () => {
    expect(levelerBoxes(f, 72)).toEqual([
      { x0: 72, y0: 656, x1: 543, y1: 742 },
      { x0: 187, y0: 748, x1: 543, y1: 836 },
      { x0: 187, y0: 842, x1: 543, y1: 928 },
    ]);
    // o selo da coleção que sobe para dentro da última faixa (moldura atual)
    expect(levelerBoxes(f, 72, 920)[2].y1).toBe(916);
  });

  it("o apagamento vai de uma mudança de tom à outra e para no pé medido do papel", () => {
    const [main, first, last] = levelerErase(f, 64);
    expect(main).toEqual({ x0: 64, y0: 655, x1: 550, y1: 744 });
    expect(first.y0).toBe(746);
    expect(last).toEqual({ x0: 185, y0: 840, x1: 550, y1: 932 });
    // o filete claro do pé 1 px antes e 1 px depois (Beastbreaker of Bala Ged, ROE 178, e Echo
    // Mage, C13 43): passando dele, saía pintado da cor do papel
    expect(levelerErase(levelerFrame(card({ edge: 0 }), true)!, 64)[2].y1).toBe(931);
    expect(levelerErase(levelerFrame(card({ edge: 2 }), true)!, 64)[2].y1).toBe(933);
    // sem o filete, logo depois da medida
    expect(levelerErase(levelerFrame(card({ edge: null }), true)!, 64)[2].y1).toBe(932);
  });

  it("a palavra do selo sai inteira, com o número logo abaixo fora do preenchimento, e o NÍVEL vai na mesma altura", () => {
    const [w] = levelerWords(f);
    expect(w.word).toEqual({ x0: 84, y0: 767, x1: 138, y1: 785 });
    expect(w.number.y0).toBe(786);
    expect(levelerWordSpots(f)[0]).toEqual({ x: 111, base: 783, cap: 13, width: 48 });
  });
});
