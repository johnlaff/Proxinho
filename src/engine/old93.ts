/**
 * Moldura de 1993 (ADR 0039): a das cartas de Alpha (1993) a Alliances (1996), das edições básicas
 * de Beta a 4ª, das Collectors' Editions, de Chronicles, Summer Magic e das promos da época. O
 * Scryfall a chama de `1993`.
 *
 * Como na antiga (ADR 0031), não há barra: o nome e o tipo ficam direto sobre a moldura
 * texturizada (mármore, pedra com bolhas, folhagem, madeira), e saem pela rede neural. Mas as
 * letras mudam com a coleção e a cor: brancas com sombra preta nas molduras escuras de Revised
 * em diante; "gravadas" de Alpha a Unlimited e nas molduras claras (artefato, branca, terreno,
 * dourada), com o contorno escuro, o miolo da cor da moldura ou mais escuro e o brilho do outro
 * lado. Por isso as letras são achadas pelas duas pontas (bem mais claro ou bem mais escuro que a
 * moldura), na imagem alisada (a retícula das digitalizações antigas muda 40 tons de um ponto a
 * outro), e o português sai no estilo medido nelas. Medidas em 149 impressões de 24 coleções
 * (escala de 745 × 1040):
 *
 * - nome: primeira letra em x ≈ 54 a 64 (69 a 78 nas terras da Arena League), na Goudy Medieval
 *   de ≈ 41,5 px, com a linha de base de 70 a 87 conforme a coleção (medida em cada carta);
 * - custo: círculos de ≈ 35 px, um a cada 40,5, o último acabando em x ≈ 676 a 681;
 * - tipo: primeira letra em x ≈ 62 a 79, linha de base de 606 a 616, numa serifada de ≈ 33 px;
 * - símbolo da coleção: na ponta direita da linha de tipo, de x ≈ 570 (a cimitarra de Arabian
 *   Nights) a 690; as edições básicas até a Revised e as Collectors' Editions não têm;
 * - caixa: o papel de x ≈ 80 a 104 até 642 a 670 e de y ≈ 615 a 632 até 910 a 946, conforme a
 *   cor: bisel, pergaminho queimado nas pretas, tábuas nas verdes, papel texturizado nas brancas.
 */
import { insideBoxSides, maskRegions, type RegionMask } from "./erase";
import { BASE_H, BASE_W, type Rect } from "./geometry";
import { textCentered, textLines } from "./token";

export const OLD93 = {
  /** onde se procuram as letras do nome (até o custo): a faixa delas fica entre `peak` */
  name: { x0: 46, y0: 34, y1: 104, peak: [58, 82] as const, x: 56, xMin: 49, xMax: 84, size: 41.5, baseMin: 66, baseMax: 92 },
  /** e as do tipo (até o símbolo), entre o pé da arte e o alto da caixa */
  type: { x0: 52, y0: 574, x1: 700, peak: 596, x: 66, xMin: 55, xMax: 92, size: 33, baseMin: 598, baseMax: 622 },
  /** custo de mana: o último círculo acaba em x ≈ 681, um a cada 40,5 px */
  cost: { right: 681, pitch: 40.5 },
  /** a caixa por fora, onde se procura o papel (ver `oldBox93`), e a de reserva */
  box: { x0: 76, y0: 610, x1: 672, y1: 942 },
  boxFallback: { x0: 90, y0: 626, x1: 655, y1: 922 },
  /** folga do texto em PT até o papel: esquerda, cima, direita, baixo */
  boxPad: { x0: 9, y0: 6, x1: 9, y1: 5 },
  /** o símbolo da coleção nunca começa antes disso; sem símbolo achado, o tipo vai até `typeEnd` */
  symbolMin: 560,
  typeEnd: 600,
};

/** Onde começa o custo de mana no alto: cada símbolo ocupa 40,5 px, o último acabando em 681. */
export function oldCostLeft93(manaCost: string | null | undefined): number {
  const n = manaCost?.match(/\{[^}]+\}/g)?.length ?? 0;
  return n ? OLD93.cost.right - OLD93.cost.pitch * n : 700;
}

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

type Rgb = [number, number, number];

/** As letras de uma linha da moldura de 1993, medidas na imagem. */
export interface InkLetters {
  /** letras, contorno e sombra, com 3 px de folga, na grade de `rect` */
  mask: Uint8Array;
  rect: Rect;
  /** trechos de colunas com letra (o vão entre palavras não separa), em pixels da imagem */
  blocks: { x0: number; x1: number }[];
  /** última linha com um quarto das letras da linha mais cheia, ou `null` */
  baseline: number | null;
  /**
   * O estilo: `light` (letra clara com sombra escura) ou `dark` (gravada: letra escura com o
   * brilho claro); `fill` é a cor da letra e `edge` a da sombra (ou do brilho), na imagem alisada.
   */
  style: "light" | "dark";
  fill: Rgb;
  edge: Rgb;
  /** a linha mais cheia de letras e as linhas de cima e de baixo das letras, em pixels da imagem */
  top: number | null;
  bottom: number | null;
  /** o brilho da moldura atrás das letras (mediana do tom das fatias) */
  ground: number;
}

/**
 * Acha as letras de uma linha da moldura de 1993. A imagem é alisada (gaussiana de 1,2 px: a
 * retícula de Alpha a Revised some e o traço das letras fica) e o tom da moldura é a mediana de
 * cada fatia de 24 px; letra é o que fica bem mais claro (e quase sem cor) ou bem mais escuro que
 * ela, além do ruído medido da moldura. Traço comprido na horizontal (o bisel da arte e da caixa)
 * ou na vertical (a beira da moldura) não é letra, e só ficam as manchas que passam pela faixa das
 * letras: o trecho de linhas em volta da mais cheia (procurada entre `peak`, em pixels da imagem)
 * com um quarto ou mais dela, contando só as manchas de 8 a 50 px de altura. As manchas pequenas
 * perto de uma letra ficam: o pingo do "i", o apóstrofo, a ponta de uma haste ou da barra do "T"
 * separada pela textura. Na máscara entram também a borda suavizada e a sombra fraca ligadas às
 * letras (histerese, até 12 px delas e 14 abaixo do pé), com 3 px de folga.
 */
