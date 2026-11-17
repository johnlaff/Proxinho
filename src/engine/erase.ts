/**
 * Apaga o texto em inglês de regiões da carta sem destruir a textura da moldura.
 *
 * 1. Máscara: um pixel é "texto" quando é bem mais escuro que o fundo local
 *    (média borrada da vizinhança, recalculada sem os próprios pixels de texto).
 * 2. Preenchimento: "push-pull" em pirâmide. Os pixels conhecidos são reduzidos
 *    à metade até cobrir os buracos, e a imagem é reconstruída de volta,
 *    preenchendo só o que estava mascarado. É rápido (linear no número de
 *    pixels) e dá transições suaves no papel/pergaminho da caixa de texto.
 *
 * Funciona sobre `ImageData`, então roda igual no navegador e nos testes.
 */
import type { Rect } from "./geometry";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function luminance(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Média em janela quadrada (raio r) usando imagem integral, com pesos. */
function boxMean(values: Float32Array, weights: Float32Array, w: number, h: number, r: number): Float32Array {
  const iw = w + 1;
  const sv = new Float64Array(iw * (h + 1));
  const sw = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rv = 0;
    let rw = 0;
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      rv += values[k] * weights[k];
      rw += weights[k];
      sv[(y + 1) * iw + x + 1] = sv[y * iw + x + 1] + rv;
      sw[(y + 1) * iw + x + 1] = sw[y * iw + x + 1] + rw;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const v = sv[yb * iw + xb] - sv[ya * iw + xb] - sv[yb * iw + xa] + sv[ya * iw + xa];
      const s = sw[yb * iw + xb] - sw[ya * iw + xb] - sw[yb * iw + xa] + sw[ya * iw + xa];
      out[y * w + x] = s > 0 ? v / s : 255;
    }
  }
  return out;
}

/**
 * Calcula a máscara de texto de uma região (1 = texto a apagar).
 *
 * Dois critérios: o pixel é bem mais escuro que o fundo (letras) ou tem cor bem
 * diferente do fundo (miolo dos símbolos de mana, que é cinza-claro ou colorido).
 * Depois a máscara é dilatada e "fechada" para levar junto a borda suavizada das
 * letras e os buracos dentro dos símbolos.
 */
/**
 * Descobre se o texto de uma região é escuro sobre fundo claro (o normal) ou
 * claro sobre fundo escuro (verso das cartas de transformar, faixa das modais).
 * Compara quantos pixels fogem muito da mediana para cada lado.
 */
export function textPolarity(img: ImageData, rect: Rect): "dark" | "light" {
  const hist = new Uint32Array(256);
  let n = 0;
  // só o miolo da faixa: as bordas de cima e de baixo da barra são escuras
  const inset = Math.floor((rect.y1 - rect.y0) * 0.2);
  for (let y = rect.y0 + inset; y < rect.y1 - inset; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      hist[Math.round(luminance(img.data, (y * img.width + x) * 4))]++;
      n++;
    }
  }
  let acc = 0;
  let median = 0;
  for (; median < 255; median++) {
    acc += hist[median];
    if (acc >= n / 2) break;
  }
  let dark = 0;
  let light = 0;
  for (let v = 0; v < 256; v++) {
    if (v < median - 45) dark += hist[v];
    else if (v > median + 45) light += hist[v];
  }
  return light > dark * 1.5 && light > n * 0.01 ? "light" : "dark";
}

