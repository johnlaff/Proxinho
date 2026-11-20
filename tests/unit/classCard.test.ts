import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT,
  CLASS,
  classBars,
  classColumn,
  classLabel,
  classPlan,
  classRule,
  classText,
  cutStrip,
  pasteStrip,
  restoreBevel,
} from "../../src/engine/classCard";

const W = 745;
const H = 1040;

type Color = [number, number, number];

function canvas(bg: Color) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        data.set(c, i);
        data[i + 3] = 255;
      }
  };
  fill(0, 0, W, H, bg);
  return { img, fill };
}

const gray = (v: number): Color => [v, v, v];
const lumAt = (img: ImageData, x: number, y: number) => img.data[(y * W + x) * 4];

/**
 * Classe falsa: a arte até x 370, o fio preto da coluna em 370 a 373, o papel até o bisel
 * (681 a 685, cinza) e o fio da direita em 686 a 688; o fio fino do lembrete em 206.
 */
function classCard() {
  const c = canvas(gray(236));
  c.fill(0, 0, 370, H, gray(110));
  c.fill(370, 0, 374, H, gray(10));
  c.fill(681, 0, 686, H, gray(170));
  c.fill(686, 0, 689, H, gray(10));
  c.fill(420, 206, 640, 208, gray(150));
  return c;
}

/** Barra de nível com a linha preta em `y` (chanfro no meio), o degradê e um "Level 2" à direita. */
function levelBar(c: ReturnType<typeof canvas>, y: number) {
  c.fill(374, y, 520, y + 3, gray(20));
  c.fill(540, y, 686, y + 3, gray(20));
  for (let k = 0; k < 14; k++) c.fill(520 + k, y + k, 540 - k, y + k + 2, gray(20));
  for (let k = 0; k < 24; k++) c.fill(374, y + 25 + k, 681, y + 26 + k, gray(232 - k * 1.5));
  // o rótulo: tinta escura de x 600 a 668, nas linhas y + 16 a y + 34
  for (let x = 600; x < 668; x += 8) c.fill(x, y + 16, x + 5, y + 34, gray(25));
}

describe("classColumn e classBars", () => {
  it("acha a coluna, o bisel, o fio do lembrete e as barras, e não as linhas de texto", () => {
    const c = classCard();
    levelBar(c, 371);
    levelBar(c, 591);
    // linhas de texto densas entre as barras
    for (const y of [240, 280, 450, 650, 700]) for (let x = 385; x < 670; x += 11) c.fill(x, y, x + 7, y + 22, gray(20));
    const col = classColumn(c.img);
    expect(col).not.toBeNull();
    expect(col!.left).toBeGreaterThanOrEqual(370);
    expect(col!.left).toBeLessThan(374);
    expect(col!.bevel).toBe(681);
    expect(col!.right).toBeGreaterThanOrEqual(686);
    expect(classRule(c.img, col!)).toBe(206);
    expect(classBars(c.img, col!)).toEqual([371, 591]);
  });

  it("sem os fios escuros não é Classe", () => {
    const c = canvas(gray(236));
    expect(classColumn(c.img)).toBeNull();
  });

  it("o rótulo da barra: a ponta direita e o centro da tinta", () => {
    const c = classCard();
    levelBar(c, 371);
    const col = classColumn(c.img)!;
    const label = classLabel(c.img, col, 371);
    // (a tinta vai até a coluna 668: a ponta é a borda dela)
    expect(label.right).toBe(669);
    expect(label.center).toBe(371 + 25);
    // a busca não chega ao custo, na metade esquerda da barra
    expect(label.rect.x0).toBeGreaterThan((col.left + col.bevel) / 2);
  });
});

describe("classText", () => {
  const texto =
    "(Ganhe o próximo nível como um feitiço para adicionar sua habilidade.)\nNão há limite para o número máximo de cards em sua mão.\n{2}{U}: Nível 2\nQuando esta Classe chegar ao nível 2, compre dois cards.\n{4}{U}: Nível 3\nToda vez que você comprar um card, coloque um marcador +1/+1 na criatura alvo que você controla.";

  it("separa o lembrete, as habilidades e os rótulos das barras", () => {
    const t = classText(texto)!;
    expect(t.reminder).toBe("(Ganhe o próximo nível como um feitiço para adicionar sua habilidade.)");
    expect(t.levels).toEqual(["Nível 2", "Nível 3"]);
    expect(t.sections.map((s) => s.text)).toEqual([
      "Não há limite para o número máximo de cards em sua mão.",
      "Quando esta Classe chegar ao nível 2, compre dois cards.",
      "Toda vez que você comprar um card, coloque um marcador +1/+1 na criatura alvo que você controla.",
    ]);
    expect(t.sections.map((s) => s.lines)).toEqual([[1], [3], [5]]);
  });

  it("habilidade de várias linhas fica na faixa do nível dela", () => {
    const t = classText("(Lembrete.)\nPrimeira.\n{B}: Nível 2\nUma.\nOutra.\n{3}{B}: Nível 3\nÚltima.")!;
    expect(t.sections[1]).toEqual({ text: "Uma.\nOutra.", lines: [3, 4] });
  });

  it("sem lembrete, sem nível ou com nível vazio: a carta sai na original", () => {
    expect(classText(texto.split("\n").slice(1).join("\n"))).toBeNull();
    expect(classText("(Lembrete.)\nSó o nível 1.")).toBeNull();
    expect(classText("(Lembrete.)\nPrimeira.\n{B}: Nível 2\n{3}{B}: Nível 3\nÚltima.")).toBeNull();
  });
});

describe("classPlan", () => {
  it("divide a folga por igual e põe cada texto no meio da sua faixa", () => {
    const plan = classPlan([100, 60, 140], 210, 867)!;
    const gap = (867 - 210 - 300 - 2 * BAR_HEIGHT) / 6;
    expect(plan.tops[0]).toBe(Math.round(210 + gap));
    // a linha preta da primeira barra: o texto, a folga de baixo e o brilho acima da linha
    expect(plan.bars[0]).toBe(Math.round(210 + 100 + 2 * gap + CLASS.bar.above));
    // a última faixa acaba no pé da coluna com a mesma folga
    expect(Math.abs(plan.tops[2] + 140 + gap - 867)).toBeLessThanOrEqual(1);
  });

  it("texto comprido demais para a folga mínima: não cabe", () => {
    expect(classPlan([300, 200, 140], 210, 867)).toBeNull();
  });
});

describe("cutStrip, pasteStrip e restoreBevel", () => {
  it("a barra muda de lugar com as pontas misturadas ao papel", () => {
    const c = classCard();
    levelBar(c, 371);
    const strip = cutStrip(c.img, 371 - CLASS.bar.above, 371 + CLASS.bar.below, 372, 686);
    c.fill(374, 300, 681, 500, gray(236));
    pasteStrip(c.img, strip, 420 - CLASS.bar.above);
    // a linha preta foi para 420, e a primeira linha da faixa (papel) mistura com o papel
    expect(lumAt(c.img, 450, 421)).toBe(20);
    expect(lumAt(c.img, 450, 371)).toBe(236);
    expect(lumAt(c.img, 450, 420 - CLASS.bar.above)).toBe(236);
  });

  it("o bisel volta liso onde a barra estava", () => {
    const c = classCard();
    levelBar(c, 371);
    expect(lumAt(c.img, 683, 372)).toBe(20);
    restoreBevel(c.img, 365, 425, 680, 686, 360);
    expect(lumAt(c.img, 683, 372)).toBe(170);
  });
});