export function inkLetters(img: ImageData, rect: Rect, peak: readonly [number, number], unit = img.width / BASE_W): InkLetters {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const d = img.data;
  // a imagem alisada, nos três canais: na horizontal e depois na vertical (com as linhas de fora
  // do retângulo, para a beira não sair mais escura)
  const sigma = 1.2 * unit;
  const rad = Math.max(1, Math.ceil(sigma * 2.5));
  const ker: number[] = [];
  for (let i = -rad; i <= rad; i++) ker.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const ks = ker.reduce((a, b) => a + b, 0);
  const hh = h + 2 * rad;
  const across = new Float32Array(w * hh * 3);
  for (let y = 0; y < hh; y++) {
    const iy = Math.min(img.height - 1, Math.max(0, rect.y0 + y - rad));
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) {
          const xx = Math.min(img.width - 1, Math.max(0, rect.x0 + x + i));
          acc += d[(iy * img.width + xx) * 4 + c] * ker[i + rad];
        }
        across[(y * w + x) * 3 + c] = acc / ks;
      }
  }
  const rgb = new Float32Array(w * h * 3);
  const L = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += across[((y + rad + i) * w + x) * 3 + c] * ker[i + rad];
        rgb[k * 3 + c] = acc / ks;
      }
      const r = rgb[k * 3];
      const g = rgb[k * 3 + 1];
      const b = rgb[k * 3 + 2];
      L[k] = 0.299 * r + 0.587 * g + 0.114 * b;
      sat[k] = Math.max(r, g, b) - Math.min(r, g, b);
    }
  // tom da moldura: mediana de cada fatia, interpolada entre os centros delas
  const step = Math.max(8, Math.round(24 * unit));
  const centers: number[] = [];
  const tones: number[] = [];
  for (let x0 = 0; x0 < w; x0 += step) {
    const x1 = Math.min(w, x0 + step);
    const vals: number[] = [];
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) vals.push(L[y * w + x]);
    centers.push((x0 + x1 - 1) / 2);
    tones.push(medianOf(vals));
  }
  const bg = new Float32Array(w);
  for (let x = 0, j = 0; x < w; x++) {
    while (j < centers.length - 2 && x > centers[j + 1]) j++;
    if (centers.length === 1 || x <= centers[0]) bg[x] = tones[0];
    else if (x >= centers[centers.length - 1]) bg[x] = tones[tones.length - 1];
    else {
      const t = (x - centers[j]) / (centers[j + 1] - centers[j]);
      bg[x] = tones[j] * (1 - t) + tones[j + 1] * t;
    }
  }
  // o limiar: 26 tons, ou 3,2 vezes o desvio mediano da moldura (a pedra com bolhas das pretas)
  const dev: number[] = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) dev.push(Math.abs(L[y * w + x] - bg[x]));
  const thr = Math.max(26, medianOf(dev) * 3.2);
  // polaridade de cada pixel: 1 claro (letra clara, ou o brilho da gravada), -1 escuro, 0 moldura
  const pol = new Int8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const lift = Math.max(thr, Math.min(45, (255 - bg[x]) * 0.55));
      if (L[k] >= bg[x] + lift && L[k] >= 120 && sat[k] <= 90) pol[k] = 1;
      else if (L[k] <= bg[x] - thr * 1.15) pol[k] = -1;
    }
  // traço comprido de uma polaridade só: o bisel e os fios na horizontal, a beira na vertical
  const maxRun = Math.round(45 * unit);
  const maxColumn = Math.round(36 * unit);
  for (const s of [1, -1]) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w;) {
        if (pol[y * w + x] !== s) {
          x++;
          continue;
        }
        let e = x;
        while (e < w && pol[y * w + e] === s) e++;
        if (e - x > maxRun) pol.fill(0, y * w + x, y * w + e);
        x = e;
      }
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h;) {
        if (pol[y * w + x] !== s) {
          y++;
          continue;
        }
        let e = y;
        while (e < h && pol[e * w + x] === s) e++;
        if (e - y > maxColumn) for (let yy = y; yy < e; yy++) pol[yy * w + x] = 0;
        y = e;
      }
  }
  const core = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) core[k] = pol[k] ? 1 : 0;
  // manchas (as duas polaridades juntas: a letra e a sombra dela são uma mancha só)
  type Comp = { pix: number[]; x0: number; x1: number; y0: number; y1: number };
  const comps: Comp[] = [];
  const seen = new Uint8Array(w * h);
  const tall = Math.round(8 * unit);
  const high = Math.round(50 * unit);
  const count = new Uint16Array(h);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!core[s0] || seen[s0]) continue;
    const c: Comp = { pix: [s0], x0: w, x1: -1, y0: h, y1: -1 };
    seen[s0] = 1;
    for (let j = 0; j < c.pix.length; j++) {
      const q = c.pix[j];
      const x = q % w;
      const y = (q - x) / w;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const r = yy * w + xx;
          if (core[r] && !seen[r]) {
            seen[r] = 1;
            c.pix.push(r);
          }
        }
    }
    comps.push(c);
    if (c.y1 - c.y0 + 1 >= tall && c.y1 - c.y0 < high) for (const q of c.pix) count[Math.floor(q / w)]++;
  }
  const p0 = Math.max(0, Math.round(peak[0]) - rect.y0);
  const p1 = Math.min(h - 1, Math.round(peak[1]) - rect.y0);
  let top = p0;
  for (let y = p0; y <= p1; y++) if (count[y] > count[top]) top = y;
  let bandTop = top;
  let bandBottom = top;
  while (bandTop > 0 && count[bandTop - 1] >= count[top] * 0.25) bandTop--;
  while (bandBottom < h - 1 && count[bandBottom + 1] >= count[top] * 0.25) bandBottom++;
  const inBand = (c: Comp) => count[top] > 0 && c.y0 <= bandBottom && c.y1 >= bandTop && c.y1 - c.y0 + 1 >= tall;
  const letters = comps.filter(inBand);
  const letterTop = Math.min(...letters.map((c) => c.y0));
  const letterBottom = Math.max(...letters.map((c) => c.y1));
  // (até 10 px acima ou abaixo: o apóstrofo de "Urza's", acima do "a" baixo, ficava no ar sobre o
  // português, Urza's Tower, CHR 116c)
  // E ao lado, na altura da letra, até 10 px: a ponta da barra do "T", solta da haste pela borda
  // suavizada, ficava como um risco claro ao lado do português (Tarpan, ICE 267). E na diagonal,
  // até 6 px para cada lado: o apóstrofo depois do "s" baixo ficava como um acento sobre o "de"
  // do português (Wizards' School, HML 115)
  const near = Math.round(10 * unit);
  const reachX = Math.round(2 * unit);
  const corner = Math.round(6 * unit);
  const isMark = (c: Comp) =>
    c.x1 - c.x0 < 12 * unit &&
    c.y0 >= letterTop - 1 &&
    c.y1 <= letterBottom + 1 &&
    letters.some((l) => {
      const gapX = Math.max(l.x0 - c.x1, c.x0 - l.x1);
      const gapY = Math.max(l.y0 - c.y1, c.y0 - l.y1);
      return (gapX <= reachX && gapY <= near) || (gapY <= 0 && gapX <= near) || (gapX <= corner && gapY <= corner);
    });
  for (const c of comps) if (!inBand(c) && !isMark(c)) for (const q of c.pix) core[q] = 0;
  // colunas com letra, em trechos (o vão entre palavras, até 12 px, não separa)
  const cols = new Uint16Array(w);
  const rows = new Uint16Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (core[y * w + x]) {
        cols[x]++;
        rows[y]++;
      }
  const blocks: { x0: number; x1: number }[] = [];
  const join = Math.round(12 * unit);
  for (let x = 0; x < w; x++) {
    if (cols[x] < 2) continue;
    const last = blocks[blocks.length - 1];
    if (last && x - last.x1 <= join) last.x1 = x + 1;
    else blocks.push({ x0: x, x1: x + 1 });
  }
  let most = 0;
  for (let y = 0; y < h; y++) most = Math.max(most, rows[y]);
  let baseline: number | null = null;
  if (most > 0) for (let y = 0; y < h; y++) if (rows[y] >= most * 0.25) baseline = rect.y0 + y + 1;
  // o estilo: a polaridade que mais aparece nas letras. A cor de cada uma vem da imagem como é,
  // da metade mais forte dos pixels (a mais clara das claras, a mais escura das escuras): na
  // alisada, e com a borda suavizada, a letra branca saía cinza e o português, apagado
  const tone = (s: number): Rgb | null => {
    const px: { l: number; c: Rgb }[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!core[k] || pol[k] !== s) continue;
        const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
        px.push({ l: 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], c: [d[i], d[i + 1], d[i + 2]] });
      }
    if (!px.length) return null;
    px.sort((a, b) => (s > 0 ? b.l - a.l : a.l - b.l));
    const half = px.slice(0, Math.max(1, px.length >> 1));
    return [0, 1, 2].map((c) => medianOf(half.map((p) => p.c[c]))) as Rgb;
  };
  let bright = 0;
  let dark = 0;
  for (let k = 0; k < w * h; k++) {
    if (!core[k]) continue;
    if (pol[k] > 0) bright++;
    else dark++;
  }
  const frame = medianOf(Array.from(bg));
  // sem letra nenhuma achada, o estilo vem da moldura: gravada nas claras, clara nas escuras
  const style = bright + dark === 0 ? (frame > 140 ? "dark" : "light") : bright >= dark * 0.6 ? "light" : "dark";
  const lighter: Rgb = [frame + 45, frame + 45, frame + 45].map((v) => Math.min(255, v)) as Rgb;
  const light = tone(1) ?? (style === "light" ? [236, 234, 228] : lighter);
  const shade = tone(-1) ?? [20, 20, 20];
  // Na máscara, também a borda suavizada e a sombra fraca ligadas às letras, até 12 px delas e 14
  // abaixo do pé das da faixa (histerese: metade do limiar). Na moldura manchada o limiar sobe, e
  // a sombra das letras claras ficava embaixo do português (Enchant Creature, Lure, 3ED 212); o
  // rabo fino do "S" de Beta, que desce em curva para a esquerda, alisado fica fraco e sobrava ao
  // lado do português (Stone Giant, LEB 177); e a volta de baixo do "g", solta dele pela retícula,
  // desce 13 px abaixo da linha de base (Plague Rats, LEB 122)
  const reach = new Uint8Array(w * h);
  let front: number[] = [];
  for (let k = 0; k < w * h; k++)
    if (core[k]) {
      reach[k] = 1;
      front.push(k);
    }
  const weak = (k: number, x: number) => {
    const lift = Math.max(thr, Math.min(45, (255 - bg[x]) * 0.55));
    return (L[k] >= bg[x] + lift * 0.5 && sat[k] <= 90) || L[k] <= bg[x] - thr * 0.6;
  };
  const yMin = letters.length ? Math.max(0, letterTop - 2) : 0;
  const yMax = letters.length ? Math.min(h - 1, letterBottom + Math.round(14 * unit)) : h - 1;
  for (let step = 0; step < Math.round(12 * unit) && front.length; step++) {
    const next: number[] = [];
    for (const q of front) {
      const x = q % w;
      const y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < yMin || yy > yMax) continue;
          const r = yy * w + xx;
          if (!reach[r] && weak(r, xx)) {
            reach[r] = 1;
            next.push(r);
          }
        }
    }
    front = next;
  }
  // máscara: letra e sombra, com 3 px de folga (cobre o miolo da gravada entre o contorno e o brilho)
  const grow = Math.max(1, Math.round(3 * unit));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!reach[y * w + x]) continue;
      for (let yy = Math.max(0, y - grow); yy <= Math.min(h - 1, y + grow); yy++)
        mask.fill(1, yy * w + Math.max(0, x - grow), yy * w + Math.min(w, x + grow + 1));
    }
  return {
    mask,
    rect,
    blocks: blocks.filter((b) => b.x1 - b.x0 >= 3 * unit).map((b) => ({ x0: rect.x0 + b.x0, x1: rect.x0 + b.x1 })),
    baseline,
    style,
    fill: style === "light" ? light : shade,
    edge: style === "light" ? shade : light,
    top: letters.length ? rect.y0 + letterTop : null,
    bottom: letters.length ? rect.y0 + letterBottom : null,
    ground: frame,
  };
}

