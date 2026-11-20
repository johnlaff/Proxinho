import { describe, expect, it } from "vitest";
import type { RegionMask } from "../../src/engine/erase";
import {
  applyShade,
  clipMasks,
  cutPiece,
  disk,
  holdPixels,
  inkOnly,
  mirrorSides,
  pastePiece,
  ptShape,
  restoreFrame,
  shadeProfile,
  shadeRatio,
  STATION,
  stationBadges,
  stationBands,
  stationBottom,
  stationPlan,
  stationPt,
  stationText,
  withoutFrame,
} from "../../src/engine/station";

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
  const circle = (cx: number, cy: number, r: number, c: Color) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) fill(x, y, x + 1, y + 1, c);
  };
  fill(0, 0, W, H, bg);
  return { img, fill, circle };
}

const gray = (v: number): Color => [v, v, v];
const px = (img: ImageData, x: number, y: number) => Array.from(img.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 3));

/** Selo de nível: anel claro de raio 29, miolo escuro de raio 23 e um "9+" branco no meio. */
function badge(c: ReturnType<typeof canvas>, cy: number) {
  c.circle(STATION.badge.cx, cy, 29, gray(200));
  c.circle(STATION.badge.cx, cy, 23, gray(40));
  c.fill(40, cy - 10, 46, cy + 10, gray(240));
  c.fill(50, cy - 3, 60, cy + 3, gray(240));
}

/** Caixa de P/R: miolo escuro de x 601 a 698 e de `cy` − 26 a `cy` + 26, com anel cinza e números. */
function ptBox(c: ReturnType<typeof canvas>, cy: number, digitsTo = 668) {
  c.fill(596, cy - 31, 704, cy + 31, gray(150));
  c.fill(601, cy - 26, 699, cy + 27, gray(40));
  for (let x = 622; x < digitsTo; x += 12) c.fill(x, cy - 14, x + 7, cy + 14, gray(240));
}

describe("texto das naves com Estacionar", () => {
  it("separa o texto principal das habilidades de cada nível", () => {
    const parts = stationText("Quando esta Espaçonave entrar, crie uma ficha.\nPosicionar\n9+ | Voar, iniciativa");
    expect(parts).toEqual({
      main: "Quando esta Espaçonave entrar, crie uma ficha.\nPosicionar",
      levels: [{ label: "9+", text: "Voar, iniciativa" }],
    });
  });

  it("junta ao nível as linhas que vêm depois dele", () => {
    const parts = stationText(
      "Posicionar\n1+ | Toda vez que um oponente descarta.\n8+ | Voar, toque mortífero\nToda vez que esta Espaçonave ataca.",
    );
    expect(parts?.levels).toEqual([
      { label: "1+", text: "Toda vez que um oponente descarta." },
      { label: "8+", text: "Voar, toque mortífero\nToda vez que esta Espaçonave ataca." },
    ]);
  });

  it("sem nível, sem texto principal ou com nível vazio, a carta sai na original", () => {
    expect(stationText("Voar\nPosicionar")).toBeNull();
    expect(stationText("9+ | Voar")).toBeNull();
    expect(stationText("Posicionar\n9+ | ")).toBeNull();
    expect(stationText(null)).toBeNull();
  });
});

describe("moldura das naves com Estacionar", () => {
  it("acha o pé da caixa pela borda preta abaixo dela", () => {
    const c = canvas(gray(200));
    c.fill(0, 964, W, H, gray(15));
    expect(stationBottom(c.img)).toBe(956);
  });

  it("acha o centro de cada selo pelo anel escuro em volta dos números", () => {
    const c = canvas(gray(200));
    badge(c, 760);
    badge(c, 900);
    // letras escuras ao lado do selo não são selo
    c.fill(66, 700, 90, 720, gray(30));
    const centers = stationBadges(c.img);
    expect(centers).toHaveLength(2);
    expect(Math.abs(centers[0] - 760)).toBeLessThanOrEqual(1);
    expect(Math.abs(centers[1] - 900)).toBeLessThanOrEqual(1);
  });

  it("acha o selo com dois algarismos, que chegam quase à borda do miolo (Dawnsire, 10+ e 20+)", () => {
    const c = canvas(gray(200));
    // o "20+" vai de x 29 a 71, quase de um lado ao outro do miolo (de 25 a 73), e só 10 px
    // acima e abaixo do centro
    c.circle(STATION.badge.cx, 820, 29, gray(200));
    c.circle(STATION.badge.cx, 820, 24, gray(40));
    c.fill(29, 811, 72, 830, gray(240));
    const centers = stationBadges(c.img);
    expect(centers).toHaveLength(1);
    expect(Math.abs(centers[0] - 820)).toBeLessThanOrEqual(1);
  });

  it("tira as faixas dos selos, de baixo para cima, com cada selo no meio da sua", () => {
    expect(stationBands([760, 900], 956)).toEqual([676, 844]);
    // faixa menor que o selo, ou acima da caixa: não é a moldura
    expect(stationBands([930], 956)).toBeNull();
    expect(stationBands([700, 900], 956)).toBeNull();
  });

  it("acha a caixa de P/R mesmo com números que vão até a ponta dela (3/10)", () => {
    const c = canvas(gray(200));
    ptBox(c, 892, 684);
    // a arte escura na moldura da direita emenda com o miolo (Entropic Battlecruiser)
    c.fill(699, 0, 745, H, gray(20));
    const pt = stationPt(c.img, 892);
    expect(pt).not.toBeNull();
    expect(pt!.top).toBe(892 - 26);
    expect(pt!.y0).toBe(892 - 26 - STATION.pt.top);
    expect(pt!.y1).toBe(892 + 27 + STATION.pt.bottom);
    expect(pt!.x0).toBe(601 - STATION.pt.side);
    // o miolo para no limite, sem seguir pela moldura escura
    expect(pt!.x1).toBe(STATION.pt.x1 + 1 + STATION.pt.side);
  });

  it("sem caixa de P/R (planetas), nada", () => {
    const c = canvas(gray(200));
    c.fill(620, 880, 660, 900, gray(30));
    expect(stationPt(c.img, 892)).toBeNull();
  });
});