export function textMask(
  img: ImageData,
  rect: Rect,
  threshold: number,
  protect: Rect[] = [],
  colorThreshold = 0,
  polarity: "dark" | "light" = "dark",
): Uint8Array {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const n = w * h;
  const lum = new Float32Array(n);
  const rgb = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const ones = new Float32Array(n).fill(1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
      const k = y * w + x;
      // texto claro: inverte a luminância e a mesma regra ("bem mais escuro que o fundo") vale
      lum[k] = polarity === "light" ? 255 - luminance(img.data, i) : luminance(img.data, i);
      rgb[0][k] = img.data[i];
      rgb[1][k] = img.data[i + 1];
      rgb[2][k] = img.data[i + 2];
    }
  }
  const radius = Math.max(8, Math.round(img.width / 36));
  // Primeira estimativa do fundo, depois refinada ignorando o que parece texto.
  let bg = boxMean(lum, ones, w, h, radius);
  const keep = new Float32Array(n);
  for (let k = 0; k < n; k++) keep[k] = lum[k] < bg[k] - threshold * 0.6 ? 0 : 1;
  bg = boxMean(lum, keep, w, h, radius);

  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (lum[k] < bg[k] - threshold) mask[k] = 1;

  if (colorThreshold > 0) {
    for (let k = 0; k < n; k++) if (mask[k]) keep[k] = 0;
    const bgc = rgb.map((ch) => boxMean(ch, keep, w, h, radius));
    const t2 = colorThreshold * colorThreshold;
    for (let k = 0; k < n; k++) {
      const dr = rgb[0][k] - bgc[0][k];
      const dg = rgb[1][k] - bgc[1][k];
      const db = rgb[2][k] - bgc[2][k];
      if (dr * dr + dg * dg + db * db > t2) mask[k] = 1;
    }
  }

  const unit = img.width / 745;
  let out = morph(mask, w, h, Math.max(1, Math.round(unit * 2)), true);
  if (colorThreshold > 0) {
    // fechamento: dilata e erode para tapar o miolo dos símbolos
    const r = Math.max(2, Math.round(unit * 4));
    out = morph(morph(out, w, h, r, true), w, h, r, false);
  }
  for (const p of protect) {
    const px0 = Math.round(p.x0);
    const py0 = Math.round(p.y0);
    const px1 = Math.round(p.x1);
    const py1 = Math.round(p.y1);
    for (let y = Math.max(py0, rect.y0); y < Math.min(py1, rect.y1); y++) {
      for (let x = Math.max(px0, rect.x0); x < Math.min(px1, rect.x1); x++) {
        out[(y - rect.y0) * w + (x - rect.x0)] = 0;
      }
    }
  }
  return out;
}

/** Dilatação (grow = true) ou erosão separável com raio r. */
function morph(src: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const hit = grow ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r && v !== hit; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w) continue;
        if (src[y * w + xx] === hit) v = hit;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r && v !== hit; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        if (tmp[yy * w + x] === hit) v = hit;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Preenche os pixels mascarados de uma região com push-pull em pirâmide. */