/** A faixa das letras de uma linha e os trechos de colunas com letra, em pixels da imagem. */
export interface InkBand {
  top: number;
  bottom: number;
  segs: { x0: number; x1: number }[];
}

/**
 * A faixa das letras pela energia da imagem: a média, linha a linha, da diferença de brilho entre
 * colunas vizinhas na imagem bem alisada (gaussiana de 1,6 px). A retícula das digitalizações
 * antigas some, o traço das letras não: mesmo as gravadas finas de Alpha a Unlimited, que a medida
 * pixel a pixel (`inkLetters`) acha pela metade, enchem a faixa. O fio do bisel, na horizontal,
 * quase não conta. A faixa são as linhas em volta da mais forte (procurada entre `peak`, em pixels
 * da imagem) com 45% ou mais da energia dela acima do fundo (o quinto mais fraco das linhas); a de
 * baixo é a linha de base, a de cima, o alto das letras. Nas colunas da faixa, os trechos com mais
 * de 30% da energia das colunas mais fortes (o percentil 80, alisada em 9 px), unidos por vãos de
 * até `join` px. A beira da moldura, à esquerda, entra no primeiro trecho: o começo dele não vale
 * como começo das letras, só o fim.
 */
export function inkBand(img: ImageData, rect: Rect, peak: readonly [number, number], unit = img.width / BASE_W, join = 22 * unit): InkBand {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const d = img.data;
  const sigma = 1.6 * unit;
  const rad = Math.max(1, Math.ceil(sigma * 2.5));
  const ker: number[] = [];
  for (let i = -rad; i <= rad; i++) ker.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const ks = ker.reduce((a, b) => a + b, 0);
  const hh = h + 2 * rad;
  const across = new Float32Array(w * hh);
  for (let y = 0; y < hh; y++) {
    const iy = Math.min(img.height - 1, Math.max(0, rect.y0 + y - rad));
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -rad; i <= rad; i++) {
        const k = (iy * img.width + Math.min(img.width - 1, Math.max(0, rect.x0 + x + i))) * 4;
        acc += (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) * ker[i + rad];
      }
      across[y * w + x] = acc / ks;
    }
  }
  const L = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += across[(y + rad + i) * w + x] * ker[i + rad];
      L[y * w + x] = acc / ks;
    }
  const gx = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 1; x < w - 1; x++) gx[y * w + x] = Math.abs(L[y * w + x + 1] - L[y * w + x - 1]) / 2;
  const raw = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = 0; x < w; x++) acc += gx[y * w + x];
    raw[y] = acc / w;
  }
  const rows = Array.from(raw, (_, y) => {
    let acc = 0;
    let n = 0;
    for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++, n++) acc += raw[j];
    return acc / n;
  });
  const floor = [...rows].sort((a, b) => a - b)[Math.floor(h * 0.2)];
  const p0 = Math.max(0, Math.min(h - 1, Math.round(peak[0]) - rect.y0));
  const p1 = Math.max(p0, Math.min(h - 1, Math.round(peak[1]) - rect.y0));
  let pk = p0;
  for (let y = p0; y <= p1; y++) if (rows[y] > rows[pk]) pk = y;
  const level = floor + (rows[pk] - floor) * 0.45;
  let top = pk;
  let bottom = pk;
  while (top > 0 && rows[top - 1] >= level) top--;
  while (bottom < h - 1 && rows[bottom + 1] >= level) bottom++;
  const col = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = top; y <= bottom; y++) acc += gx[y * w + x];
    col[x] = acc / (bottom - top + 1);
  }
  const reach = Math.max(1, Math.round(4 * unit));
  const smooth = Array.from(col, (_, x) => {
    let acc = 0;
    let n = 0;
    for (let j = Math.max(0, x - reach); j <= Math.min(w - 1, x + reach); j++, n++) acc += col[j];
    return acc / n;
  });
  const strong = [...smooth].sort((a, b) => a - b)[Math.floor(w * 0.8)];
  const on = Math.max(strong * 0.3, 2);
  const segs: { x0: number; x1: number }[] = [];
  for (let x = 0; x < w; x++) {
    if (smooth[x] <= on) continue;
    const last = segs[segs.length - 1];
    if (last && x - last.x1 <= join) last.x1 = x + 1;
    else segs.push({ x0: x, x1: x + 1 });
  }
  return {
    top: rect.y0 + top,
    bottom: rect.y0 + bottom + 1,
    segs: segs.map((g) => ({ x0: rect.x0 + g.x0, x1: rect.x0 + g.x1 })),
  };
}

/**
 * Corta as letras no fim do texto: o que vem depois de um vão de mais de `gap` px (as bolhas da
 * pedra das molduras pretas, a mancha de um fio) sai dos trechos e da máscara. Devolve o fim.
 */
export function trimAfterGap(letters: InkLetters, gap: number): number {
  const { blocks, rect, mask } = letters;
  let end = 1;
  while (end < blocks.length && blocks[end].x0 - blocks[end - 1].x1 <= gap) end++;
  if (!blocks.length) return rect.x0;
  const last = blocks[end - 1].x1;
  blocks.splice(end);
  const w = rect.x1 - rect.x0;
  const cut = Math.min(w, last + Math.round(gap / 3) - rect.x0);
  for (let y = 0; y < rect.y1 - rect.y0; y++) mask.fill(0, y * w + Math.max(0, cut), (y + 1) * w);
  return last;
}

/**
 * O papel da caixa de texto (escala da imagem). Cada lado vem do fio de dentro do bisel
 * (`insideBoxSides`, na caixa com bisel) ou, sem fio achado, de onde a cor deixa de ser a do papel
 * e passa a ser a da moldura em volta: de cada lado do miolo para fora, a primeira coluna (ou
 * linha) em que 70% dos pixels já estão mais perto da moldura que do papel. Assim a medida para na
 * beira do pergaminho queimado das pretas, nas tábuas das verdes e no papel texturizado das
 * brancas, que não têm fio. Sem nenhum dos dois (papel e moldura da mesma cor), a medida fixa.
 */
export function oldBox93(img: ImageData): Rect {
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const B = OLD93.box;
  const outer = { x0: Math.round(B.x0 * fx), y0: Math.round(B.y0 * fy), x1: Math.round(B.x1 * fx), y1: Math.round(B.y1 * fy) };
  const ins = insideBoxSides(img, outer, Math.round(34 * fx), false);
  const d = img.data;
  const X = (v: number) => Math.round(v * fx);
  const Y = (v: number) => Math.round(v * fy);
  const medColor = (x0: number, y0: number, x1: number, y1: number): Rgb => {
    const ch: number[][] = [[], [], []];
    for (let y = Y(y0); y < Y(y1); y += 2)
      for (let x = X(x0); x < X(x1); x += 2) for (let c = 0; c < 3; c++) ch[c].push(d[(y * img.width + x) * 4 + c]);
    return ch.map(medianOf) as Rgb;
  };
  const paper = medColor(150, 670, 590, 870);
  const left = medColor(64, 700, 74, 850);
  const right = medColor(676, 700, 686, 850);
  const v = [0, 1, 2].map((c) => (left[c] + right[c]) / 2 - paper[c]);
  const n2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
  // 0 no papel, 1 na moldura
  const t = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return ((d[i] - paper[0]) * v[0] + (d[i + 1] - paper[1]) * v[1] + (d[i + 2] - paper[2]) * v[2]) / n2;
  };
  const q30 = (vals: number[]) => [...vals].sort((a, b) => a - b)[Math.floor(vals.length * 0.3)] ?? 0;
  const col = (x: number) => {
    const a: number[] = [];
    for (let y = Y(690); y < Y(850); y++) a.push(t(x, y));
    return q30(a);
  };
  const row = (y: number) => {
    const a: number[] = [];
    for (let x = X(190); x < X(550); x++) a.push(t(x, y));
    return q30(a);
  };
  // do miolo para fora até a primeira coluna (ou linha) da moldura; `null` se chega ao limite
  const walk = (from: number, limit: number, f: (v: number) => number): number | null => {
    const dir = limit > from ? 1 : -1;
    for (let p = from; p !== limit; p += dir) if (f(p + dir) >= 0.5) return p + (dir > 0 ? 1 : 0);
    return null;
  };
  const apart = Math.sqrt(n2) >= 25;
  const byColor = apart
    ? {
        x0: walk(X(150), X(66), col),
        y0: walk(Y(670), Y(612), row),
        x1: walk(X(590) - 1, X(684), col),
        y1: walk(Y(870) - 1, Y(945), row),
      }
    : { x0: null, y0: null, x1: null, y1: null };
  const F = OLD93.boxFallback;
  const fallback = { x0: X(F.x0), y0: Y(F.y0), x1: X(F.x1), y1: Y(F.y1) };
  const side = (k: keyof Rect) => (ins[k] !== outer[k] ? ins[k] : (byColor[k] ?? fallback[k]));
  return { x0: side("x0"), y0: side("y0"), x1: side("x1"), y1: side("y1") };
}