describe("escurecimento das faixas", () => {
  it("mede quanto a faixa escurece a de cima, sem contar as letras", () => {
    const c = canvas(gray(200));
    c.fill(57, 800, 689, 956, [174, 160, 140]);
    // uma linha de letras escuras atravessando o limite
    c.fill(100, 790, 300, 810, gray(30));
    const [r, g, b] = shadeRatio(c.img, 800, 90, 580);
    expect(r).toBeCloseTo(0.87, 2);
    expect(g).toBeCloseTo(0.8, 2);
    expect(b).toBeCloseTo(0.7, 2);
  });

  it("tira o escurecimento e põe de novo em outro lugar, com a borda suave", () => {
    const c = canvas(gray(200));
    c.fill(57, 800, 689, 956, gray(150));
    const ratio: [number, number, number] = [0.75, 0.75, 0.75];
    const y0 = 656;
    applyShade(c.img, y0, 956, 57, 689, shadeProfile(300, [800 - y0], [ratio]), true);
    expect(px(c.img, 300, 700)[0]).toBe(200);
    expect(Math.abs(px(c.img, 300, 900)[0] - 200)).toBeLessThanOrEqual(1);
    applyShade(c.img, y0, 956, 57, 689, shadeProfile(300, [760 - y0], [ratio]), false);
    expect(px(c.img, 300, 750)[0]).toBe(200);
    expect(Math.abs(px(c.img, 300, 770)[0] - 150)).toBeLessThanOrEqual(1);
    // na rampa, um tom entre os dois
    const mid = px(c.img, 300, 760)[0];
    expect(mid).toBeGreaterThan(155);
    expect(mid).toBeLessThan(195);
    // a moldura fora das colunas da faixa fica como estava
    expect(px(c.img, 30, 900)[0]).toBe(200);
  });

  it("o selo holográfico do pé fica como está", () => {
    const c = canvas(gray(150));
    applyShade(c.img, 656, 956, 57, 689, shadeProfile(300, [100], [[0.5, 0.5, 0.5]]), true, [{ x0: 340, y0: 930, x1: 400, y1: 956 }]);
    expect(px(c.img, 360, 940)[0]).toBe(150);
    expect(px(c.img, 300, 940)[0]).toBe(255);
  });
});