export function inpaint(img: ImageData, rect: Rect, mask: Uint8Array): void {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  // Nível 0: cor pré-multiplicada pelo peso (1 = conhecido, 0 = buraco).
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Level = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (mask[k]) continue;
      const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
      base.c[k * 3] = img.data[i];
      base.c[k * 3 + 1] = img.data[i + 1];
      base.c[k * 3 + 2] = img.data[i + 2];
      base.a[k] = 1;
    }
  }
  const levels: Level[] = [base];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const prev = levels[levels.length - 1];
    const nw = Math.max(1, Math.ceil(prev.w / 2));
    const nh = Math.max(1, Math.ceil(prev.h / 2));
    const next: Level = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), a: new Float32Array(nw * nh) };
    for (let y = 0; y < prev.h; y++) {
      for (let x = 0; x < prev.w; x++) {
        const k = y * prev.w + x;
        const a = prev.a[k];
        if (!a) continue;
        const n = (y >> 1) * nw + (x >> 1);
        next.a[n] += a;
        next.c[n * 3] += prev.c[k * 3];
        next.c[n * 3 + 1] += prev.c[k * 3 + 1];
        next.c[n * 3 + 2] += prev.c[k * 3 + 2];
      }
    }
    // Normaliza para peso no máximo 1 (pixel "cheio").
    for (let n = 0; n < nw * nh; n++) {
      const a = next.a[n];
      if (a > 1) {
        next.c[n * 3] /= a;
        next.c[n * 3 + 1] /= a;
        next.c[n * 3 + 2] /= a;
        next.a[n] = 1;
      } else if (a > 0) {
        // mantém pré-multiplicado com peso parcial
      }
    }
    levels.push(next);
  }
  // Pull: reconstrói do topo para a base, completando o que falta com o nível de cima.
  for (let l = levels.length - 2; l >= 0; l--) {
    const cur = levels[l];
    const up = levels[l + 1];
    for (let y = 0; y < cur.h; y++) {
      for (let x = 0; x < cur.w; x++) {
        const k = y * cur.w + x;
        const a = cur.a[k];
        if (a >= 1) continue;
        // amostra bilinear do nível de cima (centro do pixel)
        const fx = clamp((x + 0.5) / 2 - 0.5, 0, up.w - 1);
        const fy = clamp((y + 0.5) / 2 - 0.5, 0, up.h - 1);
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(x0 + 1, up.w - 1);
        const y1 = Math.min(y0 + 1, up.h - 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const wts = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
        const idx = [y0 * up.w + x0, y0 * up.w + x1, y1 * up.w + x0, y1 * up.w + x1];
        let r = 0;
        let g = 0;
        let b = 0;
        let s = 0;
        for (let q = 0; q < 4; q++) {
          const ua = up.a[idx[q]];
          if (!ua) continue;
          const wq = wts[q];
          r += (up.c[idx[q] * 3] / ua) * wq;
          g += (up.c[idx[q] * 3 + 1] / ua) * wq;
          b += (up.c[idx[q] * 3 + 2] / ua) * wq;
          s += wq;
        }
        if (s === 0) continue;
        r /= s;
        g /= s;
        b /= s;
        // mistura o que já se sabe neste nível (peso a) com o vindo de cima
        cur.c[k * 3] = cur.c[k * 3] + r * (1 - a);
        cur.c[k * 3 + 1] = cur.c[k * 3 + 1] + g * (1 - a);
        cur.c[k * 3 + 2] = cur.c[k * 3 + 2] + b * (1 - a);
        cur.a[k] = 1;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!mask[k]) continue;
      const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
      img.data[i] = base.c[k * 3];
      img.data[i + 1] = base.c[k * 3 + 1];
      img.data[i + 2] = base.c[k * 3 + 2];
    }
  }
}

/**
 * Acha onde começa o símbolo da coleção na linha de tipo (o bloco escuro mais
 * à direita depois de x = 560). Devolve x na escala da imagem.
 */
export function findSetSymbolLeft(img: ImageData, y0: number, y1: number): number {
  const x0 = Math.round(img.width * 0.75);
  const x1 = Math.round(img.width * 0.955);
  const cols: number[] = [];
  let lumSum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      lumSum += luminance(img.data, (y * img.width + x) * 4);
      count++;
    }
  }
  const mean = lumSum / count;
  for (let x = x0; x < x1; x++) {
    let dark = 0;
    for (let y = y0; y < y1; y++) {
      const l = luminance(img.data, (y * img.width + x) * 4);
      if (Math.abs(l - mean) > 45) dark++;
    }
    if (dark > 2) cols.push(x);
  }
  if (!cols.length) return Math.round(img.width * 0.85);
  // o bloco mais à direita, separado por lacunas (medidas na escala de 745 px)
  const k = img.width / 745;
  const end = cols[cols.length - 1];
  let start = end;
  for (let i = cols.length - 1; i > 0; i--) {
    if (cols[i] - cols[i - 1] > Math.max(3, 8 * k)) break;
    start = cols[i - 1];
  }
  // Um símbolo de coleção não passa de ~60 px. Se o bloco é mais largo, ele
  // grudou no fim da linha de tipo em inglês (ex.: "Survivor"): corta na maior
  // lacuna perto da direita, para o texto ser apagado e o símbolo preservado.
  if (end - start > 60 * k) {
    let best = -1;
    let cut = start;
    for (let i = cols.length - 1; i > 0 && cols[i] >= end - 75 * k; i--) {
      const gap = cols[i] - cols[i - 1];
      if (gap > 1 && gap > best) {
        best = gap;
        cut = cols[i];
      }
    }
    start = best > 0 ? cut : Math.round(end - 60 * k);
  }
  return start;
}