/**
 * As letras da caixa de texto (ver `maskRegions`), medidas numa cópia alisada da caixa (gaussiana
 * de 1 px): na retícula forte das digitalizações de Alpha a Unlimited, das Collectors' Editions e
 * de Legends, o papel muda tanto de um ponto a outro que o limiar medido nele passava do contraste
 * das letras, e a máscara saía vazia (o inglês ficava embaixo do português). No papel texturizado
 * das brancas, a cópia alisada também tira da máscara a textura que passava por letra. Sem o limiar
 * por ladrilho (`tiles`): no papel de água das azuis de Revised, com veios brancos, ele subia nos
 * ladrilhos agitados e palavras inteiras ficavam fora da máscara, em cacos embaixo do português
 * (Control Magic, 2ED 53).
 */
export function boxLetters93(img: ImageData, rect: Rect, parchment = true): RegionMask & { rim: Rect[] } {
  const unit = img.width / BASE_W;
  const soft = softened(img, rect, unit);
  const m = maskRegions(soft, [{ rect, threshold: 14, colorThreshold: 34, stains: true, tiles: false }], [])[0];
  const w = m.rect.x1 - m.rect.x0;
  const h = m.rect.y1 - m.rect.y0;
  const depthY = Math.round(14 * unit);
  const depthX = Math.round(10 * unit);
  const sides = burntSides(soft, m.rect);
  dropEdgeStains(m.mask, w, h, depthY, depthX, Math.round(4 * unit), sides, edgeInk(soft, m.rect, depthY, depthX, sides));
  if (!parchment) {
    const pad = Math.round(3 * unit);
    const bottom = paperRect93(img, m.rect, unit).y1 - m.rect.y0;
    if (bottom < h) keepInk(soft, m.rect, m.mask, bottom, h, pad);
  }
  dropBottomRule(soft, m.rect, m.mask, depthY, Math.round(3 * unit));
  return { ...m, rim: burntRim(soft, m.rect, m.mask, depthY, depthX, sides) };
}

/**
 * Alinhamento do texto em inglês da caixa pelas linhas medidas (`textLines`, em pixels a partir do
 * lado esquerdo da caixa de largura `w`): `false` alinhado à esquerda, `true` centralizado e `null`
 * quando as linhas não dizem. A linha que encosta num lado da caixa é a beira ou a textura, não
 * texto, e fica de fora. Alinhado à esquerda: três linhas ou mais (e 60% delas) começam juntas e
 * o meio delas muda, ou uma linha que começa com a primeira acaba bem à esquerda do meio.
 * Centralizado: o meio de todas no meio da caixa, com o começo mudando de uma para outra (ou uma
 * linha só, longe da margem). O texto das caixas de 1993 começa de 15 a 31 px para dentro, e a
 * caixa de madeira das verdes tem o texto a 28 px: pela margem só (`textCentered` com 22 px), o
 * texto alinhado à esquerda saía centralizado em português (Elves of Deep Shadow, DRK 76).
 */
export function lineAlign93(lines: { left: number; right: number }[], w: number, unit: number): boolean | null {
  const ok = lines.filter((l) => l.left > 10 * unit && l.right < w - 4 * unit);
  if (!ok.length) return null;
  const off = ok.map((l) => (l.left + l.right) / 2 - w / 2);
  const first = Math.min(...ok.map((l) => l.left));
  // o começo da maioria (uma linha manchada pela beira começa antes das outras)
  const from = (a: number, tol: number) => ok.filter((l) => Math.abs(l.left - a) <= tol * unit).length;
  const anchor = ok.map((l) => l.left).reduce((a, b) => (from(b, 6) > from(a, 6) ? b : a));
  if (from(anchor, 6) >= Math.max(3, ok.length * 0.6) && Math.max(...off) - Math.min(...off) > 24 * unit) return false;
  if (from(anchor, 8) >= 2 && ok.some((l, i) => off[i] < -24 * unit && Math.abs(l.left - anchor) <= 8 * unit)) return false;
  if (off.every((o) => Math.abs(o) <= 16 * unit)) {
    const lefts = ok.map((l) => l.left);
    if (ok.length >= 2 && Math.max(...lefts) - Math.min(...lefts) > 12 * unit) return true;
    if (ok.length === 1 && first > 30 * unit) return true;
  }
  return null;
}

/**
 * O texto em inglês da caixa de 1993 está centralizado? As linhas são medidas na imagem como está
 * e, sem resposta, numa cópia alisada (na retícula forte de Alpha a Unlimited as letras pequenas
 * saem da máscara aos pedaços: Stone Giant, LEA 176 e LEB 177, saía centralizado); sem resposta
 * de nenhuma, vale a margem (`textCentered` com 22 px).
 */
export function boxCentered93(img: ImageData, rect: Rect): boolean {
  const unit = img.width / BASE_W;
  const w = rect.x1 - rect.x0;
  const plain = maskRegions(img, [{ rect, threshold: 60 }], [])[0];
  const soft = maskRegions(softened(img, rect, unit), [{ rect, threshold: 60 }], [])[0];
  return (
    lineAlign93(textLines(plain, unit), w, unit) ?? lineAlign93(textLines(soft, unit), w, unit) ?? textCentered(plain, unit, 22) === true
  );
}

/**
 * O fio escuro do pé da caixa, quando a medida da caixa passa dele (Steal Artifact, CEI 82: a medida
 * ia até a moldura, abaixo do fio): a máscara pegava metade dele, e o fio saía em tracinhos, com o
 * papel no lugar do resto. Nas `depth` linhas de baixo, a primeira linha escura de ponta a ponta
 * (75% dos pixels 40 tons ou mais abaixo do papel), quando é um fio (até 4 linhas, com a moldura
 * depois dele, mais clara), sai da máscara com tudo abaixo dela, a sombra do bisel logo acima dele
 * (as linhas inteiras com a mediana 8 tons ou mais abaixo do papel, até 8 px) e `pad` linhas acima
 * (a folga da máscara), menos a tinta que passa por ali (80 tons abaixo da mediana da linha) e a
 * folga dela. Com a sombra no buraco, a rede neural a escurecia e esticava, uma faixa cinza acima
 * do fio (Seeker, LEG 35). A beira queimada, escura até o fim da medida, fica com `dropEdgeStains`.
 */
export function dropBottomRule(img: ImageData, rect: Rect, mask: Uint8Array, depth: number, pad: number): void {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const d = img.data;
  const lum = (x: number, y: number) => {
    const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
    return (d[i] + d[i + 1] + d[i + 2]) / 3;
  };
  const paper: number[] = [];
  for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.7); y += 3) for (let x = 0; x < w; x += 3) paper.push(lum(x, y));
  const ground = medianOf(paper);
  const dark = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (lum(x, y) < ground - 40) n++;
    return n >= w * 0.75;
  };
  for (let y = Math.max(0, h - depth); y < h; y++) {
    if (!dark(y)) continue;
    // um fio: acaba antes do fim da medida (a beira queimada vai até o fim, e fica com `dropEdgeStains`)
    let end = y;
    while (end < h && dark(end)) end++;
    const unit = img.width / BASE_W;
    if (end - y > Math.round(4 * unit) || end >= h) return;
    const rowMedian = (r: number) => {
      const v: number[] = [];
      for (let x = 0; x < w; x++) v.push(lum(x, r));
      return medianOf(v);
    };
    let top = y;
    while (top > 0 && y - top < Math.round(8 * unit) && rowMedian(top - 1) < ground - 8) top--;
    // a tinta entre a folga e o fio fica, com a folga dela
    keepInk(img, rect, mask, Math.max(0, top - pad), y, pad);
    mask.fill(0, y * w, h * w);
    return;
  }
}

/**
 * Nas linhas `from` a `to` (na grade de `rect`), só a tinta fica na máscara: o pixel 80 tons ou
 * mais abaixo da mediana da linha (as letras pretas; a sombra, o fio e o bisel, não), com `pad`
 * de folga. Muda a máscara no lugar.
 */
export function keepInk(img: ImageData, rect: Rect, mask: Uint8Array, from: number, to: number, pad: number): void {
  const w = rect.x1 - rect.x0;
  const d = img.data;
  const lum = (x: number, y: number) => {
    const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
    return (d[i] + d[i + 1] + d[i + 2]) / 3;
  };
  if (to <= from) return;
  const ink = new Uint8Array(w * (to - from));
  for (let r = from; r < to; r++) {
    const v: number[] = [];
    for (let x = 0; x < w; x++) v.push(lum(x, r));
    const m = medianOf(v);
    for (let x = 0; x < w; x++) if (lum(x, r) < m - 80) ink[(r - from) * w + x] = 1;
  }
  for (let r = from; r < to; r++)
    for (let x = 0; x < w; x++) {
      if (!mask[r * w + x]) continue;
      let near = false;
      for (let dy = -pad; dy <= pad && !near; dy++) {
        const rr = r + dy;
        if (rr < from || rr >= to) continue;
        for (let dx = -pad; dx <= pad; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && ink[(rr - from) * w + xx]) {
            near = true;
            break;
          }
        }
      }
      if (!near) mask[r * w + x] = 0;
    }
}

