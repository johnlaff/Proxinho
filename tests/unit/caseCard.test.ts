import { describe, expect, it } from "vitest";
import { CASE, caseRules, casePlan, caseText, RULE_HEIGHT } from "../../src/engine/caseCard";

const W = 745;
const H = 1040;

/**
 * A coluna do Caso: papel de x 372 a 686, com os fios nas linhas `rules` (2 px, ~112 no meio,
 * esmaecendo até o papel nas pontas) e linhas de letras (traços curtos e escuros) no meio.
 */
function column({ rules = [482, 732], paper = 242, words = [] as number[] } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 30;
      if (x >= 372 && x < 686 && y >= 118 && y < 866) {
        v = paper;
        for (const r of rules)
          if (y >= r && y < r + 2 && x >= 400 && x < 660) {
            // o meio escuro e as pontas esmaecendo
            const edge = Math.min(x - 400, 660 - x);
            v = edge >= 56 ? 112 : Math.round(paper - ((paper - 112) * edge) / 56);
          }
        // uma linha de texto: traços de 3 px a cada 9 (nunca escurecem a largura toda)
        for (const w of words) if (y >= w && y < w + 20 && (x - 380) % 9 < 3) v = 20;
      }
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  return img;
}

describe("caseRules", () => {
  it("acha os dois fios entre as partes, e as letras não passam por fio", () => {
    expect(caseRules(column({ words: [140, 300, 500, 760] }), 242)).toEqual([482, 732]);
    // num papel mais escuro (as pretas) os fios continuam achados
    expect(caseRules(column({ paper: 210, rules: [398, 599] }), 210)).toEqual([398, 599]);
  });

  it("um fio que se espalha por três linhas (as promos reamostradas) conta uma vez", () => {
    const img = column({ rules: [398, 400, 599] });
    expect(caseRules(img, 242)).toEqual([398, 599]);
  });

  it("acompanha a escala da imagem", () => {
    const big = column();
    const w = 488;
    const h = 680;
    const small = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: "srgb" } as ImageData;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = (Math.floor((y * H) / h) * W + Math.floor((x * W) / w)) * 4;
        small.data.set(big.data.subarray(s, s + 4), (y * w + x) * 4);
      }
    const rules = caseRules(small, 242);
    expect(rules).toHaveLength(2);
    expect(Math.abs(rules[0] - 482)).toBeLessThanOrEqual(2);
    expect(Math.abs(rules[1] - 732)).toBeLessThanOrEqual(2);
  });
});

describe("caseText", () => {
  const TEXT =
    "Quando este Caso entrar, investigue.\nPara Solucionar — Você controla três ou mais artefatos. (Se o Caso não tiver sido solucionado, solucione-o no início de sua etapa final.)\nSolucionado — {2}{U}, sacrifique este Caso: Coloque quatro marcadores +1/+1 no artefato não criatura alvo.";

  it("parte o texto na habilidade, no Para Solucionar e no Solucionado", () => {
    const parts = caseText(TEXT)!.parts;
    expect(parts.map((p) => p.lines)).toEqual([[0], [1], [2]]);
    expect(parts[1].text).toMatch(/^Para Solucionar — /);
    expect(parts[2].text).toMatch(/^Solucionado — \{2\}\{U\}/);
    // a habilidade pode ter mais de uma linha, e o Solucionado também
    const long = caseText(`Voar\n${TEXT}\nAtive somente como um feitiço.`)!.parts;
    expect(long.map((p) => p.lines)).toEqual([[0, 1], [2], [3, 4]]);
  });

  it("sem as duas partes do Caso, fora de ordem ou sem a habilidade, o texto não bate com a moldura", () => {
    expect(caseText("Quando este Caso entrar, investigue.\nSolucionado — Compre um card.")).toBeNull();
    expect(caseText("Para Solucionar — Você controla três artefatos.\nSolucionado — Compre um card.")).toBeNull();
    expect(caseText("Voar\nSolucionado — Compre um card.\nPara Solucionar — Você controla três artefatos.")).toBeNull();
    expect(caseText(null)).toBeNull();
  });
});

describe("casePlan", () => {
  it("divide a folga por igual em volta de cada parte, com os fios no meio", () => {
    const plan = casePlan([200, 150, 100])!;
    const free = CASE.bottom - CASE.top - 450 - 2 * RULE_HEIGHT;
    const gap = free / 6;
    expect(plan.tops[0]).toBe(Math.round(CASE.top + gap));
    // o fio fica com a mesma folga até o fim de uma parte e o começo da outra
    expect(plan.rules[0] - CASE.strip.above - (plan.tops[0] + 200)).toBeCloseTo(gap, 0);
    expect(plan.tops[1] - (plan.rules[0] - CASE.strip.above + RULE_HEIGHT)).toBeCloseTo(gap, 0);
    expect(plan.rules).toHaveLength(2);
  });

  it("sem a folga mínima, não há plano (o corpo tem de descer)", () => {
    expect(casePlan([300, 250, 200])).toBeNull();
  });
});