describe("selos, P/R e moldura que mudam de lugar", () => {
  it("recorta o selo redondo e cola em outra altura, só dentro do disco", () => {
    const c = canvas(gray(200));
    badge(c, 760);
    const piece = cutPiece(c.img, { x0: 18, y0: 728, x1: 82, y1: 792 }, disk(49.5, 760, 29.5));
    c.fill(0, 700, W, 960, gray(200));
    pastePiece(c.img, piece, 60);
    expect(px(c.img, 43, 820)[0]).toBe(240);
    expect(px(c.img, 49, 820 - 17)[0]).toBe(40);
    // o canto do retângulo, fora do disco, não leva nada do recorte
    expect(px(c.img, 20, 822 - 30)[0]).toBe(200);
  });

  it("o recorte da caixa de P/R segue a ponta abaulada do anel (The Seriema)", () => {
    const c = canvas(gray(200));
    // miolo mais curto no alto e no pé (de 605 a 689) que no meio (de 597 a 697), anel de 6 px
    const inset = (dy: number) => Math.round(8 * (dy / 26) ** 2);
    for (let dy = -32; dy <= 32; dy++) {
      const k = inset(Math.max(-26, Math.min(26, dy)));
      c.fill(591 + k, 892 + dy, 704 - k, 893 + dy, gray(235));
    }
    for (let dy = -26; dy <= 26; dy++) c.fill(597 + inset(dy), 892 + dy, 698 - inset(dy), 893 + dy, gray(40));
    c.fill(699, 0, 745, H, gray(20));
    const pt = stationPt(c.img, 892)!;
    const shape = ptShape(pt, 1, 1);
    // a ponta do anel no meio, dos dois lados, vai junto (medido só no alto e no pé, ficava)
    expect(shape(591.5, 892.5)).toBe(1);
    expect(shape(703.5, 892.5)).toBe(1);
    // o anel do alto, e o do pé com a sombra (até 8 linhas abaixo do miolo)
    expect(shape(650.5, 866 - 6 + 0.5)).toBe(1);
    expect(shape(650.5, 919 + 7 + 0.5)).toBe(1);
    // o canto do retângulo, longe do anel, fica de fora
    expect(shape(pt.x1 - 0.5, pt.y0 + 0.5)).toBe(0);
    expect(shape(pt.x0 + 0.5, pt.y1 - 0.5)).toBe(0);
  });

  it("o anel escuro leva o recorte, a moldura e a arte que desce por ela não (Entropic Battlecruiser)", () => {
    const c = canvas(gray(180));
    c.fill(694, 0, W, H, gray(20));
    c.fill(700, 0, 720, 900, [120, 60, 200]);
    // miolo e anel cinza-escuro das molduras de artefato, entrando na moldura até 702
    c.fill(596, 866, 703, 920, gray(65));
    c.fill(601, 871, 699, 915, gray(40));
    const rect = { x0: 588, y0: 860, x1: 708, y1: 928 };
    const core = (x: number, y: number) => x >= 601 && x < 699 && y >= 871 && y < 915;
    const cut = withoutFrame(c.img, rect, () => 1, core, STATION.pt.frame, STATION.pt.near);
    expect(cut(698.5, 892.5)).toBe(1);
    expect(cut(701.5, 868.5)).toBe(1);
    // a moldura escura abaixo da ponta do anel e a arte roxa ao lado dela ficam
    expect(cut(705.5, 922.5)).toBe(0);
    expect(cut(710.5, 880.5)).toBe(0);
    // na caixa, antes da moldura, a forma vale como está
    expect(cut(590.5, 862.5)).toBe(1);
    expect(cut(720.5, 880.5)).toBe(0);
  });

  it("refaz a moldura dos lados na vertical onde o selo estava", () => {
    const c = canvas(gray(200));
    c.fill(16, 0, 49, H, [120, 30, 60]);
    c.fill(49, 0, 55, H, gray(240));
    badge(c, 760);
    restoreFrame(c.img, 728, 792, 16, 55);
    expect(px(c.img, 30, 760)).toEqual([120, 30, 60]);
    expect(px(c.img, 52, 750)).toEqual([240, 240, 240]);
  });

  it("com a forma do recorte, a arte que desce pela moldura fora dele fica (Entropic Battlecruiser)", () => {
    const c = canvas(gray(20));
    // arte roxa na moldura, só até 900, e a ponta do anel do P/R entrando nela
    c.fill(700, 0, 720, 900, [120, 60, 200]);
    c.circle(690, 892, 14, gray(235));
    const ring = disk(690, 892, 14.5);
    restoreFrame(c.img, 870, 915, 684, 720, ring);
    // dentro do anel, a coluna refeita entre o de fora logo acima (roxo) e o logo abaixo (escuro)
    expect(px(c.img, 702, 892)[2]).toBeGreaterThan(20);
    expect(px(c.img, 702, 892)[2]).toBeLessThan(200);
    expect(px(c.img, 690, 892)[0]).toBeLessThan(200);
    // fora do anel, a arte e o escuro ficam como estavam
    expect(px(c.img, 712, 880)).toEqual([120, 60, 200]);
    expect(px(c.img, 712, 905)).toEqual([20, 20, 20]);
  });

  it("espelha a caixa para os lados, com o buraco junto", () => {
    const c = canvas(gray(200));
    c.fill(0, 0, 55, H, gray(20));
    c.fill(684, 0, W, H, gray(20));
    c.fill(55, 700, 60, 710, [10, 200, 30]);
    const hole: RegionMask = { rect: { x0: 600, y0: 860, x1: 684, y1: 920 }, mask: new Uint8Array(84 * 60).fill(1), polarity: "dark" };
    const out = mirrorSides(c.img, [hole], 656, 956, 55, 684, 32);
    expect(px(out.img, 54, 705)).toEqual([10, 200, 30]);
    expect(px(out.img, 50, 705)).toEqual([10, 200, 30]);
    expect(px(out.img, 700, 800)[0]).toBe(200);
    // a imagem de entrada fica como estava
    expect(px(c.img, 700, 800)[0]).toBe(20);
    const right = out.masks[out.masks.length - 1];
    expect(right.rect).toEqual({ x0: 684, y0: 656, x1: 716, y1: 956 });
    expect(right.mask[(880 - 656) * 32 + 10]).toBe(1);
    expect(right.mask[(800 - 656) * 32 + 10]).toBe(0);
  });
});