/**
 * A beira queimada que fica (fora da máscara), em trechos de uma linha (escala da imagem): na
 * faixa de cada lado queimado (ver `dropEdgeStains`), o que fica 20 tons ou mais abaixo do papel.
 * Ela não serve de fonte do apagamento: com a última linha logo acima da beira de baixo, o
 * preenchimento puxava o escuro dela para cima, em manchas no lugar das letras (Frozen Shade,
 * CEI 110).
 */
export function burntRim(img: ImageData, rect: Rect, mask: Uint8Array, depthY: number, depthX: number, sides: Sides): Rect[] {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const d = img.data;
  const L = (x: number, y: number) => {
    const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  const all: number[] = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) all.push(L(x, y));
  const paper = medianOf(all);
  const band = (x: number, y: number) =>
    (sides.top && y < depthY) || (sides.bottom && y >= h - depthY) || (sides.left && x < depthX) || (sides.right && x >= w - depthX);
  const out: Rect[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w;) {
      const dark = (xx: number) => band(xx, y) && !mask[y * w + xx] && L(xx, y) <= paper - 20;
      if (!dark(x)) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && dark(e)) e++;
      out.push({ x0: rect.x0 + x, y0: rect.y0 + y, x1: rect.x0 + e, y1: rect.y0 + y + 1 });
      x = e;
    }
  return out;
}

/**
 * A caixa de papel claro e sem cor, nem em manchas: o rendado das brancas, o papel de algumas
 * terras e a névoa de algumas douradas (mediana do brilho de 150 para cima, mediana da diferença
 * entre os canais até 34 e, nas médias de blocos de 10 px, o desvio da cor, nos eixos vermelho ×
 * verde e amarelo × azul, até 5,5). Com o texto denso, o apagamento de sempre trocava a renda por
 * um cinza liso e manchado, com tracinhos do grão copiado da renda nas linhas apagadas (Wall of
 * Swords, SUM 43; Icatian Javelineers, FEM 8c): a caixa vai à rede neural, como o nome e o tipo, e
 * o remendo fica com a cor do papel (`paperTint93`). O mosaico dos artefatos (desvio de 6 a 13,
 * com as pedras de cores diferentes), a água, a pedra, as tábuas e o pergaminho ficam no
 * apagamento de sempre, que acerta neles.
 */
export function paleBox93(img: ImageData, rect: Rect): boolean {
  const d = img.data;
  const L: number[] = [];
  const C: number[] = [];
  for (let y = Math.round(rect.y0); y < rect.y1; y += 2)
    for (let x = Math.round(rect.x0); x < rect.x1; x += 2) {
      const i = (y * img.width + x) * 4;
      L.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      C.push(Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
    }
  if (!L.length || medianOf(L) < 150 || medianOf(C) > 34) return false;
  // a cor nas médias de blocos de 10 px: a renda some, as pedras do mosaico ficam
  const A: number[] = [];
  const B: number[] = [];
  for (let by = Math.round(rect.y0); by + 10 <= rect.y1; by += 10)
    for (let bx = Math.round(rect.x0); bx + 10 <= rect.x1; bx += 10) {
      let a = 0;
      let b = 0;
      for (let y = by; y < by + 10; y++)
        for (let x = bx; x < bx + 10; x++) {
          const i = (y * img.width + x) * 4;
          a += d[i] - d[i + 1];
          b += (d[i] + d[i + 1]) / 2 - d[i + 2];
        }
      A.push(a / 100);
      B.push(b / 100);
    }
  const sd = (v: number[]) => {
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
  };
  return A.length > 0 && Math.hypot(sd(A), sd(B)) <= 5.5;
}

/**
 * O remendo da rede neural na caixa sem cor (`paleBox93`) fica com a cor do papel: cada pixel de
 * `hole` dentro de `rect` guarda o brilho e ganha a diferença mediana entre cada canal e o brilho
 * nos pixels conhecidos. O modelo às vezes inventa uma mancha esverdeada na renda, no tom da
 * renda, que a faixa da vizinhança não pega (Guardian Angel, CED 22).
 */
export function paperTint93(img: ImageData, rect: Rect, hole: Uint8Array): void {
  const d = img.data;
  const off: number[][] = [[], [], []];
  for (let y = rect.y0; y < rect.y1; y += 2)
    for (let x = rect.x0; x < rect.x1; x += 2) {
      const q = y * img.width + x;
      if (hole[q]) continue;
      const l = 0.299 * d[q * 4] + 0.587 * d[q * 4 + 1] + 0.114 * d[q * 4 + 2];
      for (let c = 0; c < 3; c++) off[c].push(d[q * 4 + c] - l);
    }
  if (!off[0].length) return;
  const m = off.map((v) => medianOf(v));
  for (let y = rect.y0; y < rect.y1; y++)
    for (let x = rect.x0; x < rect.x1; x++) {
      const q = y * img.width + x;
      if (!hole[q]) continue;
      const l = 0.299 * d[q * 4] + 0.587 * d[q * 4 + 1] + 0.114 * d[q * 4 + 2];
      for (let c = 0; c < 3; c++) d[q * 4 + c] = l + m[c];
    }
}

/**
 * O papel dentro do retângulo medido da caixa (`oldBox93`), sem o bisel que fica dentro dele: anda
 * de cada lado para dentro, até 16 px, enquanto a mediana da linha (ou da coluna, no miolo dela)
 * foge da do papel por mais de 25 tons de brilho ou 40 num canal. Nas terras de Alliances o
 * retângulo começa no bisel roxo, e a rede neural puxava o roxo para dentro da caixa, em pingos
 * (Lat-Nam's Legacy, ALL 141; o filete branco entre o bisel e o papel também fica de fora).
 */
export function paperRect93(img: ImageData, rect: Rect, unit = img.width / BASE_W): Rect {
  const d = img.data;
  const at = (x: number, y: number) => (y * img.width + x) * 4;
  const px: number[][] = [[], [], [], []];
  for (let y = rect.y0; y < rect.y1; y += 2)
    for (let x = rect.x0; x < rect.x1; x += 2) {
      const i = at(x, y);
      px[0].push(d[i]);
      px[1].push(d[i + 1]);
      px[2].push(d[i + 2]);
      px[3].push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
  const paper = px.map((v) => medianOf(v));
  const off = (pixels: number[]) => {
    const v: number[][] = [[], [], [], []];
    for (const i of pixels) {
      v[0].push(d[i]);
      v[1].push(d[i + 1]);
      v[2].push(d[i + 2]);
      v[3].push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    const m = v.map((c) => medianOf(c));
    return Math.abs(m[3] - paper[3]) > 25 || [0, 1, 2].some((c) => Math.abs(m[c] - paper[c]) > 40);
  };
  const max = Math.round(16 * unit);
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const row = (y: number) => {
    const p: number[] = [];
    for (let x = rect.x0 + Math.round(w * 0.1); x < rect.x1 - Math.round(w * 0.1); x++) p.push(at(x, y));
    return off(p);
  };
  const col = (x: number) => {
    const p: number[] = [];
    for (let y = rect.y0 + Math.round(h * 0.1); y < rect.y1 - Math.round(h * 0.1); y++) p.push(at(x, y));
    return off(p);
  };
  let { x0, y0, x1, y1 } = rect;
  while (y0 < rect.y0 + max && row(y0)) y0++;
  while (y1 > rect.y1 - max && row(y1 - 1)) y1--;
  while (x0 < rect.x0 + max && col(x0)) x0++;
  while (x1 > rect.x1 - max && col(x1 - 1)) x1--;
  return { x0, y0, x1, y1 };
}

/** Os lados da caixa queimados (ver `dropEdgeStains`). */
export interface Sides {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Os lados da caixa com a beira escura: a mediana das 3 linhas (ou colunas) de fora mais de 10
 * tons abaixo da do papel. A beira queimada do pergaminho das pretas fica de 13 a 127 tons abaixo;
 * o papel liso, o de água e as tábuas, perto do papel ou mais claros.
 */
export function burntSides(img: ImageData, rect: Rect): Sides {
  const d = img.data;
  const L = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  const all: number[] = [];
  for (let y = rect.y0; y < rect.y1; y += 2) for (let x = rect.x0; x < rect.x1; x += 2) all.push(L(x, y));
  const paper = medianOf(all);
  const rim = (x0: number, y0: number, x1: number, y1: number) => {
    const v: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(L(x, y));
    return v.length > 0 && paper - medianOf(v) > 10;
  };
  return {
    top: rim(rect.x0, rect.y0, rect.x1, rect.y0 + 3),
    bottom: rim(rect.x0, rect.y1 - 3, rect.x1, rect.y1),
    left: rim(rect.x0, rect.y0, rect.x0 + 3, rect.y1),
    right: rim(rect.x1 - 3, rect.y0, rect.x1, rect.y1),
  };
}

/**
 * As letras dentro da faixa da beira queimada (na grade de `rect`, ver `dropEdgeStains`): pixel
 * escuro (60 tons ou mais abaixo do papel) com um pixel 40 tons mais claro entre ele e a beira, em
 * cada lado queimado em cuja faixa ele está. A mancha da beira escurece em direção a ela; a letra
 * tem papel entre ela e a beira.
 */
export function edgeInk(img: ImageData, rect: Rect, depthY: number, depthX: number, sides: Sides): Uint8Array {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const d = img.data;
  const L = new Float32Array(w * h);
  const all: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((y + rect.y0) * img.width + x + rect.x0) * 4;
      L[y * w + x] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (!(x & 1) && !(y & 1)) all.push(L[y * w + x]);
    }
  const paper = medianOf(all);
  // em cada lado, o mais claro entre o pixel e a beira (`lit`), e quantos lados conferiram (`seen`)
  const seen = new Uint8Array(w * h);
  const ok = new Uint8Array(w * h);
  const side = (n: number, depth: number, at: (i: number, t: number) => number) => {
    for (let i = 0; i < n; i++) {
      let lit = -1;
      for (let t = 0; t < depth; t++) {
        const k = at(i, t);
        if (k < 0) break;
        seen[k]++;
        if (lit - L[k] >= 40 && L[k] <= paper - 60) ok[k]++;
        lit = Math.max(lit, L[k]);
      }
    }
  };
  if (sides.top) side(w, Math.min(depthY, h), (x, t) => t * w + x);
  if (sides.bottom) side(w, Math.min(depthY, h), (x, t) => (h - 1 - t) * w + x);
  if (sides.left) side(h, Math.min(depthX, w), (y, t) => y * w + t);
  if (sides.right) side(h, Math.min(depthX, w), (y, t) => y * w + w - 1 - t);
  const ink = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) if (seen[k] && ok[k] === seen[k]) ink[k] = 1;
  return ink;
}

/**
 * Tira da máscara da caixa o que entra pela beira do papel (na grade `w` × `h`): a beira queimada
 * do pergaminho das pretas, que desce em ondas e escurece em degradê até 14 px para dentro, e as
 * tábuas das verdes. A caixa é medida até o papel mais alto (ver `oldBox93`), e o apagamento
 * pintava a beira da cor do papel: o pergaminho saía reto e liso (Simulacrum, 2ED 129;
 * Pestilence, 3ED 122). Sai o que se liga à beira por pixels da máscara a até `depthY` dela (em
 * cima e embaixo) ou `depthX` (dos lados), menos o que fica a até `near` de uma letra (a máscara
 * fora dessa faixa) e o pedaço curto encostado nela: a primeira letra de uma linha colada na
 * beira continua apagada inteira. Só nos lados queimados (`sides`, ver `burntSides`): no papel
 * de água das azuis, a última linha rente ao pé da caixa saía da máscara inteira e ficava embaixo
 * do português (Merseine, FEM 23b). E as letras dentro da faixa (`ink`, ver `edgeInk`) contam
 * como letras: a primeira linha começa 4 px abaixo do alto queimado do pergaminho, e o alto dela
 * saía junto com a beira e ficava embaixo do português (Syphon Soul, LEG 118).
 */
export function dropEdgeStains(
  mask: Uint8Array,
  w: number,
  h: number,
  depthY: number,
  depthX: number,
  near: number,
  sides: Sides = { top: true, bottom: true, left: true, right: true },
  ink?: Uint8Array,
): void {
  const band = (x: number, y: number) =>
    (sides.top && y < depthY) || (sides.bottom && y >= h - depthY) || (sides.left && x < depthX) || (sides.right && x >= w - depthX);
  const edge = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (mask[k] && ((sides.left && x === 0) || (sides.top && y === 0) || (sides.right && x === w - 1) || (sides.bottom && y === h - 1))) {
        edge[k] = 1;
        queue.push(k);
      }
    }
  for (let j = 0; j < queue.length; j++) {
    const q = queue[j];
    const x = q % w;
    const y = (q - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const r = yy * w + xx;
        if (mask[r] && !edge[r] && band(xx, yy)) {
          edge[r] = 1;
          queue.push(r);
        }
      }
  }
  if (!queue.length) return;
  // a até `near` das letras (a máscara fora da faixa), fica: o resto da beira sai da máscara
  const keep = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x] || (band(x, y) && !ink?.[y * w + x])) continue;
      for (let yy = Math.max(0, y - near); yy <= Math.min(h - 1, y + near); yy++)
        keep.fill(1, yy * w + Math.max(0, x - near), yy * w + Math.min(w, x + near + 1));
    }
  // e o pedaço curto da beira (até 5 × `depthX` ao longo dela) encostado numa letra é a ponta
  // dela: o gancho do "f" de "of", rente ao fim da caixa, ficava (Hill Giant, 2ED 158)
  const piece = new Uint8Array(w * h);
  const long = 5 * depthX;
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!edge[s0] || piece[s0]) continue;
    const pix = [s0];
    piece[s0] = 1;
    let touches = false;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    for (let j = 0; j < pix.length; j++) {
      const q = pix[j];
      const x = q % w;
      const y = (q - x) / w;
      if (keep[q]) touches = true;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const r = yy * w + xx;
          if (edge[r] && !piece[r]) {
            piece[r] = 1;
            pix.push(r);
          }
        }
    }
    if (touches && Math.max(x1 - x0, y1 - y0) < long) for (const q of pix) keep[q] = 1;
  }
  for (let k = 0; k < w * h; k++) if (edge[k] && !keep[k]) mask[k] = 0;
}

