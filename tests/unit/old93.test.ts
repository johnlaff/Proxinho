import { describe, expect, it } from "vitest";
import { eraseRegions, maskRegions } from "../../src/engine/erase";
import { textCentered } from "../../src/engine/token";
import {
  asEngraved,
  boxCentered93,
  boxLetters93,
  burntSides,
  dropBottomRule,
  frameEdge93,
  inkBand,
  inkLetters,
  lineAlign93,
  lineFeet93,
  maskBounds,
  OLD93,
  old93Layers,
  oldBox93,
  oldCostLeft93,
  paleBox93,
  paperRect93,
  paperTint93,
  softened,
  tameLow,
  trimAfterGap,
  typeEnds93,
} from "../../src/engine/old93";

const W = 745;
const H = 1040;

type Color = [number, number, number];

/**
 * Carta de 1993 falsa: a moldura numa textura em xadrez fino (`base` a `base` + 20), como o
 * mármore, ou numa retícula de 40 tons (`screen`), como as digitalizações de Alpha a Revised.
 */
function card({ base = 110, screen = false }: { base?: number; screen?: boolean } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  const img = { width: W, height: H, data, colorSpace: "srgb" } as ImageData;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = screen ? base + ((x + y) % 2 ? 20 : -20) : base + ((x * 7 + y * 13) % 21);
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...c, 255], (y * W + x) * 4);
  };
  /** letra clara: haste de 4 px, com a sombra preta 2 px à direita e abaixo */
  const light = (x: number, top: number, bottom: number) => {
    fill(x + 2, top + 2, x + 6, bottom + 2, [30, 30, 30]);
    fill(x, top, x + 4, bottom, [236, 234, 228]);
  };
  /** letra gravada: o contorno escuro, o miolo do tom da moldura e o brilho claro do outro lado */
  const engraved = (x: number, top: number, bottom: number) => {
    fill(x + 2, top + 2, x + 7, bottom + 2, [250, 250, 250]);
    fill(x, top, x + 5, bottom, [40, 40, 40]);
    fill(x + 1, top + 1, x + 4, bottom - 1, [base, base, base]);
  };
  return { img, fill, light, engraved };
}

const nameRect = (x1 = 600) => ({ x0: OLD93.name.x0, y0: OLD93.name.y0, x1, y1: OLD93.name.y1 });
const namePeak = OLD93.name.peak;
const at = (l: ReturnType<typeof inkLetters>, x: number, y: number) => l.mask[(y - l.rect.y0) * (l.rect.x1 - l.rect.x0) + x - l.rect.x0];

