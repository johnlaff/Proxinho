import { describe, expect, it } from "vitest";
import { MUTATE, mutateBoxes, mutateRule, mutateText } from "../../src/engine/mutate";

const W = 745;
const H = 1040;

type Color = [number, number, number];

/** A caixa da Mutação: a faixa translúcida (`band`), a sombra até o fio, o fio e o papel. */
function card({ band = 180, rule = 100, paper = 232, ruleAt = 784, ruleRows = 2, shadow = true } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const row = (y: number, v: number) => {
    for (let x = 0; x < W; x++) {
      const c: Color = [v, v, v];
      data.set(c, (y * W + x) * 4);
      data[(y * W + x) * 4 + 3] = 255;
    }
  };
  for (let y = 0; y < H; y++) {
    if (y < 656) row(y, 40);
    else if (y < ruleAt - 8) row(y, band);
    // a sombra escurece até o fio, mais nas últimas linhas
    else if (y < ruleAt) row(y, shadow ? band - Math.max(0, y - (ruleAt - 4)) * 15 : band);
    else if (y < ruleAt + ruleRows) row(y, rule);
    else if (y < 958) row(y, paper);
    else row(y, 20);
  }
  return img;
}

describe("mutateRule", () => {
  it("acha o fio entre a faixa e o papel, com a sombra acima dele na faixa", () => {
    // (as duas linhas da sombra bem mais escuras que a faixa contam como fio)
    expect(mutateRule(card())).toEqual({ top: 782, bottom: 786 });
    // um pouco mais baixo e mais grosso, numa faixa escura
    expect(mutateRule(card({ band: 150, rule: 80, ruleAt: 786, ruleRows: 3 }))).toEqual({ top: 784, bottom: 789 });
  });

  it("sem o fio, ou sem o papel claro depois dele, não é a moldura da Mutação", () => {
    // caixa inteira de papel (carta comum)
    expect(mutateRule(card({ band: 232, rule: 232, shadow: false }))).toBeNull();
    // arte atrás da caixa inteira (as do MTGO): o "papel" é escuro
    expect(mutateRule(card({ paper: 120, rule: 70 }))).toBeNull();
    // uma linha só um pouco mais escura que o papel
    expect(mutateRule(card({ band: 232, rule: 215, shadow: false }))).toBeNull();
  });

  it("acompanha a escala da imagem", () => {
    const small = { width: 488, height: 680, data: new Uint8ClampedArray(488 * 680 * 4), colorSpace: "srgb" } as ImageData;
    const big = card();
    // reduz a imagem pela linha mais próxima
    for (let y = 0; y < 680; y++)
      for (let x = 0; x < 488; x++) {
        const s = (Math.floor((y * H) / 680) * W + Math.floor((x * W) / 488)) * 4;
        small.data.set(big.data.subarray(s, s + 4), (y * 488 + x) * 4);
      }
    const r = mutateRule(small);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.top - 782)).toBeLessThanOrEqual(2);
    expect(Math.abs(r!.bottom - 786)).toBeLessThanOrEqual(2);
  });
});

describe("mutateText", () => {
  const BAND = "Mutação {1}{G}{G} (Se você conjurar esta mágica pelo custo de mutação, coloque-a sobre ou sob a criatura alvo…)";

  it("a linha da Mutação vai na faixa e o resto no papel", () => {
    const text = `${BAND}\nAlcance, atropelar\nToda vez que esta criatura sofrer mutação, destrua o artefato alvo.`;
    expect(mutateText(text)).toEqual({
      band: BAND,
      rest: "Alcance, atropelar\nToda vez que esta criatura sofrer mutação, destrua o artefato alvo.",
      italic: [],
    });
    // as palavras de habilidade contam as linhas do resto
    expect(mutateText(`${BAND}\nVoar\nAterragem — Toda vez…`, [2])?.italic).toEqual([1]);
    // só a Mutação
    expect(mutateText(BAND)?.rest).toBe("");
  });

  it("sem a Mutação na frente, o texto não bate com a moldura", () => {
    // o nome que faltava no Arena ("{3}{G} (Se você…)", Glowstone Recluse) é reposto no pipeline
    expect(mutateText("{3}{G} (Se você conjurar…)\nAlcance")).toBeNull();
    expect(mutateText("Voar\nMutação {2}{U}")).toBeNull();
    expect(mutateText(null)).toBeNull();
  });
});

describe("mutateBoxes", () => {
  it("a faixa vai do alto da caixa até perto do fio, e o papel, de logo depois do fio até o pé", () => {
    const box = { x0: 68, y0: 656, x1: 677, y1: 916 };
    const { band, paper } = mutateBoxes(box, { top: 784, bottom: 786 });
    expect(band).toEqual({ x0: 68, y0: 656, x1: 677, y1: 784 - MUTATE.pad });
    expect(paper).toEqual({ x0: 68, y0: 786 + MUTATE.pad, x1: 677, y1: 916 });
  });
});