/**
 * Uma cópia da imagem com `rect` alisado por uma gaussiana de `sigma` px (o resto fica igual).
 * Mede as letras da caixa na retícula (`boxLetters93`) e é o que a rede neural vê nas linhas do
 * nome e do tipo (`soften` em `lamaBox`): vista pixel a pixel, a retícula puxava o remendo para o
 * escuro dos pontos (Dingus Egg, 2ED 242).
 */
export function softened(img: ImageData, rect: Rect, sigma: number): ImageData {
  const rad = Math.max(1, Math.ceil(sigma * 2.5));
  const ker: number[] = [];
  for (let i = -rad; i <= rad; i++) ker.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const ks = ker.reduce((a, b) => a + b, 0);
  const W = img.width;
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const x0 = Math.max(0, Math.round(rect.x0));
  const x1 = Math.min(W, Math.round(rect.x1));
  const y0 = Math.max(0, Math.round(rect.y0));
  const y1 = Math.min(img.height, Math.round(rect.y1));
  const w = x1 - x0;
  const ya = Math.max(0, y0 - rad);
  const yb = Math.min(img.height, y1 + rad);
  const across = new Float32Array(w * (yb - ya) * 3);
  for (let y = ya; y < yb; y++)
    for (let x = x0; x < x1; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += d[(y * W + Math.min(W - 1, Math.max(0, x + i))) * 4 + c] * ker[i + rad];
        across[((y - ya) * w + x - x0) * 3 + c] = acc / ks;
      }
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += across[((Math.min(yb - 1, Math.max(ya, y + i)) - ya) * w + x - x0) * 3 + c] * ker[i + rad];
        out[(y * W + x) * 4 + c] = acc / ks;
      }
  return { width: W, height: img.height, data: out, colorSpace: img.colorSpace } as ImageData;
}

/**
 * Separa o símbolo da coleção das letras do tipo: os últimos trechos são o símbolo quando todos
 * começam depois de `OLD93.symbolMin`, com vãos de menos de 14 px entre eles, e um vão de 14 px ou
 * mais os separa do texto. Devolve o fim do texto em inglês e o começo do símbolo (`null` sem
 * símbolo), em pixels. O começo vai até onde a máscara começa: os trechos contam só as colunas com
 * dois pixels de letra, e a ponta fina do rabo da bandeira de Alliances ficava de fora; o tipo
 * comprido em português ia até ela (Aesthir Glider, ALL 116a). E o símbolo pode vir em dois
 * trechos: a cimitarra de Arabian Nights tem o cabo solto da lâmina por 13 px, só a lâmina passava
 * por símbolo e, com as letras claras do "Land" fora da medida, a cimitarra inteira era apagada
 * (Mountain, ARN 77).
 */
export function typeEnds93(letters: InkLetters, unit: number): { textEnd: number; symbol: number | null } {
  const blocks = letters.blocks;
  const last = blocks[blocks.length - 1];
  // os trechos do fim, todos depois de `symbolMin` e perto uns dos outros
  let i = blocks.length - 1;
  while (i > 0 && blocks[i - 1].x0 >= OLD93.symbolMin * unit && blocks[i].x0 - blocks[i - 1].x1 < 14 * unit) i--;
  const first = blocks[i];
  const before = blocks[i - 1];
  const start = Math.round(OLD93.type.x * unit);
  // (com as letras do tipo apagadas demais para a medida, o símbolo é o único trecho)
  if (last && first.x0 >= OLD93.symbolMin * unit && (!before || first.x0 - before.x1 >= 14 * unit)) {
    const { rect, mask } = letters;
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const used = (x: number) => {
      for (let y = 0; y < h; y++) if (mask[y * w + x - rect.x0]) return true;
      return false;
    };
    const stop = Math.max(rect.x0, (before ? before.x1 : start) + Math.round(6 * unit));
    let symbol = first.x0;
    while (symbol - 1 >= stop && used(symbol - 1)) symbol--;
    return { textEnd: before ? before.x1 : start, symbol };
  }
  return { textEnd: last ? last.x1 : start, symbol: null };
}

/**
 * Põe um retângulo (em pixels da imagem) na máscara das letras: onde a medida não achou as letras
 * inteiras (as finas e gravadas de Alpha a Unlimited, na retícula), a rede neural apaga a faixa
 * toda em que elas estão.
 */