/** Máscara de texto de uma região, já com o retângulo arredondado à grade de pixels. */
export interface RegionMask {
  rect: Rect;
  mask: Uint8Array;
  polarity: "dark" | "light";
}

/**
 * Calcula as máscaras de texto de várias regiões, sem apagar nada. Regiões
 * vazias (fora da imagem) voltam com máscara vazia.
 */
export function maskRegions(
  img: ImageData,
  regions: { rect: Rect; threshold: number; colorThreshold?: number }[],
  protect: Rect[],
): RegionMask[] {
  return regions.map(({ rect, threshold, colorThreshold }) => {
    const r = {
      x0: clamp(Math.round(rect.x0), 0, img.width),
      y0: clamp(Math.round(rect.y0), 0, img.height),
      x1: clamp(Math.round(rect.x1), 0, img.width),
      y1: clamp(Math.round(rect.y1), 0, img.height),
    };
    if (r.x1 <= r.x0 || r.y1 <= r.y0) return { rect: r, mask: new Uint8Array(0), polarity: "dark" };
    const polarity = textPolarity(img, r);
    return { rect: r, mask: textMask(img, r, threshold, protect, colorThreshold ?? 0, polarity), polarity };
  });
}

/**
 * Apaga o texto de várias regiões de uma vez. Devolve, para cada região, se o
 * texto era escuro ou claro (para escrever o português na mesma cor).
 */
export function eraseRegions(
  img: ImageData,
  regions: { rect: Rect; threshold: number; colorThreshold?: number }[],
  protect: Rect[],
): ("dark" | "light")[] {
  // uma região de cada vez: a máscara da seguinte é medida já sem o texto da anterior
  return regions.map((region) => {
    const [m] = maskRegions(img, [region], protect);
    if (m.mask.length) inpaint(img, m.rect, m.mask);
    return m.polarity;
  });
}

/** Junta máscaras de regiões numa máscara da imagem inteira, dilatada em `grow` pixels dentro das regiões. */
export function combineMasks(img: ImageData, masks: RegionMask[], grow = 0): Uint8Array {
  const out = new Uint8Array(img.width * img.height);
  for (const { rect, mask } of masks) {
    const w = rect.x1 - rect.x0;
    for (let y = rect.y0; y < rect.y1; y++)
      for (let x = rect.x0; x < rect.x1; x++) if (mask[(y - rect.y0) * w + x - rect.x0]) out[y * img.width + x] = 1;
  }
  if (grow <= 0) return out;
  // dilata sem sair das regiões: o que está fora (ex.: os dois-pontos depois do escudo) fica intacto
  const grown = morph(out, img.width, img.height, grow, true);
  const inside = new Uint8Array(out.length);
  for (const { rect } of masks) for (let y = rect.y0; y < rect.y1; y++) inside.fill(1, y * img.width + rect.x0, y * img.width + rect.x1);
  for (let i = 0; i < grown.length; i++) grown[i] &= inside[i];
  return grown;
}

/**
 * Procura o ícone redondo à direita do nome (verso das cartas de transformar
 * desde 2023, que não têm custo de mana). O anel do ícone contrasta muito com
 * a barra do nome em toda a altura.
 */
export function hasRightIcon(img: ImageData): boolean {
  const k = img.width / 745;
  const ky = img.height / 1040;
  const x0 = Math.round(660 * k);
  const x1 = Math.round(700 * k);
  const y0 = Math.round(64 * ky);
  const y1 = Math.round(100 * ky);
  let lo = 0;
  let hi = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const l = luminance(img.data, (y * img.width + x) * 4);
      if (l < 60) lo++;
      if (l > 200) hi++;
      n++;
    }
  }
  // o ícone é um disco escuro com um triângulo claro (ou o contrário)
  return lo > n * 0.45 && hi > n * 0.15;
}