describe("moldura de 1993 (ADR 0039)", () => {
  it("o custo: um símbolo a cada 40,5 px, o último acabando em 681", () => {
    expect(oldCostLeft93("{2}{W}")).toBe(600);
    expect(oldCostLeft93("{X}{R}{R}{R}")).toBe(519);
    expect(oldCostLeft93("")).toBe(700);
    expect(oldCostLeft93(null)).toBe(700);
  });

  it("acha as letras claras com sombra, as palavras, a linha de base e o estilo", () => {
    const { img, fill, light } = card();
    for (const x of [58, 68, 78, 88]) light(x, 52, 74);
    for (const x of [118, 128, 138]) light(x, 52, 74);
    // o fio claro do bisel da arte, abaixo das letras, comprido: não é letra
    fill(48, 96, 600, 98, [228, 226, 220]);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(l.blocks).toEqual([
      { x0: 58, x1: 94 },
      { x0: 118, x1: 144 },
    ]);
    expect(l.baseline).toBe(76);
    expect(l.style).toBe("light");
    expect(l.fill[0]).toBeGreaterThan(190);
    expect(l.edge[0]).toBeLessThan(100);
    expect(at(l, 60, 60)).toBe(1);
    expect(at(l, 92, 75)).toBe(1);
    expect(at(l, 300, 97)).toBe(0);
    expect(at(l, 300, 60)).toBe(0);
  });

  it("acha as letras gravadas de uma moldura clara, com o estilo escuro", () => {
    // Holy Armor (LEB 24), Serra Angel (3ED 40): o contorno escuro e o brilho claro
    const { img, engraved } = card({ base: 190 });
    for (const x of [56, 66, 76, 86, 96]) engraved(x, 58, 85);
    const l = inkLetters(img, nameRect(), namePeak);
    // (a imagem alisada espalha o contorno 1 px)
    expect(Math.abs(l.blocks[0].x0 - 56)).toBeLessThanOrEqual(1);
    expect(l.blocks[l.blocks.length - 1].x1).toBeGreaterThanOrEqual(101);
    expect(l.style).toBe("dark");
    // (alisado, o contorno fino mistura com o miolo: o português escurece a cor, ver old93Layers)
    expect(l.fill[0]).toBeLessThan(170);
    expect(l.edge[0]).toBeGreaterThan(200);
    // o miolo entre o contorno e o brilho entra na máscara
    expect(at(l, 58, 70)).toBe(1);
  });

  it("na retícula de 40 tons das digitalizações antigas, as letras continuam achadas", () => {
    // Mana Vault (LEA 259), Iron Star (LEB 251): sem alisar, o ruído subia o limiar acima das letras
    const { img, engraved } = card({ base: 120, screen: true });
    for (const x of [54, 64, 74, 84]) engraved(x, 58, 85);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(l.blocks.length).toBeGreaterThan(0);
    expect(Math.abs(l.blocks[0].x0 - 54)).toBeLessThanOrEqual(3);
    expect(l.baseline).not.toBeNull();
    expect(at(l, 300, 70)).toBe(0);
  });

  it("a faixa das letras pela energia: até as gravadas finas na retícula, com a linha de base", () => {
    // Stone Giant (LEA 176): a medida pixel a pixel achava só um pedaço e punha a linha de base em 69
    const { img, engraved } = card({ base: 120, screen: true });
    for (const x of [54, 64, 74, 84, 94, 104]) engraved(x, 58, 85);
    const b = inkBand(img, nameRect(), namePeak);
    expect(Math.abs(b.bottom - 87)).toBeLessThanOrEqual(2);
    expect(b.top).toBeLessThanOrEqual(61);
    expect(b.segs[0].x1).toBeGreaterThanOrEqual(110);
    expect(b.segs[0].x1).toBeLessThanOrEqual(118);
    // o que vem depois de um vão largo é outro trecho
    const far = card({ base: 120, screen: true });
    for (const x of [54, 64]) far.engraved(x, 58, 85);
    far.engraved(200, 58, 85);
    expect(inkBand(far.img, nameRect(), namePeak).segs.length).toBe(2);
  });

  it("a caixa na retícula forte: as letras medidas numa cópia alisada", () => {
    // Disintegrate (CED 141), Natural Selection (LEA 212): a máscara medida na imagem saía vazia
    const { img, fill } = card({ base: 180 });
    for (let y = 640; y < 900; y++)
      for (let x = 100; x < 640; x++) {
        const v = (x + y) % 2 ? 225 : 135;
        img.data.set([v, v - 10, v - 30, 255], (y * W + x) * 4);
      }
    for (const x of [150, 160, 170, 180, 200, 210]) fill(x, 700, x + 3, 724, [40, 35, 30]);
    const rect = { x0: 100, y0: 640, x1: 640, y1: 900 };
    const m = boxLetters93(img, rect);
    const at = (x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];
    expect(m.polarity).toBe("dark");
    expect(at(151, 712)).toBe(1);
    expect(at(211, 712)).toBe(1);
    expect(at(450, 820)).toBe(0);
    // (sem alisar, o limiar subia com a retícula e a letra ficava fora)
    const [raw] = maskRegions(img, [{ rect, threshold: 14, colorThreshold: 34, stains: true }], []);
    expect(raw.mask[(712 - rect.y0) * (rect.x1 - rect.x0) + 151 - rect.x0]).toBe(0);
  });

  it("a beira queimada do pergaminho fica fora da máscara da caixa; as letras coladas nela, não", () => {
    // Simulacrum (2ED 129), Pestilence (3ED 122): o apagamento deixava o pergaminho reto e liso
    const { img, fill } = card({ base: 60 });
    fill(90, 626, 656, 920, [206, 173, 141]);
    // a beira de cima, em ondas e degradê, até 12 px para dentro
    for (let x = 90; x < 656; x++) {
      const deep = 4 + ((x * 5) % 9);
      for (let y = 626; y < 626 + deep; y++) {
        const v = 80 + ((y - 626) / deep) * 100;
        img.data.set([v, v * 0.85, v * 0.7, 255], (y * W + x) * 4);
      }
    }
    for (const x of [150, 160, 170, 180]) fill(x, 660, x + 3, 680, [40, 35, 30]);
    // uma palavra colada na beira da esquerda (passa da faixa da beira)
    fill(90, 700, 112, 704, [40, 35, 30]);
    fill(97, 700, 101, 720, [40, 35, 30]);
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    const m = boxLetters93(img, rect);
    const at = (x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];
    expect(at(300, 628)).toBe(0);
    expect(at(301, 630)).toBe(0);
    expect(at(151, 670)).toBe(1);
    expect(at(98, 712)).toBe(1);
    expect(at(108, 702)).toBe(1);
  });

  it("o papel claro e sem cor vai à rede neural; o mosaico, a água, a pedra, as tábuas e o pergaminho, não", () => {
    // Wall of Swords (SUM 43): o apagamento de sempre trocava a renda por um cinza liso e manchado
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    const box = (paper: (x: number, y: number) => [number, number, number]) => {
      const { img } = card({ base: 60 });
      for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) img.data.set([...paper(x, y), 255], (y * W + x) * 4);
      return paleBox93(img, rect);
    };
    // a renda: pontos cinza num papel quase branco
    expect(box((x, y) => ((x * 7 + y * 3) % 11 < 3 ? [150, 150, 155] : [222, 222, 226]))).toBe(true);
    // o mosaico dos artefatos, em pedras de tons pastel diferentes (o apagamento de sempre acerta nele)
    expect(box((x, y) => (((x >> 5) + (y >> 5)) % 2 ? [214, 200, 196] : [198, 208, 214]))).toBe(false);
    expect(box(() => [206, 173, 141])).toBe(false);
    expect(box(() => [150, 190, 225])).toBe(false);
    expect(box(() => [190, 90, 70])).toBe(false);
    expect(box(() => [120, 90, 60])).toBe(false);
  });

  it("o remendo na caixa sem cor fica com a cor do papel", () => {
    // Guardian Angel (CED 22): a rede neural inventou uma mancha esverdeada na renda
    const { img, fill } = card({ base: 60 });
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    fill(rect.x0, rect.y0, rect.x1, rect.y1, [190, 185, 180]);
    fill(200, 700, 260, 740, [141, 152, 140]);
    const hole = new Uint8Array(W * H);
    for (let y = 700; y < 740; y++) hole.fill(1, y * W + 200, y * W + 260);
    paperTint93(img, rect, hole);
    const i = (720 * W + 230) * 4;
    const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    // o brilho fica o do modelo
    expect(Math.abs(0.299 * r + 0.587 * g + 0.114 * b - (0.299 * 141 + 0.587 * 152 + 0.114 * 140))).toBeLessThan(1.5);
    // fora do buraco, nada muda
    expect([...img.data.slice((650 * W + 300) * 4, (650 * W + 300) * 4 + 3)]).toEqual([190, 185, 180]);
  });

  it("o papel da caixa fica sem o bisel roxo e o filete branco que entram no retângulo medido", () => {
    // Lat-Nam's Legacy (ALL 141): a rede neural puxava o roxo do bisel para dentro da caixa
    const { img, fill } = card({ base: 60 });
    const rect = { x0: 97, y0: 625, x1: 650, y1: 919 };
    fill(rect.x0, rect.y0, rect.x1, rect.y1, [205, 210, 218]);
    fill(rect.x0, rect.y0, rect.x1, 634, [120, 95, 150]);
    fill(rect.x0, 634, rect.x1, 635, [232, 236, 236]);
    fill(rect.x0, rect.y0, 104, rect.y1, [120, 95, 150]);
    for (let x = 140; x < 400; x += 9) fill(x, 640, x + 3, 660, [40, 35, 30]);
    expect(paperRect93(img, rect)).toEqual({ x0: 104, y0: 635, x1: 650, y1: 919 });
    // sem bisel, o papel é o retângulo inteiro
    const plain = card({ base: 60 });
    plain.fill(rect.x0, rect.y0, rect.x1, rect.y1, [205, 210, 218]);
    expect(paperRect93(plain.img, rect)).toEqual(rect);
  });

  it("a primeira linha logo abaixo do alto queimado do pergaminho fica na máscara", () => {
    // Syphon Soul (LEG 118): o alto das letras saía junto com a beira e ficava embaixo do português
    const { img, fill } = card({ base: 60 });
    fill(90, 626, 656, 920, [206, 173, 141]);
    for (let x = 90; x < 656; x++)
      for (let y = 626; y < 632; y++) {
        const v = 80 + ((y - 626) / 6) * 100;
        img.data.set([v, v * 0.85, v * 0.7, 255], (y * W + x) * 4);
      }
    for (const x of [150, 160, 170, 180]) fill(x, 633, x + 3, 660, [40, 35, 30]);
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    const m = boxLetters93(img, rect);
    const at = (x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];
    expect(at(151, 634)).toBe(1);
    expect(at(171, 635)).toBe(1);
    expect(at(400, 628)).toBe(0);
  });

  it("a beira queimada que fica não serve de fonte do apagamento da última linha", () => {
    // Frozen Shade (CEI 110): o preenchimento puxava o escuro da beira de baixo para as letras
    const { img, fill } = card({ base: 60 });
    fill(90, 626, 656, 920, [206, 173, 141]);
    for (let x = 90; x < 656; x++)
      for (let y = 913; y < 920; y++) {
        const v = 180 - ((y - 913) / 6) * 110;
        img.data.set([v, v * 0.85, v * 0.7, 255], (y * W + x) * 4);
      }
    for (let x = 120; x < 400; x += 9) fill(x, 896, x + 3, 912, [40, 35, 30]);
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    const m = boxLetters93(img, rect);
    expect(burntSides(img, rect).bottom).toBe(true);
    const inRim = (x: number, y: number) => m.rim.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    expect(inRim(500, 918)).toBe(true);
    expect(inRim(500, 800)).toBe(false);
    expect(inRim(121, 905)).toBe(false);
    eraseRegions(img, [{ rect, threshold: 14, letters: m.mask, attachedBelow: rect.y1 }], [], m.rim);
    const i = (910 * W + 121) * 4;
    expect(img.data[i]).toBeGreaterThan(190);
    // (a beira fica como era)
    expect(img.data[(918 * W + 500) * 4]).toBeLessThan(110);
  });

  it("a ponta de uma letra rente ao fim da caixa fica na máscara", () => {
    // Hill Giant (2ED 158): o gancho do "f" de "of" passava por mancha da beira e ficava
    const { img, fill } = card({ base: 60 });
    // (o bisel claro depois do fim do papel medido)
    fill(90, 626, 700, 920, [206, 173, 141]);
    // a haste do "f" fora da faixa da beira e o gancho dele até o fim do papel
    fill(630, 700, 634, 740, [40, 35, 30]);
    fill(634, 700, 656, 703, [40, 35, 30]);
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    const m = boxLetters93(img, rect);
    const at = (x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];
    expect(at(650, 701)).toBe(1);
  });

  it("fora do pergaminho das pretas, o bisel abaixo do papel fica fora da máscara", () => {
    // Mountain (CED 297): a medida da caixa passa do fio e do aro vermelho, e o apagamento os
    // pintava com a cor do papel, em manchas
    const { img, fill } = card({ base: 60 });
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    fill(90, 626, 656, 920, [210, 120, 115]);
    fill(90, 902, 656, 904, [100, 30, 35]);
    fill(90, 904, 656, 914, [190, 50, 70]);
    fill(90, 914, 656, 917, [60, 40, 40]);
    fill(90, 917, 656, 920, [130, 115, 105]);
    for (let i = 0; i < 6; i++) fill(120 + i * 60, 860, 150 + i * 60, 880, [30, 20, 20]);
    expect(paperRect93(img, rect).y1).toBe(904);
    const w = rect.x1 - rect.x0;
    const row = (m: Uint8Array, y: number) => m.slice((y - rect.y0) * w, (y - rect.y0 + 1) * w).reduce((a, b) => a + b, 0);
    const parchment = boxLetters93(img, rect).mask;
    const other = boxLetters93(img, rect, false).mask;
    expect(row(parchment, 910)).toBe(w);
    expect(row(other, 910)).toBe(0);
    expect(row(other, 918)).toBe(0);
    // as letras ficam
    expect(row(other, 870)).toBe(row(parchment, 870));
    expect(row(other, 870)).toBeGreaterThan(0);
  });

  it("a última linha rente ao pé de uma caixa sem beira queimada fica na máscara", () => {
    // Merseine (FEM 23b): no papel de água a última linha saía inteira e ficava embaixo do português
    const { img, fill } = card({ base: 60 });
    fill(90, 626, 656, 940, [206, 213, 231]);
    for (let x = 120; x < 400; x += 9) fill(x, 906, x + 3, 920, [40, 35, 30]);
    const rect = { x0: 90, y0: 626, x1: 656, y1: 920 };
    const m = boxLetters93(img, rect);
    const at = (x: number, y: number) => m.mask[(y - rect.y0) * (rect.x1 - rect.x0) + x - rect.x0];
    expect(at(301, 915)).toBe(1);
    expect(burntSides(img, rect)).toEqual({ top: false, bottom: false, left: false, right: false });
  });

  it("o fio escuro do pé da caixa, dentro da medida, sai da máscara; a beira queimada até o fim, não", () => {
    // Steal Artifact (CEI 82): a medida da caixa passa do fio e vai até a moldura, mais clara
    const { img, fill } = card({ base: 150 });
    const rect = { x0: 100, y0: 640, x1: 650, y1: 900 };
    fill(rect.x0, rect.y0, rect.x1, rect.y1, [180, 170, 150]);
    fill(rect.x0, 890, rect.x1, 893, [60, 55, 50]);
    fill(rect.x0, 893, rect.x1, 900, [150, 140, 120]);
    // a sombra do bisel logo acima do fio, com o pé de uma letra passando por ela
    fill(rect.x0, 886, rect.x1, 890, [160, 150, 135]);
    fill(300, 880, 305, 889, [40, 30, 20]);
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const mask = new Uint8Array(w * h).fill(1);
    dropBottomRule(img, rect, mask, 40, 3);
    const at = (x: number, y: number) => mask[(y - rect.y0) * w + x - rect.x0];
    expect(at(200, 882)).toBe(1);
    expect(at(200, 883)).toBe(0);
    expect(at(200, 888)).toBe(0);
    expect(at(200, 899)).toBe(0);
    // a letra e a folga dela ficam
    expect(at(302, 887)).toBe(1);
    expect(at(306, 887)).toBe(1);
    expect(at(309, 887)).toBe(0);
    // a beira queimada escura até o fim da medida fica como estava
    fill(rect.x0, 885, rect.x1, 900, [60, 55, 50]);
    const burnt = new Uint8Array(w * h).fill(1);
    dropBottomRule(img, rect, burnt, 40, 3);
    expect(burnt.every((v) => v === 1)).toBe(true);
  });

  it("as bolhas da pedra depois de um vão largo saem do nome", () => {
    // Pestilence (3ED 122): as bolhas claras da moldura preta passavam por letra no fim do nome
    const { img, light } = card({ base: 50 });
    for (const x of [58, 68, 78]) light(x, 52, 74);
    light(300, 60, 72);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(l.blocks[l.blocks.length - 1].x0).toBe(300);
    const end = trimAfterGap(l, 30);
    expect(end).toBeGreaterThanOrEqual(82);
    expect(end).toBeLessThanOrEqual(86);
    expect(l.blocks).toHaveLength(1);
    expect(at(l, 301, 65)).toBe(0);
    expect(at(l, 60, 65)).toBe(1);
  });

  it("o símbolo da coleção, depois de um vão, sai das letras do tipo", () => {
    const { img, light } = card();
    for (const x of [66, 76, 86, 96, 116, 126]) light(x, 588, 610);
    for (const x of [640, 648, 656, 664]) light(x, 584, 614);
    const t = inkLetters(img, { x0: OLD93.type.x0, y0: OLD93.type.y0, x1: OLD93.type.x1, y1: 624 }, [OLD93.type.peak, 618]);
    // (com a folga da máscara)
    expect(typeEnds93(t, 1)).toEqual({ textEnd: 132, symbol: 636 });
    // sem o símbolo, o texto vai até a última letra
    const { img: plain, light: plainLight } = card();
    for (const x of [66, 76, 86]) plainLight(x, 588, 610);
    const p = inkLetters(plain, { x0: OLD93.type.x0, y0: OLD93.type.y0, x1: OLD93.type.x1, y1: 624 }, [OLD93.type.peak, 618]);
    expect(typeEnds93(p, 1)).toEqual({ textEnd: 92, symbol: null });
  });

  it("o símbolo em dois pedaços, a 13 px um do outro, sai inteiro das letras do tipo", () => {
    // a cimitarra de Arabian Nights: o cabo solto da lâmina (Mountain, ARN 77)
    const typeRect = { x0: OLD93.type.x0, y0: OLD93.type.y0, x1: OLD93.type.x1, y1: 624 };
    const { img, light } = card();
    for (const x of [66, 76, 86]) light(x, 588, 610);
    for (const x of [600, 606, 625, 633, 641]) light(x, 584, 614);
    const t = inkLetters(img, typeRect, [OLD93.type.peak, 618]);
    expect(t.blocks.map((b) => [b.x0, b.x1])).toEqual([
      [66, 92],
      [600, 612],
      [625, 647],
    ]);
    expect(typeEnds93(t, 1)).toEqual({ textEnd: 92, symbol: 596 });
    // sem as letras do tipo na medida, o símbolo inteiro é o único trecho
    const alone = card();
    for (const x of [600, 606, 625, 633, 641]) alone.light(x, 584, 614);
    expect(typeEnds93(inkLetters(alone.img, typeRect, [OLD93.type.peak, 618]), 1)).toEqual({ textEnd: 66, symbol: 596 });
  });

  it("o símbolo começa na ponta fina do rabo, com uma linha só de letra", () => {
    // Aesthir Glider (ALL 116a): o tipo comprido em português ia até a ponta da bandeira
    const { img, fill, light } = card();
    for (const x of [66, 76, 86, 96, 116, 126]) light(x, 588, 610);
    for (const x of [640, 648, 656, 664]) light(x, 584, 614);
    fill(624, 598, 640, 599, [236, 234, 228]);
    const t = inkLetters(img, { x0: OLD93.type.x0, y0: OLD93.type.y0, x1: OLD93.type.x1, y1: 624 }, [OLD93.type.peak, 618]);
    expect(t.blocks[t.blocks.length - 1].x0).toBeGreaterThan(630);
    expect(typeEnds93(t, 1).symbol).toBeLessThanOrEqual(624);
  });

  it("a caixa: o fio do bisel ou, sem ele, onde a cor deixa de ser a do papel", () => {
    // caixa com bisel: o fio escuro em volta do papel
    const bevel = card({ base: 60 });
    bevel.fill(84, 618, 662, 930, [30, 30, 30]);
    bevel.fill(90, 624, 656, 924, [225, 215, 190]);
    const measured = oldBox93(bevel.img);
    const paper = { x0: 90, y0: 624, x1: 656, y1: 924 };
    for (const k of ["x0", "y0", "x1", "y1"] as const) expect(Math.abs(measured[k] - paper[k])).toBeLessThanOrEqual(2);
    // pergaminho queimado das pretas: a beira irregular, sem fio, direto sobre a pedra escura
    const parchment = card({ base: 40 });
    for (let y = 628; y < 920; y++) {
      const wobble = (y * 7) % 5;
      parchment.fill(92 + wobble, y, 652 - wobble, y + 1, [215, 180, 130]);
    }
    for (let x = 92; x < 652; x++) {
      const wobble = (x * 3) % 4;
      parchment.fill(x, 626 + wobble, x + 1, 628, [215, 180, 130]);
    }
    const box = oldBox93(parchment.img);
    expect(box.x0).toBeGreaterThanOrEqual(92);
    expect(box.x0).toBeLessThanOrEqual(97);
    expect(box.x1).toBeGreaterThanOrEqual(648);
    expect(box.x1).toBeLessThanOrEqual(652);
    expect(box.y1).toBe(920);
  });

  it("a moldura em volta do nome: do fio de cima à beira da arte", () => {
    // a borda branca até y 42, o fio preto de 43 a 45, a moldura e, a partir de 94, o bisel da arte
    const { img, fill, light } = card({ base: 120 });
    fill(0, 0, W, 43, [237, 237, 237]);
    fill(0, 43, W, 46, [30, 30, 30]);
    fill(0, 94, W, 104, [240, 240, 240]);
    for (const x of [58, 68, 78, 88, 118, 128]) light(x, 52, 82);
    const rect = nameRect();
    expect(frameEdge93(img, rect, 58, -1)).toBe(46);
    expect(frameEdge93(img, rect, 91, 1)).toBe(94);
    // sem a beira, os limites do retângulo
    const plain = card({ base: 120 });
    expect(frameEdge93(plain.img, rect, 58, -1)).toBe(rect.y0);
    expect(frameEdge93(plain.img, rect, 91, 1)).toBe(rect.y1);
  });

  it("embaixo do tipo, o aro colorido da caixa com o brilho da pedra em volta", () => {
    // Mountain (ARN 77): o aro vermelho tem quase o brilho da pedra clara, e só a cor o separa
    const { img, fill } = card({ base: 140 });
    fill(0, 622, W, 632, [194, 77, 72]);
    const rect = { x0: OLD93.type.x0, y0: OLD93.type.y0, x1: OLD93.type.x1, y1: 629 };
    expect(frameEdge93(img, rect, 612, 1)).toBe(632);
    expect(frameEdge93(img, rect, 612, 1, 1, true)).toBe(622);
  });

  it("a letra clara medida na histerese: a sombra fraca entra na máscara", () => {
    const { img, fill, light } = card({ base: 110 });
    for (const x of [58, 68, 78, 88]) light(x, 52, 74);
    // a sombra fraca depois da última letra (20 tons abaixo da moldura), colada nela
    fill(94, 60, 98, 76, [90, 90, 90]);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(at(l, 97, 70)).toBe(1);
    // a mesma sombra solta, longe das letras, não
    fill(300, 60, 304, 76, [90, 90, 90]);
    expect(at(inkLetters(img, nameRect(), namePeak), 302, 70)).toBe(0);
  });

  it("o rabo fino de uma letra, fraco na imagem alisada, entra na máscara", () => {
    // Stone Giant (LEB 177): o "S" de Beta desce em curva para a esquerda, num traço que alisado
    // fica a uns 30 tons da moldura
    const { img, fill, light } = card({ base: 90 });
    for (const x of [64, 74, 84, 94]) light(x, 52, 80);
    fill(48, 79, 64, 82, [140, 140, 140]);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(at(l, 50, 80)).toBe(1);
    // o mesmo traço longe das letras, não
    fill(300, 79, 316, 82, [140, 140, 140]);
    expect(at(inkLetters(img, nameRect(), namePeak), 302, 80)).toBe(0);
  });

  it("o pé da letra sobre o fio de baixo sai pelos pixels da mesma linha; a quina do bisel fica", () => {
    // Aladdin's Ring (SUM 232): o traço branco do pé do "g" no fio escuro sobrava como um risco
    const { img, fill } = card({ base: 120 });
    fill(0, 94, W, 98, [20, 20, 20]);
    // o pé do "g", da letra até dentro do fio
    fill(200, 80, 214, 96, [240, 240, 240]);
    // a quina clara do bisel na ponta esquerda do fio, sem letra em cima
    fill(48, 94, 56, 98, [230, 230, 230]);
    const rect = nameRect();
    const letters = { rect, mask: new Uint8Array((rect.x1 - rect.x0) * (rect.y1 - rect.y0)) };
    for (let y = 60; y < 94; y++)
      letters.mask.fill(1, (y - rect.y0) * (rect.x1 - rect.x0) + 50 - rect.x0, (y - rect.y0) * (rect.x1 - rect.x0) + 260 - rect.x0);
    const feet = lineFeet93(img, letters, 94);
    const at = (x: number, y: number) => feet.mask[(y - feet.rect.y0) * (feet.rect.x1 - feet.rect.x0) + x - feet.rect.x0];
    expect(at(206, 95)).toBe(1);
    expect(at(52, 95)).toBe(0);
    expect(at(400, 95)).toBe(0);
  });

  it("a moldura antes da quina do fio, embaixo de uma letra, não é pé", () => {
    // Maze of Ith (DRK 117): a moldura embaixo do "L" saía pintada com o fio escuro
    const { img, fill } = card({ base: 120 });
    fill(88, 94, W, 98, [20, 20, 20]);
    // o "L", até logo acima do fio, e o pé de um "g" dentro do fio
    fill(58, 70, 80, 94, [240, 240, 240]);
    fill(200, 80, 214, 96, [240, 240, 240]);
    const rect = nameRect();
    const letters = { rect, mask: new Uint8Array((rect.x1 - rect.x0) * (rect.y1 - rect.y0)) };
    for (let y = 60; y < 94; y++)
      letters.mask.fill(1, (y - rect.y0) * (rect.x1 - rect.x0) + 50 - rect.x0, (y - rect.y0) * (rect.x1 - rect.x0) + 260 - rect.x0);
    const feet = lineFeet93(img, letters, 94);
    const at = (x: number, y: number) => feet.mask[(y - feet.rect.y0) * (feet.rect.x1 - feet.rect.x0) + x - feet.rect.x0];
    expect(at(66, 95)).toBe(0);
    expect(at(206, 95)).toBe(1);
  });

  it("o apóstrofo acima de uma letra baixa entra na máscara", () => {
    // Urza's Tower (CHR 116c): o apóstrofo ficava no ar sobre o português
    const { img, light } = card({ base: 90 });
    for (const x of [58, 68]) light(x, 52, 80);
    for (const x of [80, 90, 100]) light(x, 64, 80);
    light(91, 50, 55);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(at(l, 92, 52)).toBe(1);
  });

  it("o apóstrofo na diagonal de uma letra baixa entra na máscara", () => {
    // Wizards' School (HML 115): o apóstrofo depois do "s" ficava como um acento sobre o "de"
    const { img, light } = card({ base: 90 });
    for (const x of [58, 68]) light(x, 52, 80);
    for (const x of [80, 90]) light(x, 64, 80);
    light(98, 55, 61);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(at(l, 99, 57)).toBe(1);
  });

  it("a ponta da barra do T, solta da haste, entra na máscara", () => {
    // Tarpan (ICE 267): a ponta da barra ficava como um risco claro ao lado do português
    const { img, fill, light } = card({ base: 90 });
    for (const x of [68, 90, 100]) light(x, 52, 80);
    fill(56, 52, 60, 57, [236, 234, 228]);
    fill(156, 52, 160, 57, [236, 234, 228]);
    const l = inkLetters(img, nameRect(), namePeak);
    expect(at(l, 57, 54)).toBe(1);
    // o que fica longe das letras, não
    expect(at(l, 157, 54)).toBe(0);
  });

  it("o quadro de cada linha: o retângulo das letras com folga, dentro do da máscara", () => {
    const rect = { x0: 40, y0: 30, x1: 640, y1: 110 };
    const mask = new Uint8Array(600 * 80);
    expect(maskBounds(rect, mask, 24)).toBeNull();
    for (let y = 20; y < 50; y++) mask.fill(1, y * 600 + 20, y * 600 + 300);
    expect(maskBounds(rect, mask, 24)).toEqual({ x0: 40, y0: 30, x1: 364, y1: 104 });
  });

  it("de Alpha a Unlimited, a letra clara medida numa moldura clara é gravada", () => {
    const l = inkLetters(card({ base: 120 }).img, nameRect(), namePeak);
    const clear = {
      ...l,
      style: "light" as const,
      fill: [160, 160, 160] as [number, number, number],
      edge: [30, 30, 30] as [number, number, number],
      ground: 120,
    };
    asEngraved(clear);
    expect(clear.style).toBe("dark");
    expect(clear.fill).toEqual([30, 30, 30]);
    expect(clear.edge).toEqual([160, 160, 160]);
    // na moldura escura o miolo é bem mais claro que ela: fica a letra clara
    const dark = { ...clear, style: "light" as const, fill: [200, 200, 200] as [number, number, number], ground: 60 };
    asEngraved(dark);
    expect(dark.style).toBe("light");
  });

  it("a cópia alisada tira a retícula e deixa o resto da imagem como estava", () => {
    const { img } = card({ base: 120, screen: true });
    const soft = softened(img, { x0: 100, y0: 100, x1: 200, y1: 200 }, 1.2);
    const lum = (d: Uint8ClampedArray, x: number, y: number) => d[(y * W + x) * 4];
    expect(Math.abs(lum(soft.data, 150, 150) - lum(soft.data, 151, 150))).toBeLessThan(8);
    expect(lum(soft.data, 50, 50)).toBe(lum(img.data, 50, 50));
    expect(img.data[(150 * W + 150) * 4]).not.toBe(soft.data[(150 * W + 150) * 4]);
  });

  it("a mancha que o modelo inventa na retícula volta à média da vizinhança, com o grão", () => {
    const { img, fill } = card({ base: 120, screen: true });
    const rect = { x0: 100, y0: 40, x1: 400, y1: 100 };
    const hole = new Uint8Array(W * H);
    for (let y = 55; y < 85; y++) hole.fill(1, y * W + 150, y * W + 300);
    // o remendo: retícula boa, com um calombo escuro no meio
    fill(200, 65, 220, 85, [40, 40, 40]);
    const before = img.data[(70 * W + 160) * 4];
    tameLow(img, rect, hole);
    const mean = (x0: number, y0: number) => {
      let acc = 0;
      for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) acc += img.data[(y * W + x) * 4];
      return acc / 36;
    };
    expect(mean(207, 72)).toBeGreaterThan(100);
    // o que já estava na média da vizinhança fica como estava
    expect(img.data[(70 * W + 160) * 4]).toBe(before);
  });

  it("sem referência na janela, a mancha volta à faixa das mesmas linhas", () => {
    // Serra Angel (3ED 40): o buraco da altura inteira da moldura, com a referência só no fim
    const { img, fill } = card({ base: 200, screen: true });
    const rect = { x0: 46, y0: 46, x1: 420, y1: 94 };
    const hole = new Uint8Array(W * H);
    for (let y = 46; y < 94; y++) hole.fill(1, y * W + 46, y * W + 380);
    fill(200, 86, 230, 94, [150, 150, 150]);
    tameLow(img, rect, hole);
    let acc = 0;
    for (let y = 87; y < 93; y++) for (let x = 205; x < 225; x++) acc += img.data[(y * W + x) * 4];
    expect(acc / 120).toBeGreaterThan(180);
  });

  it("o alinhamento do texto pelas linhas: à esquerda longe da margem, centralizado e sem resposta", () => {
    const L = (...v: [number, number][]) => v.map(([left, right]) => ({ left, right }));
    // Elves of Deep Shadow (DRK 76): a caixa de madeira tem o texto a 24 px; a primeira linha começa
    // depois do {T}, que a máscara não pega
    expect(lineAlign93(L([72, 531], [24, 438], [25, 474], [24, 364], [30, 476], [26, 534], [24, 489], [24, 340]), 587, 1)).toBe(false);
    // Stone Giant (LEB 177), na cópia alisada
    expect(lineAlign93(L([30, 466], [22, 489], [22, 455], [21, 496], [23, 448], [22, 393], [27, 468]), 546, 1)).toBe(false);
    // Dingus Egg (2ED 242): o meio das linhas no meio da caixa
    expect(lineAlign93(L([38, 536], [89, 482], [54, 519], [93, 475]), 555, 1)).toBe(true);
    // a linha manchada pela beira, que começa antes das outras, não decide (Arena, PHPR 1)
    expect(lineAlign93(L([11, 517], [48, 537], [47, 536], [48, 544], [47, 519], [47, 543], [47, 496]), 553, 1)).toBe(false);
    // a linha que encosta no lado é a beira, e duas linhas da mesma largura não dizem nada
    expect(lineAlign93(L([25, 546], [5, 544]), 577, 1)).toBe(null);
    expect(lineAlign93(L([0, 552]), 553, 1)).toBe(null);
  });

  it("o texto alinhado à esquerda a 28 px do lado da caixa não sai centralizado", () => {
    const { img, fill } = card({ base: 150 });
    const rect = { x0: 100, y0: 640, x1: 650, y1: 900 };
    fill(rect.x0, rect.y0, rect.x1, rect.y1, [170, 130, 90]);
    const lengths = [420, 360, 480, 300, 440, 200];
    lengths.forEach((n, i) => fill(rect.x0 + 28, 660 + i * 30, rect.x0 + 28 + n, 676 + i * 30, [40, 30, 20]));
    expect(boxCentered93(img, rect)).toBe(false);
    // (pela margem de 22 px, saía centralizado)
    expect(textCentered(maskRegions(img, [{ rect, threshold: 60 }], [])[0], 1, 22)).toBe(true);
    // centralizado, com o meio das linhas no meio da caixa
    fill(rect.x0, rect.y0, rect.x1, rect.y1, [170, 130, 90]);
    lengths.forEach((n, i) => fill(375 - n / 2, 660 + i * 30, 375 + n / 2, 676 + i * 30, [40, 30, 20]));
    expect(boxCentered93(img, rect)).toBe(true);
  });

  it("o estilo do português: claro com sombra, ou gravado, com o contorno e o brilho", () => {
    // a letra clara medida escura demais (a borda suavizada) sobe até 150 de brilho
    const light = old93Layers({ style: "light", fill: [120, 120, 120], edge: [20, 20, 20], ground: 60 });
    expect(light).toEqual([
      [2, "rgba(20, 20, 20, 0.75)"],
      [0, "rgb(150, 150, 150)"],
    ]);
    // a gravada: o brilho, o contorno escuro (no máximo 70 de brilho) e o miolo cinza, 25 acima da moldura
    const dark = old93Layers({ style: "dark", fill: [60, 70, 80], edge: [230, 230, 230], ground: 100 });
    expect(dark).toEqual([
      [1.2, "rgba(230, 230, 230, 0.8)"],
      [0, "rgb(60, 70, 80)", 2],
      [0, "rgb(120, 125, 131)"],
    ]);
    // o miolo fica entre 110 e 205
    expect(old93Layers({ style: "dark", fill: [40, 40, 40], edge: [250, 250, 250], ground: 230 })[2]).toEqual([0, "rgb(200, 205, 211)"]);
    expect(old93Layers({ style: "dark", fill: [40, 40, 40], edge: [250, 250, 250], ground: 40 })[2]).toEqual([0, "rgb(105, 110, 116)"]);
  });
});