export function addHull(letters: InkLetters, r: Rect): void {
  const { rect, mask } = letters;
  const w = rect.x1 - rect.x0;
  const x0 = Math.max(0, Math.round(r.x0) - rect.x0);
  const x1 = Math.min(w, Math.round(r.x1) - rect.x0);
  const y0 = Math.max(0, Math.round(r.y0) - rect.y0);
  const y1 = Math.min(rect.y1 - rect.y0, Math.round(r.y1) - rect.y0);
  if (x1 <= x0) return;
  for (let y = y0; y < y1; y++) mask.fill(1, y * w + x0, y * w + x1);
}

/**
 * Onde a moldura em volta de uma linha de letras acaba (escala da imagem): andando de `from` para
 * cima (`dir` −1) ou para baixo (1), a primeira linha cuja mediana (de x 96 a 400) foge da mediana
 * das seis já andadas por mais de 15 tons e de 30% dela: o fio escuro, o bisel claro ou a borda
 * acima da moldura, a beira da arte abaixo do nome e acima do tipo, o bisel da caixa abaixo do
 * tipo. Devolve a primeira linha da moldura (para cima) ou a primeira fora dela (para baixo); sem
 * achar, `rect.y0` ou `rect.y1`. A moldura começa de y ≈ 35 a 52, conforme a coleção e a
 * digitalização, e a arte de 86 a 100: o retângulo inteiro das letras gravadas que passava dali
 * levava o fio ou a arte, e a rede neural trazia a borda branca, o fio preto ou o vermelho da arte
 * para dentro do nome (Pestilence, 3ED 122; Serra Angel, 3ED 40; Circle of Protection: Red, 4ED 17).
 * Com `color` (embaixo do tipo), vale também a linha cuja cor (a mediana do canal mais alto menos o
 * mais baixo) foge da das seis por mais de 60, com o brilho 15 tons ou mais fora, dentro de `rect`:
 * o aro vermelho da caixa da Mountain de Arabian Nights tem o brilho da pedra clara em volta, e a
 * rede neural o espalhava pela linha do tipo (ARN 77).
 */
export function frameEdge93(img: ImageData, rect: Rect, from: number, dir: -1 | 1, unit = img.width / BASE_W, color = false): number {
  const xa = Math.max(rect.x0, Math.round(96 * unit));
  const xb = Math.min(rect.x1, Math.round(400 * unit));
  const d = img.data;
  const meds = new Map<number, [number, number]>();
  /** a mediana do brilho e a da cor (o canal mais alto menos o mais baixo) da linha */
  const med = (y: number) => {
    let v = meds.get(y);
    if (v === undefined) {
      const lum: number[] = [];
      const sat: number[] = [];
      for (let x = xa; x < xb; x++) {
        const p = (y * img.width + x) * 4;
        lum.push(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
        sat.push(Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]));
      }
      v = [medianOf(lum), medianOf(sat)];
      meds.set(y, v);
    }
    return v;
  };
  const seen = Math.max(2, Math.round(6 * unit));
  const end = dir < 0 ? Math.max(1, rect.y0 - Math.round(4 * unit)) : Math.min(img.height - 1, rect.y1 + Math.round(8 * unit));
  for (let y = Math.round(from); dir < 0 ? y >= end : y <= end; y += dir) {
    const back = Array.from({ length: seen }, (_, i) => med(y - dir * (1 + i)));
    const ref = medianOf(back.map((v) => v[0]));
    const refSat = medianOf(back.map((v) => v[1]));
    const [lum, sat] = med(y);
    if (
      Math.abs(lum - ref) > Math.max(15, ref * 0.3) ||
      (color && (dir > 0 ? y < rect.y1 : y >= rect.y0) && Math.abs(sat - refSat) > 60 && Math.abs(lum - ref) > 15)
    )
      return dir < 0 ? y + 1 : y;
  }
  return dir < 0 ? rect.y0 : rect.y1;
}

/**
 * O pé das letras sobre o fio de baixo da moldura da linha (escala da imagem; `bottom` é a
 * primeira linha do fio, ver `frameEdge93`): o pé do "g" desce até o fio e o traço dele, no fio,
 * ficava fora do buraco (o fio não é apagado) e sobrava como um risco branco (Aladdin's Ring, SUM
 * 232) ou um calombo no fio, que a rede neural ainda espalhava para cima (Serra Angel, 3ED 40).
 * Nas 4 linhas do fio, o que foge da mediana da linha (média 3 × 3) por mais de 28 tons e de 3
 * vezes o desvio dela, embaixo de uma letra que também foge da linha dela logo acima do fio (a
 * até 2 px) ou de um pixel já marcado, com 1 px de folga; o trecho que vai até a ponta da linha,
 * não (é a moldura depois do fim do fio). A máscara, na grade de `rect`, vai para `fillAcross` (os
 * pixels da mesma linha, espelhados: o fio continua inteiro), antes da rede neural.
 */
export function lineFeet93(
  img: ImageData,
  letters: { rect: Rect; mask: Uint8Array },
  bottom: number,
  unit = img.width / BASE_W,
): { rect: Rect; mask: Uint8Array } {
  const lr = letters.rect;
  const lw = lr.x1 - lr.x0;
  const rect = { x0: lr.x0, y0: bottom, x1: lr.x1, y1: Math.min(img.height, bottom + Math.max(2, Math.round(4 * unit))) };
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const mask = new Uint8Array(Math.max(0, w * h));
  if (h <= 0 || w <= 0 || bottom < 1) return { rect, mask };
  const d = img.data;
  const lum = (x: number, y: number) => {
    const p = (y * img.width + x) * 4;
    return 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  };
  // em cada linha, de 1 acima do fio ao fim dele: o que foge da mediana da linha (média 3 × 3)
  const off = (iy: number, y0: number, y1: number) => {
    const mean = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let n = 0;
      for (let yy = Math.max(y0, iy - 1); yy <= Math.min(y1 - 1, iy + 1); yy++)
        for (let xx = Math.max(0, rect.x0 + x - 1); xx <= Math.min(img.width - 1, rect.x0 + x + 1); xx++) {
          acc += lum(xx, yy);
          n++;
        }
      mean[x] = acc / n;
    }
    const med = medianOf(Array.from(mean));
    const mad = medianOf(Array.from(mean, (v) => Math.abs(v - med)));
    const thr = Math.max(28, 3 * mad);
    return Uint8Array.from(mean, (v) => (Math.abs(v - med) > thr ? 1 : 0));
  };
  // a letra logo acima do fio: na máscara das letras e fugindo da linha dela (a quina clara do
  // bisel da arte, na ponta esquerda do fio, não tem letra em cima)
  const above = off(bottom - 1, bottom - 2, bottom);
  const ly = bottom - 1 - lr.y0;
  const seed = new Uint8Array(w);
  const reach = Math.max(1, Math.round(2 * unit));
  if (ly >= 0 && ly < lr.y1 - lr.y0)
    for (let x = 0; x < w; x++)
      if (above[x] && letters.mask[ly * lw + x]) for (let xx = Math.max(0, x - reach); xx <= Math.min(w - 1, x + reach); xx++) seed[xx] = 1;
  if (!seed.some(Boolean)) return { rect, mask };
  const hit = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = off(rect.y0 + y, rect.y0, rect.y1);
    for (let x = 0; x < w; x++) {
      if (!row[x]) continue;
      const up =
        y === 0 ? seed[x] : hit[(y - 1) * w + Math.max(0, x - 1)] || hit[(y - 1) * w + x] || hit[(y - 1) * w + Math.min(w - 1, x + 1)];
      if (up) hit[y * w + x] = 1;
    }
    // (o pé que se estende na linha, colado no que já foi marcado nela)
    for (let x = 1; x < w; x++) if (!hit[y * w + x] && hit[y * w + x - 1] && row[x]) hit[y * w + x] = 1;
    for (let x = w - 2; x >= 0; x--) if (!hit[y * w + x] && hit[y * w + x + 1] && row[x]) hit[y * w + x] = 1;
    // o trecho que vai até a ponta da linha não é pé: o fio acabou antes dele (a moldura depois da
    // quina do bisel da caixa, embaixo do "L" de "Land", saía pintada com o fio, Maze of Ith, DRK 117)
    if (row[0]) for (let x = 0; x < w && row[x]; x++) hit[y * w + x] = 0;
    if (row[w - 1]) for (let x = w - 1; x >= 0 && row[x]; x--) hit[y * w + x] = 0;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!hit[y * w + x]) continue;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) mask[yy * w + xx] = 1;
    }
  return { rect, mask };
}

/**
 * As letras de Alpha a Unlimited e das Collectors' Editions são gravadas: na moldura clara (o
 * artefato marrom do Dingus Egg, 2ED 242) o miolo cinza passava por letra clara, e o português
 * saía branco com sombra. Na moldura escura (abaixo de 100 de brilho), o miolo é bem mais claro
 * que ela e a carta parece de letra clara: aí fica o estilo medido. Troca o estilo (e as cores:
 * na gravada, `fill` é o contorno).
 */
export const ENGRAVED_SETS93 = new Set(["lea", "leb", "2ed", "ced", "cei"]);

