import { describe, expect, it } from "vitest";
import { PROTOTYPE, prototypeBoxes, prototypeErase, prototypeFrame, prototypeText } from "../../src/engine/prototype";

const W = 745;
const H = 1040;

interface Card {
  /** tom da faixa, do fio dela, do papel de baixo e das abas */
  band?: number;
  rim?: number;
  paper?: number;
  tabs?: number;
  /** primeira linha da faixa (660 nas impressões de BRO, 666 na Woodcaller de arte estendida) */
  top?: number;
  /** lados esquerdos da aba do custo e da caixa de P/R do protótipo */
  tab?: number;
  pt?: number;
  /** uma haste de letra escura logo antes da aba, nas linhas do alto (o "h" de "with") */
  stem?: number;
}

/**
 * A caixa do Protótipo: a barra de tipo, o fio de cima da faixa, a faixa com as duas abas à
 * direita, um filete claro, o fio de baixo e o papel.
 */
function card({ band = 175, rim = 70, paper = 228, tabs = 60, top = 660, tab = 574, pt = 582, stem }: Card = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const put = (x: number, y: number, v: number) => {
    data.set([v, v, v, 255], (y * W + x) * 4);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 30;
      if (y >= 590 && y < top - 14) v = 210; // barra de tipo
      else if (y >= top - 14 && y < top - 10) v = 230;
      else if (y >= top - 10 && y < top) v = rim; // fio de cima da faixa
      else if (y >= top && y < top + 100) {
        v = band;
        // as abas: a do custo no alto, a de P/R embaixo dela
        if (x >= tab && x < 700 && y < top + 40) v = tabs;
        if (x >= pt && x < 700 && y >= top + 42) v = tabs;
        if (stem !== undefined && x >= stem && x < stem + 3 && y >= top + 6 && y < top + 30) v = 20;
      } else if (y >= top + 100 && y < top + 102) v = 245; // filete claro
      else if (y >= top + 102 && y < top + 108) v = rim; // fio de baixo
      else if (y >= top + 108 && y < top + 113) v = Math.round(rim + ((paper - rim) * (y - top - 107)) / 6);
      else if (y >= top + 113 && y < 958) v = paper;
      if (x < 46 || x >= 700) v = 30;
      put(x, y, v);
    }
  return img;
}

describe("prototypeFrame", () => {
  it("acha a faixa, o papel depois do fio e as duas abas", () => {
    expect(prototypeFrame(card(), "{1}{W}{W}")).toEqual({ top: 660, bottom: 660 + PROTOTYPE.height, paper: 773, tab: 574, pt: 582 });
    // com dois símbolos a aba do custo começa mais à direita
    expect(prototypeFrame(card({ tab: 607 }), "{3}{R}")?.tab).toBe(607);
    // a arte estendida da Woodcaller tem a caixa 6 px mais baixa
    expect(prototypeFrame(card({ top: 666 }), "{2}{G}{G}")).toMatchObject({ top: 666, paper: 779 });
    // na faixa branca o fio de cima é mais claro que a faixa das outras cores
    expect(prototypeFrame(card({ band: 225, rim: 170, paper: 242, tabs: 160 }), "{1}{W}{W}")?.top).toBe(660);
  });

  it("a aba do custo é procurada pelo número de símbolos: a haste de uma letra antes dela não conta", () => {
    // (a faixa azul do Arcane Proxy de pré-estreia, PBRO 75s: o "h" de "with" a 20 px da aba)
    expect(prototypeFrame(card({ stem: 554 }), "{1}{U}{U}")?.tab).toBe(574);
  });

  it("sem a faixa, sem o fio de baixo ou sem as abas, não é a moldura do Protótipo", () => {
    // caixa inteira de papel (carta comum)
    expect(prototypeFrame(card({ band: 228, rim: 228, tabs: 228 }), "{1}{W}{W}")).toBeNull();
    // sem a aba do custo onde o número de símbolos a põe
    expect(prototypeFrame(card({ tab: 640 }), "{1}{W}{W}")).toBeNull();
    // sem a caixa de P/R
    expect(prototypeFrame(card({ pt: 700 }), "{1}{W}{W}")).toBeNull();
    // sem o custo do protótipo
    expect(prototypeFrame(card(), null)).toBeNull();
  });

  it("acompanha a escala da imagem", () => {
    const big = card();
    const w = 488;
    const h = 680;
    const small = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: "srgb" } as ImageData;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = (Math.floor((y * H) / h) * W + Math.floor((x * W) / w)) * 4;
        small.data.set(big.data.subarray(s, s + 4), (y * w + x) * 4);
      }
    const f = prototypeFrame(small, "{1}{W}{W}");
    expect(f).not.toBeNull();
    expect(Math.abs(f!.top - 660)).toBeLessThanOrEqual(2);
    expect(Math.abs(f!.paper - 773)).toBeLessThanOrEqual(2);
    expect(Math.abs(f!.tab - 574)).toBeLessThanOrEqual(2);
  });
});

describe("prototypeText", () => {
  const BAND =
    "Protótipo (Você pode conjurar esta mágica com custo de mana, cor e tamanho diferentes. Ela permanece com suas habilidades e tipos.)";

  it("o lembrete vai na faixa e o resto no papel", () => {
    expect(prototypeText(`${BAND}\nVoar\nNo início do combate no seu turno…`)).toEqual({
      band: BAND,
      rest: "Voar\nNo início do combate no seu turno…",
      italic: [],
    });
    // sem o lembrete (nenhuma impressa em PT), só a palavra
    expect(prototypeText("Protótipo\nToque mortífero")?.band).toBe("Protótipo");
    // as palavras de habilidade contam as linhas do resto
    expect(prototypeText(`${BAND}\nVoar\nAterragem — Toda vez…`, [2])?.italic).toEqual([1]);
  });

  it("sem o Protótipo na frente, o texto não bate com a moldura", () => {
    // (o texto do Arena como veio, com a palavra junto das outras)
    expect(prototypeText("Protótipo, voar\nNo início do combate…")).toBeNull();
    expect(prototypeText("Voar")).toBeNull();
    expect(prototypeText(null)).toBeNull();
  });
});

describe("caixas do Protótipo", () => {
  const frame = { top: 660, bottom: 758, paper: 773, tab: 574, pt: 582 };

  it("o apagamento da faixa para antes das abas, e o texto dela um pouco antes", () => {
    expect(prototypeErase(frame, 58)).toEqual({ x0: 58, y0: 660, x1: 571, y1: 758 });
    const { band, paper } = prototypeBoxes({ x0: 68, y0: 656, x1: 677, y1: 916 }, frame);
    expect(band).toEqual({ x0: 68, y0: 663, x1: 566, y1: 755 });
    // o papel vai do fio de baixo até a caixa de P/R da carta
    expect(paper).toEqual({ x0: 68, y0: 776, x1: 677, y1: 916 });
    // com a caixa de P/R antes da aba (dois símbolos no custo), vale a caixa
    expect(prototypeErase({ ...frame, tab: 607 }, 58).x1).toBe(579);
  });
});