describe("máscara das letras na caixa translúcida", () => {
  it("a pedra escura da arte atrás sai da máscara, as letras pretas e os pingos ficam (EOE 85)", () => {
    const { img, fill } = canvas([185, 185, 185]);
    fill(200, 900, 240, 935, [150, 150, 150]); // pedra da arte: 35 tons abaixo do papel
    fill(300, 905, 330, 925, [150, 150, 150]); // palavra: o miolo das letras é preto
    fill(310, 910, 320, 920, [20, 20, 20]);
    fill(400, 910, 405, 915, [150, 150, 150]); // pingo pequeno sem tinta
    const rect = { x0: 180, y0: 890, x1: 420, y1: 950 };
    const w = rect.x1 - rect.x0;
    const mask = new Uint8Array(w * (rect.y1 - rect.y0));
    const mark = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[(y - rect.y0) * w + x - rect.x0] = 1;
    };
    mark(199, 899, 241, 936);
    mark(299, 904, 331, 926);
    mark(400, 910, 405, 915);
    const out = inkOnly(img, { rect, mask, polarity: "dark" }, 60, 6);
    const at = (x: number, y: number) => out.mask[(y - rect.y0) * w + x - rect.x0];
    expect(at(220, 918)).toBe(0);
    expect(at(301, 906)).toBe(1);
    expect(at(402, 912)).toBe(1);
  });
});

describe("escurecimento das faixas", () => {
  it("o aro branco do selo acima do escurecimento volta como era (Lumen-Class Frigate, promo)", () => {
    const { img, fill } = canvas([150, 150, 150]);
    fill(350, 940, 352, 942, [248, 248, 248]);
    const profile = [0, 1, 2].map(() => new Float32Array(20).fill(0.77));
    const restore = holdPixels(img, [{ x0: 340, y0: 938, x1: 360, y1: 943 }]);
    applyShade(img, 930, 950, 300, 400, profile, true);
    applyShade(img, 930, 950, 300, 400, profile, false);
    expect(img.data[(940 * W + 350) * 4]).toBeLessThan(200); // cortado em 255 e escurecido de novo
    restore();
    expect(img.data[(940 * W + 350) * 4]).toBe(248);
    expect(img.data[(935 * W + 350) * 4]).toBe(150);
  });
});

describe("rede neural em duas metades", () => {
  it("cada metade só leva o buraco das colunas dela", () => {
    const m: RegionMask = { rect: { x0: 100, y0: 700, x1: 110, y1: 702 }, mask: new Uint8Array(20).fill(1), polarity: "dark" };
    const [clipped] = clipMasks([m], 105, 300);
    expect(Array.from(clipped.mask)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    // a máscara de entrada fica como estava; a que cabe inteira volta igual
    expect(m.mask[0]).toBe(1);
    expect(clipMasks([m], 0, 300)[0]).toBe(m);
  });
});

describe("faixas no lugar do texto em português", () => {
  it("põe a mesma folga acima e abaixo de cada texto", () => {
    const plan = stationPlan(60, [30, 90], 656, 956)!;
    const gap = (300 - 180) / 6;
    expect(plan.mainTop).toBe(Math.round(656 + gap));
    expect(plan.bands[0].top).toBe(Math.round(656 + 60 + 2 * gap));
    expect(plan.bands[0].textTop).toBe(Math.round(656 + 60 + 3 * gap));
    expect(plan.bands[1].top).toBe(Math.round(656 + 60 + 30 + 4 * gap));
  });

  it("faixa curta fica com a altura mínima, com o selo inteiro", () => {
    const plan = stationPlan(200, [30], 656, 956)!;
    // a folga sobraria em 35 px; a faixa ficaria com 100. Com texto maior, só cabe a mínima
    const tight = stationPlan(220, [20], 656, 956)!;
    expect(956 - plan.bands[0].top).toBeGreaterThanOrEqual(STATION.minBand);
    expect(956 - tight.bands[0].top).toBeGreaterThanOrEqual(STATION.minBand);
    expect(tight.bands[0].textTop).toBe(Math.round(tight.bands[0].top + (STATION.minBand - 20) / 2));
  });

  it("sem folga mínima, não cabe", () => {
    expect(stationPlan(250, [40], 656, 956)).toBeNull();
  });
});