export function asEngraved(l: InkLetters): void {
  if (l.style === "dark" || l.ground < 100) return;
  const { fill, edge } = l;
  l.style = "dark";
  l.fill = edge;
  l.edge = fill;
}

/**
 * Tira do remendo da rede neural as manchas que a média da vizinhança não tem: uma mancha escura
 * subindo do fio de baixo da moldura, onde o pé de uma letra encostava nele (Serra Angel, 3ED 40). Na retícula a faixa pixel a pixel da
 * vizinhança (`tameInvented`) vai do preto ao branco e não segura nada; aqui vale a média de
 * 7 × 7 px: a do buraco, fora da faixa das médias dos pixels conhecidos (a mais de 3 px do
 * buraco, numa janela de 49 px; sem nenhum na janela, nas mesmas linhas) por mais de `tol` tons
 * num canal, é trazida para a beira da faixa, com o grão de cada pixel. Muda a imagem no lugar.
 */
export function tameLow(img: ImageData, rect: Rect, hole: Uint8Array, hide: Rect[] = [], tol = 10): void {
  const W = img.width;
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  if (w <= 0 || h <= 0) return;
  const unit = W / BASE_W;
  const r = Math.max(1, Math.round(3 * unit));
  const win = Math.max(4, Math.round(24 * unit));
  const n = w * h;
  const inHole = new Uint8Array(n);
  const hidden = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) inHole[y * w + x] = hole[(rect.y0 + y) * W + rect.x0 + x];
  for (const g of hide)
    for (let y = Math.max(Math.round(g.y0), rect.y0); y < Math.min(Math.round(g.y1), rect.y1); y++)
      for (let x = Math.max(Math.round(g.x0), rect.x0); x < Math.min(Math.round(g.x1), rect.x1); x++)
        hidden[(y - rect.y0) * w + x - rect.x0] = 1;
  if (!inHole.some(Boolean)) return;
  // média de uma janela quadrada (raio `rad`), em duas passadas de uma dimensão, por somas
  const boxMean = (v: Float32Array, rad: number) => {
    const tmp = new Float32Array(n);
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      let cnt = 0;
      for (let x = 0; x < Math.min(w, rad); x++) {
        acc += v[y * w + x];
        cnt++;
      }
      for (let x = 0; x < w; x++) {
        if (x + rad < w) {
          acc += v[y * w + x + rad];
          cnt++;
        }
        if (x - rad - 1 >= 0) {
          acc -= v[y * w + x - rad - 1];
          cnt--;
        }
        tmp[y * w + x] = acc / cnt;
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let cnt = 0;
      for (let y = 0; y < Math.min(h, rad); y++) {
        acc += tmp[y * w + x];
        cnt++;
      }
      for (let y = 0; y < h; y++) {
        if (y + rad < h) {
          acc += tmp[(y + rad) * w + x];
          cnt++;
        }
        if (y - rad - 1 >= 0) {
          acc -= tmp[(y - rad - 1) * w + x];
          cnt--;
        }
        out[y * w + x] = acc / cnt;
      }
    }
    return out;
  };
  // referência: os conhecidos a mais de 3 px do buraco (a média deles não tem remendo)
  const holeF = new Float32Array(n);
  for (let k = 0; k < n; k++) holeF[k] = inHole[k] || hidden[k] ? 1 : 0;
  const near = boxMean(holeF, r);
  const ref = new Uint8Array(n);
  for (let k = 0; k < n; k++) ref[k] = near[k] === 0 ? 1 : 0;
  // máximo de uma janela quadrada, só entre os pixels de referência (−∞ nos outros)
  const slideMax = (v: Float32Array) => {
    const tmp = new Float32Array(n).fill(-Infinity);
    const out = new Float32Array(n).fill(-Infinity);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let m = -Infinity;
        for (let xx = Math.max(0, x - win); xx <= Math.min(w - 1, x + win); xx++) if (v[y * w + xx] > m) m = v[y * w + xx];
        tmp[y * w + x] = m;
      }
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        let m = -Infinity;
        for (let yy = Math.max(0, y - win); yy <= Math.min(h - 1, y + win); yy++) if (tmp[yy * w + x] > m) m = tmp[yy * w + x];
        out[y * w + x] = m;
      }
    return out;
  };
  // Longe de qualquer referência na janela (o buraco da altura inteira da moldura, com o
  // retângulo das gravadas), vale a faixa das médias de referência nas mesmas linhas (até `r`
  // acima e abaixo), em qualquer coluna: o pé do "g" colado no fio de baixo virava uma mancha
  // escura subindo do fio (Serra Angel, 3ED 40)
  const rowRef = new Uint16Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ref[y * w + x]) rowRef[y]++;
  const d = img.data;
  for (let c = 0; c < 3; c++) {
    const v = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = d[((rect.y0 + y) * W + rect.x0 + x) * 4 + c];
    const mean = boxMean(v, r);
    const hi = new Float32Array(n);
    const lo = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      hi[k] = ref[k] ? mean[k] : -Infinity;
      lo[k] = ref[k] ? -mean[k] : -Infinity;
    }
    const top = slideMax(hi);
    const bottom = slideMax(lo);
    const rowHi = new Float32Array(h).fill(-Infinity);
    const rowLo = new Float32Array(h).fill(Infinity);
    for (let y = 0; y < h; y++) {
      let cnt = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) cnt += rowRef[yy];
      if (cnt < 4 * r * r) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++)
        for (let x = 0; x < w; x++) {
          const k = yy * w + x;
          if (!ref[k]) continue;
          rowHi[y] = Math.max(rowHi[y], mean[k]);
          rowLo[y] = Math.min(rowLo[y], mean[k]);
        }
    }
    for (let k = 0; k < n; k++) {
      if (!inHole[k]) continue;
      const y = Math.floor(k / w);
      const up = top[k] !== -Infinity ? top[k] : rowHi[y];
      const down = top[k] !== -Infinity ? -bottom[k] : rowLo[y];
      if (up === -Infinity) continue;
      const m = mean[k];
      const shift = m > up + tol ? up - m : m < down - tol ? down - m : 0;
      if (!shift) continue;
      const p = ((rect.y0 + y) * W + rect.x0 + (k % w)) * 4 + c;
      d[p] = Math.max(0, Math.min(255, d[p] + shift));
    }
  }
}

/**
 * O retângulo das letras marcadas numa máscara (escala da imagem), com `pad` de folga e dentro do
 * retângulo da máscara; `null` sem nada marcado. É o quadro da rede neural de cada linha: o nome e
 * o tipo ficam a 500 px um do outro, e num quadro só, reduzido aos 512 px do modelo, o remendo
 * saía liso na retícula e na pedra granulada (Urza's Tower, ATQ 85d).
 */
export function maskBounds(rect: Rect, mask: Uint8Array, pad: number): Rect | null {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  return {
    x0: Math.max(rect.x0, rect.x0 + x0 - pad),
    y0: Math.max(rect.y0, rect.y0 + y0 - pad),
    x1: Math.min(rect.x1, rect.x0 + x1 + 1 + pad),
    y1: Math.min(rect.y1, rect.y0 + y1 + 1 + pad),
  };
}

/** Uma camada das letras: deslocamento, cor e, no contorno, a largura do traço. */
export type OldLayer = readonly [number, string] | readonly [number, string, number];

/**
 * As camadas de uma linha da moldura de 1993 no estilo medido nas letras em inglês (ver
 * `inkLetters`): a letra clara com a sombra escura 2 px abaixo e à direita, ou a gravada: o miolo
 * cinza, um pouco mais claro que a moldura (de 110 a 205 de brilho, levemente azulado, como nas
 * cartas), com o contorno escuro medido e o brilho claro 1,2 px abaixo e à direita. A letra clara
 * nunca fica abaixo de 150 de brilho, nem o contorno da gravada acima de 70 (a medida pega a borda
 * suavizada), senão o português perde o contraste.
 */
export function old93Layers(letters: Pick<InkLetters, "style" | "fill" | "edge" | "ground">): OldLayer[] {
  const lumOf = (c: readonly number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const scaled = (c: readonly number[], target: number) => {
    const l = Math.max(1, lumOf(c));
    return c.map((v) => Math.round(Math.max(0, Math.min(255, (v * target) / l))));
  };
  const rgb = (c: readonly number[], a = 1) => (a < 1 ? `rgba(${c.join(", ")}, ${a})` : `rgb(${c.join(", ")})`);
  if (letters.style === "light") {
    const fill = lumOf(letters.fill) < 150 ? scaled(letters.fill, 150) : letters.fill.map(Math.round);
    const edge = lumOf(letters.edge) > 60 ? scaled(letters.edge, 60) : letters.edge.map(Math.round);
    return [
      [2, rgb(edge, 0.75)],
      [0, rgb(fill)],
    ];
  }
  const outline = lumOf(letters.fill) > 70 ? scaled(letters.fill, 70) : letters.fill.map(Math.round);
  const core = Math.round(Math.max(110, Math.min(205, letters.ground + 25)));
  return [
    [1.2, rgb(letters.edge.map(Math.round), 0.8)],
    [0, rgb(outline), 2],
    [0, rgb([core - 5, core, core + 6])],
  ];
}
