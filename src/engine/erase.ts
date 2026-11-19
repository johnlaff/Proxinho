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

/** Mediana de valores não negativos (aproximada a 0,5). */
function median(v: Float32Array): number {
  if (!v.length) return 0;
  const hist = new Uint32Array(1024);
  for (const x of v) hist[Math.min(1023, Math.round(x * 2))]++;
  let acc = 0;
  for (let i = 0; i < 1024; i++) if ((acc += hist[i]) >= v.length / 2) return i / 2;
  return 511.5;
}

function luminance(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/**
 * Arte que invade a barra por baixo (os chifres e a sombra do Ashiok, THB) não é letra.
 * Abaixo das linhas das letras (onde a máscara cai para menos da metade do pico), só
 * sobram os pés delas (g, p, vírgula), finos e soltos; um trecho em que a máscara cobre
 * mais da metade de uma janela de 60 px é arte ou sombra da moldura: sai da máscara e
 * fica como está. Antes ele era "apagado" com a cor da barra e sobrava uma faixa clara
 * embaixo do nome.
 */
function dropArtBelowText(mask: Uint8Array, w: number, h: number, unit: number): void {
  const count = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) count[y] += mask[y * w + x];
  // A linha das letras é procurada só na metade do meio do retângulo (as barras são
  // alinhadas pelas letras, `alignBar`): no alto entram o fio claro da barra e a arte de
  // cima, com mais pixels por linha que as letras. Com uma delas como referência, as
  // letras inteiras ficavam "abaixo do texto" e o topo delas saía da máscara (Austere
  // Command, PIP, tipo branco na barra escura).
  const from = Math.floor(h / 4);
  const to = Math.max(from + 1, Math.ceil((3 * h) / 4));
  let peak = from;
  for (let y = from + 1; y < to; y++) if (count[y] > count[peak]) peak = y;
  if (count[peak] < 10) return;
  let base = peak;
  while (base + 1 < h && count[base + 1] >= count[peak] * 0.5) base++;
  const half = Math.max(10, Math.round(30 * unit));
  const sum = new Int32Array(w + 1);
  for (let y = base + 1; y < h; y++) {
    for (let x = 0; x < w; x++) sum[x + 1] = sum[x] + mask[y * w + x];
    const drop = new Int32Array(w + 1);
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - half);
      const b = Math.min(w, x + half + 1);
      if ((sum[b] - sum[a]) * 2 >= b - a) {
        drop[a]++;
        drop[b]--;
      }
    }
    for (let x = 0, on = 0; x < w; x++) {
      on += drop[x];
      if (on > 0) mask[y * w + x] = 0;
    }
  }
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
  // só o miolo da faixa: as bordas de cima e de baixo da barra são escuras
  const inset = Math.floor((rect.y1 - rect.y0) * 0.2);
  // Mede em fatias verticais, cada uma com a própria mediana: numa caixa de duas cores
  // (creme à esquerda, cinza à direita, como nos terrenos de duas cores) a mediana da
  // caixa inteira cai no meio, e a metade creme inteira contava como "texto claro".
  // E o pixel só conta se foge também da mediana da faixa inteira: numa fatia tomada
  // pelas letras grandes (o nome "Rhino" em branco na barra verde-escura), a mediana dela
  // sobe para o meio do caminho e o fundo escuro virava "texto escuro".
  const tile = Math.max(24, Math.round((rect.x1 - rect.x0) / 12));
  const histMedian = (hist: Uint32Array, m: number) => {
    let acc = 0;
    let v = 0;
    for (; v < 255; v++) {
      acc += hist[v];
      if (acc >= m / 2) break;
    }
    return v;
  };
  const tiles: { hist: Uint32Array; m: number }[] = [];
  const all = new Uint32Array(256);
  let n = 0;
  for (let t0 = rect.x0; t0 < rect.x1; t0 += tile) {
    const t1 = Math.min(rect.x1, t0 + tile);
    const hist = new Uint32Array(256);
    let m = 0;
    for (let y = rect.y0 + inset; y < rect.y1 - inset; y++) {
      for (let x = t0; x < t1; x++) {
        const v = Math.round(luminance(img.data, (y * img.width + x) * 4));
        hist[v]++;
        all[v]++;
        m++;
      }
    }
    if (m) tiles.push({ hist, m });
    n += m;
  }
  const global = histMedian(all, n);
  let dark = 0;
  let light = 0;
  for (const { hist, m } of tiles) {
    const med = histMedian(hist, m);
    // fatia em que as letras são mais da metade: o fundo da faixa ainda é boa parte
    // dela, e aí a referência é a mediana da faixa (senão as letras não contavam)
    let near = 0;
    for (let v = Math.max(0, global - 20); v <= Math.min(255, global + 20); v++) near += hist[v];
    const letters = Math.abs(med - global) > 45 && near >= m * 0.25;
    const lo = letters ? global : Math.min(med, global);
    const hi = letters ? global : Math.max(med, global);
    for (let v = 0; v < 256; v++) {
      if (v < lo - 45) dark += hist[v];
      else if (v > hi + 45) light += hist[v];
    }
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
  rowBackground = false,
  tiles = true,
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
  if (rowBackground) {
    // Barras (nome, tipo): o fundo de cada linha é a mediana dela. A janela quadrada
    // misturava o brilho do alto com a sombra escura do pé da barra, e a sombra
    // virava "texto": apagada até o custo de mana, sobrava um degrau.
    const row = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      row.set(lum.subarray(y * w, y * w + w));
      row.sort();
      bg.fill(row[w >> 1], y * w, y * w + w);
    }
  }

  // Fundo granulado (papel texturizado, caixa translúcida sobre a arte): o limiar
  // sobe com o ruído do fundo, medido pela mediana dos desvios (robusta ao texto,
  // que ocupa bem menos da metade da região). Sem isso a região inteira virava "texto".
  const unit = img.width / 745;
  const dev = new Float32Array(n);
  for (let k = 0; k < n; k++) dev[k] = Math.abs(lum[k] - bg[k]);
  let tLum = Math.max(threshold, 3 * 1.4826 * median(dev));
  let low = 0;
  if (rowBackground && tLum > threshold * 1.5) {
    // Barra de meia-tinta muito granulada (a ficha da Sentinela Oca): as letras grandes
    // também contavam como "ruído" e o limiar subia tanto que nada, ou só o miolo delas,
    // passava; o pé das letras ficava. O ruído de verdade é medido só do lado oposto ao
    // do texto (onde letra nenhuma cai), e o que está colado na letra entra com metade.
    const up: number[] = [];
    for (let k = 0; k < n; k++) if (lum[k] >= bg[k]) up.push(lum[k] - bg[k]);
    tLum = Math.max(threshold, Math.min(tLum, 3 * 1.4826 * median(Float32Array.from(up))));
    low = Math.max(threshold, tLum * 0.5);
  }
  // Nas caixas de letra escura o limiar é medido por ladrilho (`tileNoise`): numa caixa
  // translúcida metade lisa, metade sobre arte (fichas de 2008 a 2014), a metade lisa
  // mandava no limiar e a textura da outra virava "texto", apagada como um borrão liso.
  // O ruído vem do lado oposto ao do texto (mais claro que o fundo) e longe das letras
  // fortes. Letra clara fica fora: ela tem sombra escura em volta (Thunderbreak Regent),
  // que cai justamente do lado oposto e subia o limiar até as letras sumirem da máscara.
  // Nos planeswalkers (`tiles` falso) o limiar fica um só: a arte agitada atrás da caixa
  // (Vraska, ONE) subia o limiar do ladrilho e as letras do −9 ficavam; a rede neural
  // refaz a textura que a máscara pegar a mais, mas não apaga letra fora dela.
  const tile = Math.max(16, Math.round(32 * unit));
  let tAt: Float32Array | null = null;
  let calm: Uint8Array | null = null;
  if (tiles && !rowBackground && polarity === "dark") {
    const strong = new Uint8Array(n);
    for (let k = 0; k < n; k++) if (lum[k] < bg[k] - 2 * tLum) strong[k] = 1;
    const halo = morph(strong, w, h, Math.max(3, Math.round(5 * unit)), true);
    calm = new Uint8Array(n);
    for (let k = 0; k < n; k++) calm[k] = halo[k] ? 0 : 1;
    const c = calm;
    tAt = tileNoise(
      w,
      h,
      tile,
      tLum,
      (k) => lum[k] - bg[k],
      (k) => c[k] === 1 && lum[k] >= bg[k],
    );
  }
  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (lum[k] < bg[k] - (tAt ? tAt[k] : tLum)) mask[k] = 1;
  if (tAt) {
    // e onde o ladrilho é mais ruidoso que a caixa só fica o pedaço com miolo bem escuro
    // (o dobro do limiar dali): letra sempre tem; a pinta da textura que mal passa do
    // limiar fica, e não vira um remendo liso. Nos ladrilhos calmos nada muda
    const seeded = new Uint8Array(n);
    const queue: number[] = [];
    for (let k = 0; k < n; k++)
      if (mask[k] && (tAt[k] <= tLum * 1.05 || lum[k] < bg[k] - 2 * tAt[k])) {
        seeded[k] = 1;
        queue.push(k);
      }
    while (queue.length) {
      const k = queue.pop()!;
      const x = k % w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx < 0 && x === 0) || (dx > 0 && x === w - 1)) continue;
          const q = k + dy * w + dx;
          if (q < 0 || q >= n || seeded[q] || !mask[q]) continue;
          seeded[q] = 1;
          queue.push(q);
        }
    }
    mask.set(seeded);
  }
  if (low && low < tLum) {
    const queue: number[] = [];
    for (let k = 0; k < n; k++) if (mask[k]) queue.push(k);
    while (queue.length) {
      const k = queue.pop()!;
      const x = k % w;
      for (const q of [k - 1, k + 1, k - w, k + w]) {
        if (q < 0 || q >= n || mask[q]) continue;
        if ((q === k - 1 && x === 0) || (q === k + 1 && x === w - 1)) continue;
        if (lum[q] < bg[q] - low) {
          mask[q] = 1;
          queue.push(q);
        }
      }
    }
  }

  if (colorThreshold > 0) {
    for (let k = 0; k < n; k++) if (mask[k]) keep[k] = 0;
    const bgc = rgb.map((ch) => boxMean(ch, keep, w, h, radius));
    const dist = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const dr = rgb[0][k] - bgc[0][k];
      const dg = rgb[1][k] - bgc[1][k];
      const db = rgb[2][k] - bgc[2][k];
      dist[k] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
    const tColor = Math.max(colorThreshold, 3 * 1.4826 * median(dist));
    // a cor também, por ladrilho, contando só o que não é letra
    const tColorAt = !calm
      ? null
      : tileNoise(
          w,
          h,
          tile,
          tColor,
          (k) => dist[k],
          (k) => !mask[k] && calm![k] === 1,
        );
    const tc = (k: number) => (tColorAt ? tColorAt[k] : tColor);
    // o miolo colorido dos símbolos de mana sempre encosta no desenho escuro deles:
    // cor diferente longe de qualquer letra é textura do fundo, não texto
    const near = morph(mask, w, h, Math.max(3, Math.round(unit * 14)), true);
    for (let k = 0; k < n; k++) if (dist[k] > tc(k) && near[k]) mask[k] = 1;
    // Histerese: a borda suavizada do círculo cinza dos símbolos ({1}, {T}) sobre papel
    // colorido quase não muda o brilho e muda pouco a cor; colada no que já é símbolo,
    // ela entra com metade do limiar (sobrava uma lua crescente cinza ao lado do texto).
    // Num papel granulado (as duplas de 2014) o grão sozinho muda a cor tanto quanto a
    // borda clara do círculo azul ({U}), que ficava como lua crescente. Medida também na
    // média de uns pixels em volta (sem as letras), o grão some e o círculo continua.
    const ones = new Float32Array(n);
    for (let k = 0; k < n; k++) ones[k] = mask[k] ? 0 : 1;
    const soft = Math.max(1, Math.round(unit * 2));
    const rgbS = rgb.map((ch) => boxMean(ch, ones, w, h, soft));
    const distS = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const dr = rgbS[0][k] - bgc[0][k];
      const dg = rgbS[1][k] - bgc[1][k];
      const db = rgbS[2][k] - bgc[2][k];
      distS[k] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
    const lowS = Math.max(colorThreshold, 3 * 1.4826 * median(distS));
    const lowSAt = !calm
      ? null
      : tileNoise(
          w,
          h,
          tile,
          lowS,
          (k) => distS[k],
          (k) => !mask[k] && calm![k] === 1,
        );
    const steps = Math.max(3, Math.round(unit * 6));
    for (let it = 0; it < steps; it++) {
      const add: number[] = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const k = y * w + x;
          if (mask[k] || !near[k] || (dist[k] <= tc(k) * 0.5 && distS[k] <= (lowSAt ? lowSAt[k] : lowS) * 0.5)) continue;
          if ((x > 0 && mask[k - 1]) || (x < w - 1 && mask[k + 1]) || (y > 0 && mask[k - w]) || (y < h - 1 && mask[k + w])) add.push(k);
        }
      if (!add.length) break;
      for (const k of add) mask[k] = 1;
    }
  }

  if (rowBackground) dropArtBelowText(mask, w, h, unit);

  // letras claras numa barra (nome das fichas, verso das cartas de duas faces) têm sombra
  // e borda suavizada mais largas: com a folga de 2 px sobrava o contorno da letra apagada
  // (o "C" e o "O" do emblema da Chandra)
  let out = morph(mask, w, h, Math.max(1, Math.round(unit * (rowBackground && polarity === "light" ? 4 : 2))), true);
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

/**
 * Ruído do fundo ladrilho a ladrilho (lado `tile`), como limiar: três desvios robustos
 * (mediana de `value` nos pixels em que `use` vale), nunca abaixo de `floor`, o limiar da
 * caixa inteira. Para caixas translúcidas metade lisa, metade sobre arte escura ou com
 * bolhas (fichas de 2008 a 2014): com um limiar só, a textura da metade da arte virava
 * "texto" e saía apagada como um borrão liso. Entre os centros dos ladrilhos o limiar é
 * interpolado, para a máscara não ganhar degraus.
 */
function tileNoise(
  w: number,
  h: number,
  tile: number,
  floor: number,
  value: (k: number) => number,
  counts: (k: number) => boolean,
): Float32Array {
  const gx = Math.max(1, Math.round(w / tile));
  const gy = Math.max(1, Math.round(h / tile));
  const tw = w / gx;
  const th = h / gy;
  const grid = new Float32Array(gx * gy);
  for (let ty = 0; ty < gy; ty++)
    for (let tx = 0; tx < gx; tx++) {
      const vals: number[] = [];
      for (let y = Math.floor(ty * th); y < Math.floor((ty + 1) * th); y++)
        for (let x = Math.floor(tx * tw); x < Math.floor((tx + 1) * tw); x++) {
          const k = y * w + x;
          if (counts(k)) vals.push(value(k));
        }
      grid[ty * gx + tx] = vals.length >= 16 ? Math.max(floor, 3 * 1.4826 * median(Float32Array.from(vals))) : floor;
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gy - 1, Math.max(0, (y + 0.5) / th - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gy - 1, y0 + 1);
    const ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gx - 1, Math.max(0, (x + 0.5) / tw - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gx - 1, x0 + 1);
      const ax = fx - x0;
      const top = grid[y0 * gx + x0] * (1 - ax) + grid[y0 * gx + x1] * ax;
      const bot = grid[y1 * gx + x0] * (1 - ax) + grid[y1 * gx + x1] * ax;
      out[y * w + x] = top * (1 - ay) + bot * ay;
    }
  }
  return out;
}

/**
 * Estende a máscara do texto para manchas que encostam nele e fogem da cor do papel
 * (a marca-d'água das guildas atrás do texto). Apagar só as letras deixava pedaços
 * da marca-d'água soltos, como mancha. O limiar sobe com o ruído do papel: numa caixa
 * texturizada nada cresce. Se a mancha toma quase a caixa toda, não é marca-d'água.
 */
/**
 * Ajuste robusto de um plano v = a + bx·x + by·y aos pixels `ks` (índices numa grade
 * de largura `w`): três passadas de mínimos quadrados, descartando a cada uma o que
 * foge mais de 2,5 desvios (letra, marca-d'água).
 */
function fitPlane(ks: number[], w: number, v: (k: number) => number): [number, number, number] {
  let keep = ks;
  let coef: [number, number, number] = [0, 0, 0];
  for (let pass = 0; pass < 3 && keep.length >= 10; pass++) {
    // equações normais 3×3
    let n = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0,
      sv = 0,
      sxv = 0,
      syv = 0;
    for (const k of keep) {
      const x = k % w;
      const y = Math.floor(k / w);
      const z = v(k);
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      sv += z;
      sxv += x * z;
      syv += y * z;
    }
    const m = [
      [n, sx, sy],
      [sx, sxx, sxy],
      [sy, sxy, syy],
    ];
    const r = [sv, sxv, syv];
    const det = (a: number[][]) =>
      a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
      a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
      a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const d = det(m);
    if (Math.abs(d) < 1e-9) {
      coef = [sv / n, 0, 0];
      break;
    }
    const col = (i: number) => m.map((row, j) => row.map((x, q) => (q === i ? r[j] : x)));
    coef = [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
    const res = keep.map((k) => Math.abs(v(k) - (coef[0] + coef[1] * (k % w) + coef[2] * Math.floor(k / w))));
    const mad = median(Float32Array.from(res)) * 1.4826;
    const lim = Math.max(3, 2.5 * mad);
    keep = keep.filter((_, i) => res[i] <= lim);
  }
  return coef;
}

function growStains(img: ImageData, rect: Rect, mask: Uint8Array): Uint8Array {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const n = w * h;
  const rgb = (k: number, c: number) => img.data[((rect.y0 + Math.floor(k / w)) * img.width + rect.x0 + (k % w)) * 4 + c];
  // Papel = plano (cor que muda em linha reta de um canto a outro), ajustado sem ligar
  // para o que foge dele. Com uma cor só, o degradê das caixas (vermelho à esquerda,
  // branco à direita, nas de duas cores) ficava acima do limite em metade da caixa:
  // a marca-d'água ali escapava pela metade e sobrava um fantasma dela.
  const sample: number[] = [];
  for (let k = 0; k < n; k += 7) if (!mask[k]) sample.push(k);
  const paperAt = [0, 1, 2].map((c) => fitPlane(sample, w, (k) => rgb(k, c)));
  const model = (k: number, c: number) => {
    const [a, bx, by] = paperAt[c];
    return a + bx * (k % w) + by * Math.floor(k / w);
  };
  const dist = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const dr = rgb(k, 0) - model(k, 0);
    const dg = rgb(k, 1) - model(k, 1);
    const db = rgb(k, 2) - model(k, 2);
    dist[k] = Math.sqrt(dr * dr + dg * dg + db * db);
  }
  const t = Math.max(14, 3 * 1.4826 * median(dist));
  // Tom (sem o brilho): o disco cinza dos símbolos de mana sobre papel colorido mal
  // muda de luminância, mas muda de cor. A textura do papel quase só varia em brilho.
  const chroma = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = rgb(k, 0) - rgb(k, 1) - (model(k, 0) - model(k, 1));
    const b = rgb(k, 1) - rgb(k, 2) - (model(k, 1) - model(k, 2));
    chroma[k] = Math.sqrt(a * a + b * b);
  }
  const tc = Math.max(12, 3 * 1.4826 * median(chroma));
  // Desvio médio numa janela de 5 × 5 px, sem contar as letras: marca-d'água clara em
  // papel de grão forte (Preço Final da FNM) fica só ~3 desvios acima do papel, pixel a
  // pixel no mesmo nível do grão, e as pontas finas dos raios sobravam como riscos. Na
  // média da janela o grão some e a marca, que é larga e lisa, continua.
  const near = blurredDeviation(w, h, mask, (k, c) => rgb(k, c) - model(k, c), Math.max(2, Math.round((2 * img.width) / 745)));
  const nearPaper: number[] = [];
  for (let k = 0; k < n; k += 7) if (!mask[k]) nearPaper.push(near[k]);
  const tn = Math.max(14, 3 * 1.4826 * median(Float32Array.from(nearPaper)));
  const out = mask.slice();
  const queue: number[] = [];
  for (let k = 0; k < n; k++) if (mask[k]) queue.push(k);
  const stain = (q: number) => dist[q] > t || chroma[q] > tc || near[q] > tn;
  let grown = 0;
  // Pedaço de marca-d'água solto, sem letra encostada (as pontas da marca do Recepcionista
  // Diabólico, SNC, acima do texto): também é mancha, desde que tenha corpo e seja tinta,
  // mais escura que o papel e colorida, ou sem cor mas escura de verdade, com a média do
  // pedaço inteiro passando do limiar (as pontas cinza-azuladas da marca Dimir do
  // Inseto-espião Dimir, GRN). Grão do papel passa do limiar em pixels soltos, nunca num
  // bloco desse tamanho; o brilho das bolhas da caixa translúcida das fichas (Vampiro de
  // ISD, Espírito de EVE) é claro e sem cor, e as sombras delas mal escurecem o papel:
  // apagadas, a caixa ficava lisa.
  const minArea = Math.round(40 * (img.width / 745) ** 2);
  const seen = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (seen[k] || out[k] || !stain(k)) continue;
    const comp = [k];
    seen[k] = 1;
    for (let i = 0; i < comp.length; i++) {
      const c = comp[i];
      const x = c % w;
      for (const q of [c - 1, c + 1, c - w, c + w]) {
        if (q < 0 || q >= n || seen[q] || out[q]) continue;
        if ((q === c - 1 && x === 0) || (q === c + 1 && x === w - 1)) continue;
        if (!stain(q)) continue;
        seen[q] = 1;
        comp.push(q);
      }
    }
    let colored = 0;
    let shade = 0;
    for (const c of comp) {
      if (chroma[c] > tc) colored++;
      shade += rgb(c, 0) + rgb(c, 1) + rgb(c, 2) - model(c, 0) - model(c, 1) - model(c, 2);
    }
    // distância média do papel, num pedaço sem cor (o mesmo desvio nos três canais)
    const dark = -shade / comp.length / Math.sqrt(3);
    if (comp.length >= minArea && shade < 0 && (colored >= comp.length / 2 || dark > t)) {
      grown += comp.length;
      for (const c of comp) {
        out[c] = 1;
        queue.push(c);
      }
    }
  }
  while (queue.length) {
    const k = queue.pop()!;
    const x = k % w;
    for (const q of [k - 1, k + 1, k - w, k + w]) {
      if (q < 0 || q >= n || out[q]) continue;
      if ((q === k - 1 && x === 0) || (q === k + 1 && x === w - 1)) continue;
      if (!stain(q)) continue;
      out[q] = 1;
      grown++;
      queue.push(q);
    }
  }
  if (grown > n * 0.35) return mask;
  // folga de 3 px: leva junto a borda suavizada (senão ela vira a cor do preenchimento)
  return morph(out, w, h, Math.max(2, Math.round((3 * img.width) / 745)), true);
}

/**
 * Tamanho do desvio do papel (`dev`, por canal) na média de uma janela quadrada de raio `r`,
 * contando só os pixels fora da máscara. Pixel sem vizinho de fora fica com 0.
 */
function blurredDeviation(w: number, h: number, mask: Uint8Array, dev: (k: number, c: number) => number, r: number): Float32Array {
  const W = w + 1;
  // somas acumuladas (tabela de área) de cada canal e da contagem
  const sums = [0, 1, 2, 3].map(() => new Float64Array(W * (h + 1)));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const use = mask[k] ? 0 : 1;
      const at = (y + 1) * W + x + 1;
      for (let c = 0; c < 4; c++) {
        const v = c === 3 ? use : use ? dev(k, c) : 0;
        sums[c][at] = v + sums[c][at - 1] + sums[c][at - W] - sums[c][at - W - 1];
      }
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const box = (c: number) => sums[c][yb * W + xb] - sums[c][ya * W + xb] - sums[c][yb * W + xa] + sums[c][ya * W + xa];
      const count = box(3);
      if (!count) continue;
      const a = box(0) / count;
      const b = box(1) / count;
      const d = box(2) / count;
      out[y * w + x] = Math.sqrt(a * a + b * b + d * d);
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
export function inpaint(img: ImageData, rect: Rect, mask: Uint8Array, fill: "pyramid" | "rows" = "pyramid", ignore?: Uint8Array): void {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  // `ignore`: pixels que ficam como estão mas não servem de fonte (o selo no pé da
  // caixa: a borda colorida dele escorria para o preenchimento logo acima)
  const unknown = ignore ? mask.map((m, k) => m | ignore[k]) : mask;
  if (fill === "rows") {
    inpaintRows(img, rect, mask, unknown);
    return;
  }
  // Nível 0: cor pré-multiplicada pelo peso (1 = conhecido, 0 = buraco).
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Level = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (unknown[k]) continue;
      const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
      base.c[k * 3] = img.data[i];
      base.c[k * 3 + 1] = img.data[i + 1];
      base.c[k * 3 + 2] = img.data[i + 2];
      base.a[k] = 1;
    }
  }
  // sem nenhum pixel conhecido não há de onde tirar a cor: melhor não mexer do que pintar de preto
  if (!base.a.some((a) => a > 0)) return;
  smoothNoisyPaper(base.c, base.a, w, h, img.width / 745);
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
  addGrain(img, rect, mask, (k, c) => base.c[k * 3 + c], 10, unknown);
}

/**
 * A caixa de texto é escura? O papel da moldura M15 é sempre claro (luminância mediana de
 * 150 a 245 nas mais de mil cartas das amostras). Uma caixa escura é a arte passando por
 * trás de uma caixa translúcida, numa moldura especial que o Scryfall não marca (a variante
 * do Crucible of Worlds da NAC, 59; a promo de Game Day do Thunderbreak Regent, 88). Ali o
 * apagamento não acha o fundo das letras: o motor desiste e a carta sai na original.
 */
export function darkTextBox(img: ImageData, rect: Rect): boolean {
  const x0 = clamp(Math.round(rect.x0), 0, img.width);
  const x1 = clamp(Math.round(rect.x1), 0, img.width);
  const y0 = clamp(Math.round(rect.y0), 0, img.height);
  const y1 = clamp(Math.round(rect.y1), 0, img.height);
  const lum: number[] = [];
  for (let y = y0; y < y1; y += 3)
    for (let x = x0; x < x1; x += 3) {
      const i = (y * img.width + x) * 4;
      lum.push(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]);
    }
  return lum.length > 0 && median(Float32Array.from(lum)) < 110;
}

/**
 * Papel de retícula grossa (Dragonskull Summit, C16): de um pixel a outro a cor muda 15 a
 * 35 tons, e há pingos claros soltos. A pirâmide parte do pixel exato da borda do buraco,
 * e cada pingo ou ponto da retícula ali virava uma mancha clara ou colorida de 3 a 5 px no
 * meio do remendo. Num papel assim (mais de 12 tons de ruído típico), a cor de partida de
 * cada pixel conhecido passa a ser a média dos vizinhos conhecidos; o grão volta depois,
 * copiado (`addGrain`). Papel comum (4 a 10 tons) fica como está. Muda `c` no lugar.
 */
export function smoothNoisyPaper(c: Float32Array, a: Float32Array, w: number, h: number, unit: number): void {
  const r = Math.max(8, Math.round(8 * unit));
  const chans = [0, 1, 2].map((ch) => {
    const v = new Float32Array(w * h);
    for (let k = 0; k < w * h; k++) v[k] = c[k * 3 + ch];
    return v;
  });
  const noise = chans.map((v) => {
    const mean = boxMean(v, a, w, h, r);
    const d: number[] = [];
    for (let k = 0; k < w * h; k += 3) if (a[k]) d.push(Math.abs(v[k] - mean[k]));
    return d.length ? median(Float32Array.from(d)) * 1.4826 : 0;
  });
  if (Math.max(...noise) <= 12) return;
  const rs = Math.max(2, Math.round(2 * unit));
  chans.forEach((v, ch) => {
    const mean = boxMean(v, a, w, h, rs);
    for (let k = 0; k < w * h; k++) if (a[k]) c[k * 3 + ch] = mean[k];
  });
}

/**
 * Escreve o preenchimento nos pixels mascarados, com grão. O preenchimento sozinho
 * é liso, e num fundo granulado (barra de tipo texturizada, papel da caixa) o trecho
 * liso aparece como mancha. Cada pixel ganha o desvio de um vizinho conhecido
 * sorteado em relação à média local dele: copia a textura sem copiar formas.
 * `ry` limita o sorteio na vertical (nas barras, a cor muda de cima para baixo).
 */
function addGrain(
  img: ImageData,
  rect: Rect,
  mask: Uint8Array,
  value: (k: number, c: number) => number,
  ry = 10,
  unknown: Uint8Array = mask,
): void {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const known = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) known[k] = unknown[k] ? 0 : 1;
  // nas caixas, o desvio vem de remendos coerentes (um deslocamento por bloco), que
  // reproduzem também os veios maiores do papel; ponto a ponto, sobrava um trecho liso
  const patch = ry > 1;
  const radius = patch ? 8 : 3;
  const limit = patch ? 40 : 20;
  const chan = [0, 1, 2].map((c) => {
    const v = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = img.data[((rect.y0 + y) * img.width + rect.x0 + x) * 4 + c];
    return { v, mean: boxMean(v, known, w, h, radius) };
  });
  // fonte boa = pixel conhecido sem borda perto (fio da caixa, filete do flavor, letra
  // que ficou): copiar o desvio de uma borda deixava riscos e blocos claros ou escuros.
  // "Borda" é o que foge mais de 3 desvios do grão típico daquele papel (medido, robusto).
  const spread = chan.map((ch) => {
    const d: number[] = [];
    for (let k = 0; k < w * h; k += 3) if (!unknown[k]) d.push(Math.abs(ch.v[k] - ch.mean[k]));
    return median(Float32Array.from(d)) * 1.4826;
  });
  const cap = spread.map((sd) => Math.min(limit, Math.max(4, 3 * sd)));
  // (num fundo de grão forte o "calmo" acompanha o grão dele, até o teto: com o limite fixo
  // em 60% do teto, quase nenhum pixel da barra granulada do Corpse Augur, C15, servia de
  // fonte, e o fim do tipo apagado saía liso, um retângulo claro)
  const calmLimit = cap.map((cp, c) => Math.min(cp, Math.max(limit * 0.6, 1.5 * spread[c])));
  const calm = (q: number) => !unknown[q] && chan.every((ch, c) => Math.abs(ch.v[q] - ch.mean[q]) <= calmLimit[c]);
  let seed = (rect.x0 * 73856093) ^ (rect.y0 * 19349663) ^ (w * 83492791);
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const B = Math.max(8, Math.round((16 * img.width) / 745));
  // Segundo sorteio, na região inteira, com gerador próprio (os outros blocos ficam com
  // o mesmo remendo): no meio de um texto denso, tudo a até 4 blocos de distância é
  // letra, e o bloco saía liso no meio do grão (a linha do meio da ficha Lula de CLB, no
  // papel pontilhado).
  let seedWide = seed ^ 0x5bd1e995;
  const randWide = () => ((seedWide = (Math.imul(seedWide, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const offsets = new Map<number, [number, number] | null>();
  const blockOffset = (bx: number, by: number): [number, number] | null => {
    const key = by * 65536 + bx;
    if (offsets.has(key)) return offsets.get(key)!;
    let best: [number, number] | null = null;
    let bestScore = -1;
    const tryOffset = (ox: number, oy: number) => {
      if (Math.abs(ox) < B && Math.abs(oy) < B) return;
      let ok = 0;
      let all = 0;
      for (let y = by * B; y < Math.min(h, by * B + B); y++)
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          if (!mask[y * w + x]) continue;
          all++;
          const qx = x + ox;
          const qy = y + oy;
          if (qx >= 0 && qy >= 0 && qx < w && qy < h && calm(qy * w + qx)) ok++;
        }
      const score = all ? ok / all : 0;
      if (score > bestScore) {
        bestScore = score;
        best = [ox, oy];
      }
    };
    for (let t = 0; t < 24 && bestScore < 1; t++) tryOffset(Math.round((rand() * 2 - 1) * 4 * B), Math.round((rand() * 2 - 1) * 3 * B));
    for (let t = 0; t < 24 && bestScore < 0.9; t++)
      tryOffset(Math.round(randWide() * Math.max(0, w - B)) - bx * B, Math.round(randWide() * Math.max(0, h - B)) - by * B);
    offsets.set(key, best);
    return best;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!mask[k]) continue;
      let q = -1;
      if (patch) {
        const o = blockOffset(Math.floor(x / B), Math.floor(y / B));
        if (o) {
          const qx = x + o[0];
          const qy = y + o[1];
          if (qx >= 0 && qy >= 0 && qx < w && qy < h && calm(qy * w + qx)) q = qy * w + qx;
        }
      }
      for (let t = 0; t < 12 && q < 0; t++) {
        const qx = x + Math.round((rand() * 2 - 1) * 10);
        const qy = y + Math.round((rand() * 2 - 1) * ry);
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        if (calm(qy * w + qx)) q = qy * w + qx;
      }
      // no meio de uma palavra comprida não há papel a 10 px: busca na linha inteira
      for (let t = 0; t < 12 && q < 0; t++) {
        const qx = Math.floor(rand() * w);
        const qy = y + Math.round((rand() * 2 - 1) * ry);
        if (qy < 0 || qy >= h) continue;
        if (calm(qy * w + qx)) q = qy * w + qx;
      }
      const i = ((rect.y0 + y) * img.width + rect.x0 + x) * 4;
      for (let c = 0; c < 3; c++) {
        const grain = q < 0 ? 0 : clamp(chan[c].v[q] - chan[c].mean[q], -cap[c], cap[c]);
        img.data[i + c] = value(k, c) + grain;
      }
    }
  }
}
/**
 * Preenche linha a linha com a mediana dos pixels conhecidos da mesma linha, ali
 * perto. Nas barras (nome e tipo) a cor muda de cima para baixo, não de lado: a
 * média em pirâmide misturava o brilho do alto com a sombra de baixo e deixava uma
 * mancha clara onde estavam as letras. A mediana (e não a interpolação entre os
 * vizinhos) evita riscos quando o vizinho é um fio escuro.
 */
function inpaintRows(img: ImageData, rect: Rect, mask: Uint8Array, unknown: Uint8Array = mask): void {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const fill = new Float32Array(w * h * 3);
  const px = (x: number, y: number, c: number) => img.data[((rect.y0 + y) * img.width + rect.x0 + x) * 4 + c];
  const unit = img.width / 745;
  const win = Math.max(12, Math.round(30 * unit));
  const side = Math.max(4, Math.round(10 * unit));
  const vals: number[][] = [[], [], []];
  const median = (): number[] | null => {
    if (!vals[0].length) return null;
    return vals.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
  };
  // mediana de até `side` pixels conhecidos logo ao lado do trecho, nesta linha e nas
  // vizinhas: só com a própria linha, cada uma pegava um pedaço diferente do brilho e o
  // remendo saía listrado (faixas diagonais do foil, a barra metálica do Tesouro de FIN)
  const near = Math.max(1, Math.round(2 * unit));
  const beside = (y: number, from: number, dir: 1 | -1): number[] | null => {
    for (const v of vals) v.length = 0;
    for (let yy = Math.max(0, y - near); yy <= Math.min(h - 1, y + near); yy++)
      for (let x = from, seen = 0, got = 0; x >= 0 && x < w && seen < side * 3 && got < side; x += dir, seen++)
        if (!unknown[yy * w + x]) {
          got++;
          for (let c = 0; c < 3; c++) vals[c].push(px(x, yy, c));
        }
    return median();
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w;) {
      if (!mask[y * w + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && mask[y * w + e]) e++;
      // Cada trecho apagado vai de um lado ao outro em linha reta, entre a cor que está
      // logo antes e logo depois dele. Com a mediana de uma janela em volta, perto da
      // ponta da barra (que clareia de repente) a letra apagada ficava mais clara que o
      // fundo ao lado e sobrava um fantasma dela (emblema da Chandra, CMM).
      const a = beside(y, x - 1, -1);
      const b = beside(y, e, 1);
      if (a || b) {
        const l = a ?? b!;
        const r = b ?? a!;
        for (let q = x; q < e; q++) {
          const t = (q - x + 1) / (e - x + 1);
          for (let c = 0; c < 3; c++) fill[(y * w + q) * 3 + c] = l[c] + (r[c] - l[c]) * t;
        }
      } else
        for (let q = x; q < e; q++) {
          // nada conhecido dos lados: mediana numa janela que cresce até achar
          for (let r = win; r <= w; r *= 2) {
            for (const v of vals) v.length = 0;
            for (let z = Math.max(0, q - r); z < Math.min(w, q + r + 1); z++)
              if (!unknown[y * w + z]) for (let c = 0; c < 3; c++) vals[c].push(px(z, y, c));
            if (vals[0].length >= 4 || r * 2 > w) break;
          }
          const m = median();
          for (let c = 0; c < 3; c++) fill[(y * w + q) * 3 + c] = m ? m[c] : px(q, y, c);
        }
      x = e;
    }
  }
  // alisa o remendo na vertical, só com o próprio remendo (o fio escuro da barra, logo
  // acima ou abaixo, não entra): o que sobra de diferença entre uma linha e a seguinte
  // vira risco horizontal, que o olho pega na hora
  const reach = Math.max(1, Math.round(3 * unit));
  const smooth = new Float32Array(fill.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!mask[k]) continue;
      const sum = [0, 0, 0];
      let n = 0;
      for (let yy = Math.max(0, y - reach); yy <= Math.min(h - 1, y + reach); yy++) {
        const q = yy * w + x;
        if (!mask[q]) continue;
        // só o que é parecido: no pé da barra o fio escuro e o papel claro ficam
        // separados (misturados, o fio ganhava pingos claros)
        let far = false;
        for (let c = 0; c < 3; c++) if (Math.abs(fill[q * 3 + c] - fill[k * 3 + c]) > 20) far = true;
        if (far) continue;
        for (let c = 0; c < 3; c++) sum[c] += fill[q * 3 + c];
        n++;
      }
      for (let c = 0; c < 3; c++) smooth[k * 3 + c] = sum[c] / n;
    }
  addGrain(img, rect, mask, (k, c) => smooth[k * 3 + c], 1, unknown);
}

/**
 * Recolhe as bordas de `rect` para dentro do fio interno da caixa de texto. O fio
 * (e a sombra dele) muda alguns pixels de lugar entre molduras e coleções: com a
 * medida fixa, a sombra escura da direita entrava na máscara e saía apagada. O fio é
 * a coluna que foge do papel em quase todas as linhas; letra nenhuma faz isso.
 */
export function insideBoxSides(img: ImageData, rect: Rect, search: number, growBottom = false): Rect {
  const x0 = Math.round(rect.x0);
  const x1 = Math.round(rect.x1);
  const y0 = Math.round(rect.y0);
  const y1 = Math.round(rect.y1);
  if (y1 - y0 < 20 || x1 - x0 < 20) return rect;
  const at = (x: number, y: number) => luminance(img.data, (y * img.width + x) * 4);
  // degrau contra o pixel uns passos para dentro: o fio muda o tom de repente, já o
  // degradê do papel (caixas que escurecem nas pontas) muda devagar e não conta
  const d = Math.max(2, Math.round((3 * img.width) / 745));
  // E o fio muda o tom sempre para o mesmo lado (escurece ou clareia a coluna toda). O
  // começo das linhas de texto claro com sombra (Thunderbreak Regent, promo de DTK) muda
  // em quase toda linha também, mas para os dois lados: a caixa "começava" ali e a
  // primeira letra de cada linha ficava em inglês.
  const col = (x: number, dir: number) => {
    if (x < 0 || x >= img.width) return false;
    let up = 0;
    let down = 0;
    for (let y = y0; y < y1; y++) {
      const v = at(x, y) - at(x - dir * d, y);
      if (v > 20) up++;
      else if (v < -20) down++;
    }
    return up + down >= (y1 - y0) * 0.7 && Math.max(up, down) >= (y1 - y0) * 0.6;
  };
  const out = { ...rect };
  for (let x = x1 - search; x <= x1; x++)
    if (col(x, 1)) {
      out.x1 = Math.max(out.x0 + 1, x - 1);
      break;
    }
  for (let x = x0 + search; x >= x0; x--)
    if (col(x, -1)) {
      out.x0 = Math.min(out.x1 - 1, x + 2);
      break;
    }
  // o mesmo em cima e embaixo: a faixa da moldura entre a barra de tipo e a caixa
  // (e o fio de cima) também entrava na medida fixa e saía pintada da cor do papel
  const cx0 = Math.round(out.x0);
  const cx1 = Math.round(out.x1);
  const row = (y: number, dir: number) => {
    if (y < 0 || y >= img.height) return false;
    let off = 0;
    for (let x = cx0; x < cx1; x++) if (Math.abs(at(x, y) - at(x, y - dir * d)) > 20) off++;
    return off >= (cx1 - cx0) * 0.8;
  };
  // Embaixo o fio some atrás do selo e da caixa de P/R: mede só no terço da esquerda.
  // E o pé da caixa costuma ter um filete claro (bisel) antes do fio escuro, que sobe
  // o tom em dois ou três pixels: degrau contra seis pixels acima, para o filete ficar
  // (o degradê do papel, como na neve, muda bem mais devagar que isso).
  const leftEnd = Math.round(cx0 + (cx1 - cx0) * 0.38);
  const d6 = Math.max(4, Math.round((6 * img.height) / 1040));
  // (por canal, não por brilho: o filete branco sobre papel amarelado quase não muda o
  // brilho, mas muda o azul)
  const step = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    const j = ((y - d6) * img.width + x) * 4;
    const dd = img.data;
    return Math.max(Math.abs(dd[i] - dd[j]), Math.abs(dd[i + 1] - dd[j + 1]), Math.abs(dd[i + 2] - dd[j + 2]));
  };
  // Num papel granulado (as duplas de 2014) o ruído sozinho passa de 18 em metade dos
  // pixels, e a última linha de letras grandes chegava aos 80%: a caixa "acabava" no
  // meio do texto e o pé das letras ficava. O fio de baixo muda o tom num só sentido
  // (escurece ou clareia a linha toda); letras e ruído mudam nos dois sentidos.
  const offPaper = (y: number) => {
    if (y - d6 < 0 || y >= img.height) return false;
    const dd = img.data;
    const n = leftEnd - cx0;
    let off = 0;
    const sum = [0, 0, 0];
    for (let x = cx0; x < leftEnd; x++) {
      if (step(x, y) > 18) off++;
      const i = (y * img.width + x) * 4;
      const j = ((y - d6) * img.width + x) * 4;
      for (let c = 0; c < 3; c++) sum[c] += dd[i + c] - dd[j + c];
    }
    if (off < n * 0.8) return false;
    const sign = sum.map((v) => Math.sign(v));
    let same = 0;
    for (let x = cx0; x < leftEnd; x++) {
      const i = (y * img.width + x) * 4;
      const j = ((y - d6) * img.width + x) * 4;
      if ([0, 1, 2].some((c) => (dd[i + c] - dd[j + c]) * sign[c] > 18)) same++;
    }
    if (same < n * 0.7) return false;
    // e, na média, a linha muda de tom de verdade (pelo menos metade do degrau): num
    // papel com grão em faixas (OGW) uma linha só um pouco mais clara, com o pé das
    // letras do flavor, também tinha quase toda coluna mudando para o mesmo lado, mas a
    // tinta preta compensava o grão e a média ficava parada (Holdout Settlement). Nos
    // fios de verdade a média muda 20 ou mais
    if (Math.max(...sum.map(Math.abs)) < n * 9) return false;
    // e o fio é liso: a linha dele (ou a seguinte, se esta for a borda suavizada) tem
    // quase tudo no mesmo tom. A assinatura do flavor em itálico, comprida, cobria o
    // terço da esquerda inteiro (Corpse Hauler, JMP) e o pé dela passava por "fio": a
    // caixa acabava ali e metade da assinatura ficava
    const smooth = (yy: number, share = 0.55) => {
      if (yy < 0 || yy >= img.height) return false;
      const lums: number[] = [];
      for (let x = cx0; x < leftEnd; x++) lums.push(at(x, yy));
      const mid = median(Float32Array.from(lums));
      return lums.filter((v) => Math.abs(v - mid) <= 25).length >= n * share;
    };
    // e o degrau é contra papel: a linha de cima também é lisa. Com a última linha de
    // letras grandes no fim da busca (emblema do Daretti), o papel logo abaixo delas, ou o
    // pé das serifas, mudava contra a linha das letras e virava "fio": a caixa acabava ali
    // e o pé da linha (ou o rabo do g e do p) ficava em inglês
    return (smooth(y) || smooth(y + 1)) && smooth(y - d6, 0.75);
  };
  const vs = Math.round(search * 0.6);
  for (let y = y0 + vs; y >= y0; y--)
    if (row(y, -1)) {
      out.y0 = Math.min(out.y1 - 1, y + 2);
      break;
    }
  // nas cartas (`growBottom`) a busca embaixo passa da medida: em algumas molduras a
  // caixa desce mais e o pé das letras da última linha ficava fora do apagamento. Nas
  // fichas o pé já é medido (fio, brilho) e passar dele apagava o fio de baixo.
  for (let y = y1 - vs; y < Math.min(img.height - 1, growBottom ? y1 + vs : y1); y++)
    if (offPaper(y)) {
      out.y1 = Math.max(out.y0 + 1, y - 2);
      break;
    }
  return out;
}

/**
 * Topo da caixa de P/R (escala da imagem): a primeira linha, a partir de `y0`, em que
 * quase toda a faixa `x0..x1` foge do papel e continua assim por três linhas (letra
 * nenhuma cobre 70% da largura em três linhas seguidas). `null` sem caixa ali.
 */
export function ptBoxTop(img: ImageData, x0: number, x1: number, y0: number, y1: number, paperY: number): number | null {
  const at = (x: number, y: number) => luminance(img.data, (Math.round(y) * img.width + Math.round(x)) * 4);
  const ref: number[] = [];
  for (let y = paperY - 10; y < paperY; y++) for (let x = x0 - 160; x < x0 - 60; x += 2) ref.push(at(x, y));
  const paper = median(Float32Array.from(ref));
  const wide = (y: number) => {
    let off = 0;
    let all = 0;
    for (let x = x0; x < x1; x++, all++) if (Math.abs(at(x, y) - paper) > 40) off++;
    return off >= all * 0.7;
  };
  for (let y = Math.round(y0); y < y1 - 2; y++) if (wide(y) && wide(y + 1) && wide(y + 2)) return y;
  return null;
}

/**
 * Lado esquerdo da caixa de P/R (escala da imagem) na linha `y`: o primeiro trecho de
 * quatro pixels seguidos que fogem do papel, de `x0` para a direita (mediana de três
 * linhas). Medido bem abaixo do topo, onde as letras quase nunca chegam. `null` sem
 * caixa ali.
 */
export function ptBoxLeft(img: ImageData, y: number, x0: number, x1: number, paperY: number): number | null {
  const at = (x: number, yy: number) => luminance(img.data, (Math.round(yy) * img.width + Math.round(x)) * 4);
  const ref: number[] = [];
  for (let yy = paperY - 10; yy < paperY; yy++) for (let x = x0 - 95; x < x0 - 5; x += 2) ref.push(at(x, yy));
  const paper = median(Float32Array.from(ref));
  const found: number[] = [];
  for (const dy of [-1, 0, 1]) {
    let run = 0;
    for (let x = Math.round(x0); x < x1; x++) {
      run = Math.abs(at(x, y + dy) - paper) > 40 ? run + 1 : 0;
      if (run === 4) {
        found.push(x - 3);
        break;
      }
    }
  }
  if (found.length < 2) return null;
  found.sort((a, b) => a - b);
  return found[found.length >> 1];
}

/**
 * Topo da barra de tipo (escala-base): a primeira linha, de 570 para baixo, em que
 * quase toda a largura muda de tom de repente (o fio de cima da barra). Na moldura
 * padrão fica em ~589; em algumas artes estendidas (VOW) a caixa é curta e a barra
 * desce para ~633. `null` quando não há o par de fios (arte atravessando).
 */
export function typeBarTop(img: ImageData): number | null {
  return typeBarEdges(img)?.top ?? null;
}

/**
 * Os dois fios da barra de tipo (escala-base): `top` como em `typeBarTop` e `bottom`,
 * o fio de baixo (~639 na moldura padrão; ~649 em algumas molduras escuras de BRO, em
 * que as letras descem mais e o pé do "y" ficava fora do apagamento).
 */
export function typeBarEdges(img: ImageData): { top: number; bottom: number } | null {
  const fx = img.width / 745;
  const fy = img.height / 1040;
  const x0 = Math.round(80 * fx);
  const x1 = Math.round(660 * fx);
  const d = Math.max(2, Math.round(3 * fy));
  const edge: boolean[] = [];
  for (let b = 570; b < 780; b++) {
    const y = Math.round(b * fy);
    let off = 0;
    for (let x = x0; x < x1; x++)
      if (Math.abs(luminance(img.data, (y * img.width + x) * 4) - luminance(img.data, ((y - d) * img.width + x) * 4)) > 20) off++;
    edge.push(off >= (x1 - x0) * 0.8);
  }
  // o fio de cima só vale com o de baixo (pé da barra e topo da caixa) 45 a 70 abaixo:
  // sem isso, um fio de cima perdido na arte fazia o pé da barra passar por topo
  for (let i = 0; i + 70 < edge.length; i++) {
    if (!edge[i]) continue;
    const j = edge.slice(i + 45, i + 71).indexOf(true);
    if (j >= 0) return { top: 570 + i, bottom: 570 + i + 45 + j };
  }
  return null;
}

/**
 * Centro vertical das letras numa faixa (escala da imagem), pelas linhas onde mais
 * pixels fogem da mediana da própria linha (o miolo das minúsculas). `null` quando
 * não há texto claro ali ou a faixa achada não tem altura de letra.
 */
export function textBandCenter(img: ImageData, rect: Rect): number | null {
  const x0 = Math.round(rect.x0);
  const x1 = Math.round(rect.x1);
  const y0 = Math.round(rect.y0);
  const y1 = Math.round(rect.y1);
  const w = x1 - x0;
  if (w <= 0 || y1 <= y0) return null;
  const counts: number[] = [];
  const row = new Float32Array(w);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) row[x] = luminance(img.data, (y * img.width + x0 + x) * 4);
    const sorted = row.slice().sort();
    const med = sorted[w >> 1];
    let n = 0;
    for (let x = 0; x < w; x++) if (Math.abs(row[x] - med) > 60) n++;
    counts.push(n / w);
  }
  const max = Math.max(...counts);
  if (max < 0.05) return null;
  let a = -1;
  let b = -1;
  counts.forEach((c, i) => {
    if (c > max / 2) {
      if (a < 0) a = i;
      b = i;
    }
  });
  const k = img.height / 1040;
  const h = (b - a) / k;
  if (h < 10 || h > 26) return null;
  return y0 + (a + b) / 2;
}

/**
 * Borda esquerda, linha a linha, do símbolo colorido da coleção, ou `null` nas linhas em
 * que ele não aparece. Para o símbolo que avança na diagonal sobre o fim do tipo (a adaga
 * de MKM): coluna nenhuma separa o fim do "Detective" da ponta da adaga, e
 * `findSetSymbolLeft` para antes das últimas letras; linha a linha, a adaga começa depois
 * delas. `colored` e `lim` vêm de `findSetSymbolLeft` (onde a cor do símbolo começa e o
 * limiar dela). O símbolo é o que se liga à cor a partir dali, mais o contorno escuro colado
 * nela (até 3 px); letra encostada no contorno não entra.
 */
export function symbolRowsLeft(img: ImageData, y0: number, y1: number, colored: number, lim: number, to: number): (number | null)[] {
  const k = img.width / 745;
  const x0 = Math.max(0, Math.round(colored - 80 * k));
  const x1 = Math.min(img.width, Math.round(to));
  const w = x1 - x0;
  const h = y1 - y0;
  const out: (number | null)[] = new Array(Math.max(0, h)).fill(null);
  if (w <= 0 || h <= 0) return out;
  const lumAt = (x: number, y: number) => luminance(img.data, (y * img.width + x) * 4);
  const chromaAt = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    const d = img.data;
    return Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
  };
  const lums: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x += 2) lums.push(lumAt(x, y));
  const mid = median(Float32Array.from(lums));
  const hue = new Uint8Array(w * h);
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      hue[y * w + x] = chromaAt(x0 + x, y0 + y) > lim ? 1 : 0;
      dark[y * w + x] = Math.abs(lumAt(x0 + x, y0 + y) - mid) > 45 ? 1 : 0;
    }
  // linha colorida de ponta a ponta é fundo (a arte atrás da barra), não o símbolo
  const backdrop = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += hue[y * w + x];
    backdrop[y] = n >= w * 0.5 ? 1 : 0;
  }
  const near = new Uint8Array(w * h);
  const r3 = Math.max(2, Math.round(3 * k));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (hue[y * w + x])
        for (let dy = -r3; dy <= r3; dy++)
          for (let dx = -r3; dx <= r3; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1;
          }
  const seen = new Uint8Array(w * h);
  const queue: number[] = [];
  // a semente fica longe do fim da busca, onde a ponta avermelhada da barra também é colorida
  const start = Math.max(0, Math.round(colored) - x0);
  const end = Math.max(start, w - Math.round(12 * k));
  for (let y = 0; y < h; y++) {
    if (backdrop[y]) continue;
    for (let x = start; x < end; x++)
      if (hue[y * w + x]) {
        seen[y * w + x] = 1;
        queue.push(y * w + x);
      }
  }
  while (queue.length) {
    const q = queue.pop()!;
    const x = q % w;
    const y = (q - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || backdrop[ny]) continue;
        const r = ny * w + nx;
        if (seen[r] || !(hue[r] || (dark[r] && near[r]))) continue;
        seen[r] = 1;
        queue.push(r);
      }
  }
  const raw: (number | null)[] = out.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (seen[y * w + x]) {
        raw[y] = x0 + x;
        break;
      }
  // a borda de um símbolo muda devagar de uma linha para outra: linha que salta para
  // longe das duas vizinhas é outra coisa (um pedaço da arte no alto da barra)
  const step = Math.max(3, Math.round(4 * k));
  for (let y = 0; y < h; y++) {
    const v = raw[y];
    if (v === null) continue;
    const a = y > 0 ? raw[y - 1] : null;
    const b = y < h - 1 ? raw[y + 1] : null;
    if ((a !== null && Math.abs(a - v) <= step) || (b !== null && Math.abs(b - v) <= step)) out[y] = v;
  }
  return out;
}

/**
 * Acha onde começa o símbolo da coleção na linha de tipo (o bloco escuro mais
 * à direita depois de x = 560). Devolve x na escala da imagem.
 */
export function findSetSymbolLeft(
  img: ImageData,
  y0: number,
  y1: number,
  xMax?: number,
  maxWidth = 100,
  info?: { colored: number; lim: number },
): number {
  const x0 = Math.round(img.width * 0.75);
  // nas fichas a barra de tipo termina antes (ponta arredondada): quem chama passa o fim dela
  const x1 = Math.round(xMax ?? img.width * 0.955);
  const cols: number[] = [];
  // referência = mediana da faixa (o fundo da barra é a maioria). A média puxava para
  // baixo com o símbolo e a borda escura, e a barra inteira passava por "tinta".
  const hist = new Uint32Array(256);
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      hist[Math.min(255, Math.round(luminance(img.data, (y * img.width + x) * 4)))]++;
      count++;
    }
  }
  let mean = 0;
  for (let acc = 0; mean < 255; mean++) if ((acc += hist[mean]) >= count / 2) break;
  // Um selo largo e cheio toma mais da metade da busca (o dourado "M19" das promoções do
  // Core Set 2019 tem 90 px): a mediana caía nele, a barra inteira virava "tinta" e o
  // começo do selo era apagado. Aí a referência é a barra à esquerda da busca, onde o
  // fundo é a maioria mesmo com o fim de uma linha de tipo comprida.
  const bar: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = Math.round(img.width * 0.55); x < x0; x += 2) bar.push(luminance(img.data, (y * img.width + x) * 4));
  const barRef = bar.length ? median(Float32Array.from(bar)) : mean;
  if (Math.abs(barRef - mean) > 45) mean = barRef;
  // Referência por linha, de reserva: em algumas barras escuras o brilho do contorno de
  // cima e de baixo foge da mediana geral em todas as colunas, e a faixa virava um
  // bloco só (sem lacuna para separar o fim do texto do símbolo).
  const rowRef: number[] = [];
  for (let y = y0; y < y1; y++) {
    const h = new Uint32Array(256);
    for (let x = x0; x < x1; x++) h[Math.min(255, Math.round(luminance(img.data, (y * img.width + x) * 4)))]++;
    let m = 0;
    for (let acc = 0; m < 255; m++) if ((acc += h[m]) >= (x1 - x0) / 2) break;
    rowRef.push(m);
  }
  const scan = (perRow: boolean) => {
    cols.length = 0;
    for (let x = x0; x < x1; x++) {
      let dark = 0;
      for (let y = y0; y < y1; y++) {
        const l = luminance(img.data, (y * img.width + x) * 4);
        if (Math.abs(l - mean) > 45 && (!perRow || Math.abs(l - rowRef[y - y0]) > 45)) dark++;
      }
      if (dark > 2) cols.push(x);
    }
  };
  scan(false);
  // faixa inteira "tinta", sem nenhuma lacuna: é o contorno da barra; refaz por linha
  if (cols.length >= (x1 - x0) * 0.98) scan(true);
  if (!cols.length) return Math.round(img.width * 0.85);
  // o bloco mais à direita, separado por lacunas (medidas na escala de 745 px)
  const k = img.width / 745;
  let last = cols.length - 1;
  // Um fio fino colado no fim da busca é a borda da barra (a ponta arredondada nas
  // fichas, o contorno nas cartas), não o símbolo: pula para o bloco anterior.
  // A faixa pega também os fios de cima e de baixo, e a curva do fim da barra vira
  // um bloco de até ~22 px; às vezes em duas camadas (contorno e brilho).
  const kk = img.width / 745;
  // (a segunda camada é medida a partir do começo da primeira, não do fim da busca)
  // Algumas barras têm três camadas (Soul Parry das Duel Decks, em The List): a terceira
  // só conta se for um fio bem fino, para um símbolo estreito perto do fim não sumir.
  // (distâncias arredondadas: há digitalizações de 744 px, em que 12 px viravam 11,98 e o
  // fio do Brushland de M3C, a exatos 12 px do fim da busca, passava por símbolo)
  // Nas fichas quem chama já tira a curva da ponta (`xMax`): só sobra, no máximo, um fio
  // fino. Um bloco largo colado no fim é o símbolo: o "M" da Marvel, um quadro de 24 px
  // a 3 px do fim da busca nas fichas de MSH, passava por fio, e o "Villain" inteiro, por
  // símbolo (Doombot).
  const edgeWidth = (pass: number) => (xMax !== undefined || pass >= 2 ? 12 : 24);
  let edgeFrom = x1;
  for (let pass = 0; pass < 3; pass++) {
    let i = last;
    // o fio é contínuo: qualquer lacuna o separa do símbolo
    while (i > 0 && cols[i] - cols[i - 1] <= Math.max(1, Math.round(3 * kk))) i--;
    if (i > 0 && cols[last] - cols[i] < Math.round(edgeWidth(pass) * kk) && cols[last] >= edgeFrom - Math.round(12 * kk)) {
      edgeFrom = cols[i];
      last = i - 1;
    } else break;
  }
  const end = cols[last];
  // Coluna "fraca": algo mais claro que tinta, mas fora do fundo (os braços finos do
  // "E" dourado do símbolo da 30th Edition). Uma lacuna toda feita de colunas fracas
  // não separa blocos: senão a primeira letra do símbolo ficava de fora e era apagada.
  const faint = (x: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) if (Math.abs(luminance(img.data, (y * img.width + x) * 4) - mean) > 22) n++;
    return n >= 4;
  };
  // (até duas colunas de barra pura no meio: entre o fim dos braços do "E" e o "D" do
  // símbolo da 30th Edition há uma, e o traço do "E" era apagado, Icy Manipulator 30A)
  const bridged = (a: number, b: number) => {
    let clean = 0;
    for (let x = a + 1; x < b; x++) if (!faint(x) && ++clean > Math.max(2, Math.round(2 * k))) return false;
    return true;
  };
  let start = end;
  for (let i = last; i > 0; i--) {
    const gap = cols[i] - cols[i - 1];
    if (gap > Math.max(3, 8 * k) && !(gap <= 16 * k && bridged(cols[i - 1], cols[i]))) break;
    start = cols[i - 1];
  }
  // Bloco solto, com 20 px vazios antes dele (mais que o espaço entre duas palavras): não
  // tem texto grudado, é o símbolo. Só passa da largura porque a ponta da barra encosta
  // nele (o selo largo do Core Set 2020), e o corte pela largura comia o começo do selo.
  const si = cols.indexOf(start);
  const isolated = (si > 0 ? start - cols[si - 1] : start - x0) >= 20 * k && end - start <= (maxWidth + 30) * k;
  // Um símbolo de coleção não passa de ~100 px (o selo do Core Set 2021 tem ~95, o do
  // Warhammer 40.000 tem 77). Se o bloco é mais largo, ele grudou no fim da linha de
  // tipo em inglês (ex.: "Survivor"): corta na maior lacuna perto da direita, para o
  // texto ser apagado e o símbolo preservado.
  if (end - start > maxWidth * k && !isolated) {
    let best = -1;
    for (let i = last; i > 0 && cols[i] >= end - (maxWidth + 15) * k; i--) best = Math.max(best, cols[i] - cols[i - 1]);
    // entre lacunas quase do mesmo tamanho, a mais à esquerda: símbolos de duas
    // partes (o "M" e o quadrinho da Marvel) têm uma lacuna por dentro, e cortar
    // nela deixava metade do símbolo para o apagamento
    let cut = start;
    if (best > 1)
      for (let i = last; i > 0 && cols[i] >= end - (maxWidth + 15) * k; i--)
        if (cols[i] - cols[i - 1] > 1 && cols[i] - cols[i - 1] >= best - Math.max(1, Math.round(k))) cut = cols[i];
    // Símbolo colorido (incomum, rara, mítica) colado no texto preto: a cor diz onde
    // ele começa, melhor que as lacunas (o "Hero" do Hulk fica a 2 px do símbolo).
    const from = Math.round(end - (maxWidth + 15) * k);
    const chromaAt = (x: number, y: number) => {
      const i = (y * img.width + x) * 4;
      const d = img.data;
      return Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    };
    // cor de fundo da barra (as barras douradas já são coloridas: aí não serve), medida
    // à esquerda da busca, onde só há barra e texto preto ou branco: dentro dela, um
    // símbolo grande e colorido (o selo laranja do Core Set 2021) era a maioria e
    // passava por "fundo"
    // (só os pixels de fundo: as letras pretas ali puxavam a mediana para baixo, e o
    // brilho dourado da barra entre o texto e o símbolo passava por "cor do símbolo")
    const ch: number[] = [];
    const sample = (a: number, b: number) => {
      for (let y = y0; y < y1; y += 2)
        for (let x = a; x <= b; x += 3) if (Math.abs(luminance(img.data, (y * img.width + x) * 4) - mean) <= 45) ch.push(chromaAt(x, y));
    };
    if (from - x0 >= 20 * k) sample(x0, from);
    if (ch.length < 20) sample(Math.max(x0, from), end);
    ch.sort((p, q) => p - q);
    const lim = Math.max(40, (ch[ch.length >> 1] ?? 0) + 30);
    // três colunas coloridas seguidas (a franja colorida da compressão na borda de uma
    // letra branca dá uma coluna só)
    // Linha colorida de ponta a ponta, desde o começo da busca, é fundo: a arte que
    // aparece no alto da barra translúcida de algumas molduras especiais (Orthion, MOM)
    // dava cor a toda coluna, e o "símbolo" começava no meio do tipo em inglês
    const lead = Math.round(x0 + 25 * k);
    const backdrop = (y: number) => {
      let all = 0;
      let first = 0;
      for (let x = x0; x < x1; x++)
        if (chromaAt(x, y) > lim) {
          all++;
          if (x < lead) first++;
        }
      return all >= (x1 - x0) * 0.5 && first >= (lead - x0) * 0.5;
    };
    // A cor só conta na altura das letras (de 40% a 80% da faixa): a arte que aparece no
    // alto de uma barra translúcida só em parte dela (o céu azul atrás do "Warrior" do
    // Mog, FIC) não chega lá, e o "símbolo" começava no meio do tipo em inglês. O
    // símbolo, centrado na barra, sempre passa por essas linhas.
    const rowsUsed: number[] = [];
    const midTop = y0 + (y1 - y0) * 0.4;
    const midBottom = y1 - (y1 - y0) * 0.2;
    for (let y = y0; y < y1; y++) if (y >= midTop && y <= midBottom && !backdrop(y)) rowsUsed.push(y);
    let colored = -1;
    let run = 0;
    for (let x = Math.max(x0, from); x <= end && colored < 0; x++) {
      let n = 0;
      for (const y of rowsUsed) if (chromaAt(x, y) > lim) n++;
      run = n >= Math.max(2, rowsUsed.length * 0.15) ? run + 1 : 0;
      if (run >= 3) colored = x - 2;
    }
    if (colored >= 0) {
      // volta até a lacuna logo antes da cor (o contorno preto do símbolo fica junto)
      let c = -1;
      let real = -1;
      for (let i = 1; i <= last; i++) {
        if (cols[i] > colored) break;
        const g = cols[i] - cols[i - 1];
        if (g > 1) c = cols[i];
        if (g >= Math.max(4, Math.round(4 * k))) real = cols[i];
      }
      if (c > 0 && colored - c <= 8 * k) cut = c;
      // o corte pelas lacunas caiu entre as letras ("Werewolf" com a lacuna do "lf"
      // quase igual à do símbolo): a última lacuna de verdade antes da cor é o começo dele
      else if (real > cut) cut = real;
      // sem lacuna de verdade (símbolo encostado na ponta do texto, só as folgas entre
      // as letras): começa no contorno dele. Com lacuna clara, ela vale (a estrela da
      // Secret Lair tem raios: a cor começa bem depois do contorno)
      // (e quando o corte pelas lacunas caiu dentro do símbolo, à direita da cor)
      else if (colored < cut || best <= Math.max(2, Math.round(3 * k))) cut = Math.max(start, colored - Math.round(3 * k));
    }
    // (a cor vale mesmo sem lacuna: com o fio do fim da barra grudado no símbolo, o
    // bloco passava do limite e o corte pela largura comia o começo do selo)
    start = best > 1 || colored >= 0 ? cut : Math.round(end - maxWidth * k);
    if (info) {
      info.colored = colored;
      info.lim = lim;
    }
  }
  return start;
}

/** Faixas cinza de uma tabela de d20, já clareadas até o papel (ver `liftShadedBands`). */
export interface ShadedBands {
  /** começo e fim (exclusivo) de cada faixa, em pixels da imagem */
  bands: { y0: number; y1: number }[];
  x0: number;
  x1: number;
  /** cor média da faixa, para pintá-la de novo atrás do português */
  color: [number, number, number];
}

/**
 * Nas cartas com tabela de d20 (AFR, AFC, CLB) as linhas da tabela se alternam sobre faixas
 * cinza, a primeira com faixa. O português não cai nas mesmas alturas: a faixa ficava pela
 * metade sob o texto novo, ou sumia junto com as letras (Cone of Cold, CLB). Acha as faixas
 * pelo fundo de cada linha (o quartil claro, que as letras não alcançam) bem mais escuro
 * que o papel e clareia cada pixel delas até o papel, com a borda suavizada junto. Quem
 * chama usa isso numa cópia, para medir a caixa de P/R sem a faixa que passa atrás dela, e
 * apaga as faixas inteiras (`force` em `eraseRegions`: o preenchimento com o grão do papel
 * em volta). Devolve a medida e a cor para pintar as faixas de novo atrás das linhas da
 * tabela em português, ou `null` sem faixas.
 */
export function liftShadedBands(img: ImageData, box: Rect): ShadedBands | null {
  const bx0 = Math.round(box.x0);
  const bx1 = Math.round(box.x1);
  const y0 = Math.round(box.y0);
  const y1 = Math.round(box.y1);
  const x0 = bx0 + 4;
  const x1 = bx1 - 4;
  if (x1 - x0 < 60 || y1 - y0 < 30) return null;
  const k = img.height / 1040;
  const h = y1 - y0;
  const quart = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length * 0.75)];
  const bg = new Float32Array(h);
  for (let y = y0; y < y1; y++) {
    const v: number[] = [];
    for (let x = x0; x < x1; x += 2) v.push(luminance(img.data, (y * img.width + x) * 4));
    bg[y - y0] = quart(v);
  }
  const paper = Float32Array.from(bg).sort()[Math.floor(h * 0.9)];
  const dark = (y: number) => bg[y - y0] < paper - 15;
  const bands: { y0: number; y1: number }[] = [];
  for (let y = y0; y < y1;) {
    if (!dark(y)) {
      y++;
      continue;
    }
    let e = y;
    // (até 2 linhas claras no meio não separam: o fio de luz de algumas digitalizações)
    while (e < y1 && (dark(e) || (e + 2 < y1 && dark(e + 1)) || (e + 3 < y1 && dark(e + 2)))) e++;
    if (e - y >= Math.round(12 * k)) bands.push({ y0: y, y1: e });
    y = e;
  }
  if (!bands.length) return null;
  const core = (b: { y0: number; y1: number }) => ({ y0: b.y0 + 2, y1: b.y1 - 2 });
  const rows: number[] = [];
  for (const b of bands) for (let y = core(b).y0; y < core(b).y1; y++) rows.push(y);
  const bandL = Float32Array.from(rows.map((y) => bg[y - y0])).sort()[rows.length >> 1];
  if (paper - bandL < 15) return null;
  // fundo de cada coluna nas linhas das faixas: dá onde a faixa começa e acaba
  const colBg = new Float32Array(bx1 - bx0);
  for (let x = bx0; x < bx1; x++) {
    const v: number[] = [];
    for (let j = 0; j < rows.length; j += 2) v.push(luminance(img.data, (rows[j] * img.width + x) * 4));
    colBg[x - bx0] = quart(v);
  }
  // (a meio caminho entre o papel e a faixa: num papel com brilho de um lado, a medida
  // pelo papel acabava antes da ponta da faixa, Component Pouch AFC)
  const half = (paper + bandL) / 2;
  const mid = Math.round((bx0 + bx1) / 2);
  let left = mid;
  while (left > bx0 && colBg[left - 1 - bx0] < half) left--;
  let right = mid;
  while (right < bx1 && colBg[right - bx0] < half) right++;
  // cores: a faixa e o papel sem letras
  const pick = (ys: number[], ref: number) => {
    const c: number[][] = [[], [], []];
    for (const y of ys)
      for (let x = x0; x < x1; x += 3) {
        const i = (y * img.width + x) * 4;
        if (Math.abs(luminance(img.data, i) - ref) <= 8) for (let q = 0; q < 3; q++) c[q].push(img.data[i + q]);
      }
    return c.map((v) => (v.length ? v.sort((a, b) => a - b)[v.length >> 1] : ref)) as [number, number, number];
  };
  const inBand = new Uint8Array(h);
  for (const b of bands) for (let y = Math.max(y0, b.y0 - 3); y < Math.min(y1, b.y1 + 3); y++) inBand[y - y0] = 1;
  const paperRows: number[] = [];
  for (let y = y0; y < y1; y += 2) if (!inBand[y - y0] && Math.abs(bg[y - y0] - paper) <= 6) paperRows.push(y);
  const band = pick(rows, bandL);
  const paperRgb = pick(paperRows.length ? paperRows : [y0], paper);
  const span = paper - bandL;
  const w = (v: number) => Math.max(0, Math.min(1, (paper - v) / span));
  for (const b of bands)
    for (let y = Math.max(y0, b.y0 - 3); y < Math.min(y1, b.y1 + 3); y++) {
      const wy = w(bg[y - y0]);
      if (!wy) continue;
      for (let x = Math.max(bx0, left - 3); x < Math.min(bx1, right + 3); x++) {
        const f = wy * w(colBg[x - bx0]);
        if (!f) continue;
        const i = (y * img.width + x) * 4;
        for (let q = 0; q < 3; q++) img.data[i + q] = Math.max(0, Math.min(255, img.data[i + q] + (paperRgb[q] - band[q]) * f));
      }
    }
  return { bands, x0: left, x1: right, color: band };
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
  regions: {
    rect: Rect;
    threshold: number;
    colorThreshold?: number;
    polarity?: "dark" | "light";
    stains?: boolean;
    fill?: "pyramid" | "rows";
    /** limiar por ladrilho nas caixas de letra escura (ver `textMask`) */
    tiles?: boolean;
  }[],
  protect: Rect[],
): RegionMask[] {
  return regions.map(({ rect, threshold, colorThreshold, polarity: forced, stains, fill, tiles }) => {
    const r = {
      x0: clamp(Math.round(rect.x0), 0, img.width),
      y0: clamp(Math.round(rect.y0), 0, img.height),
      x1: clamp(Math.round(rect.x1), 0, img.width),
      y1: clamp(Math.round(rect.y1), 0, img.height),
    };
    if (r.x1 <= r.x0 || r.y1 <= r.y0) return { rect: r, mask: new Uint8Array(0), polarity: "dark" };
    const polarity = forced ?? textPolarity(img, r);
    let mask = textMask(img, r, threshold, protect, colorThreshold ?? 0, polarity, fill === "rows", tiles ?? true);
    if (stains) {
      mask = growStains(img, r, mask);
      // a proteção vale também para o que a mancha alcançou
      for (const p of protect)
        for (let y = Math.max(Math.round(p.y0), r.y0); y < Math.min(Math.round(p.y1), r.y1); y++)
          for (let x = Math.max(Math.round(p.x0), r.x0); x < Math.min(Math.round(p.x1), r.x1); x++)
            mask[(y - r.y0) * (r.x1 - r.x0) + x - r.x0] = 0;
    }
    return { rect: r, mask, polarity };
  });
}

/**
 * Apaga o texto de várias regiões de uma vez. Devolve, para cada região, se o
 * texto era escuro ou claro (para escrever o português na mesma cor).
 */
export function eraseRegions(
  img: ImageData,
  regions: {
    rect: Rect;
    threshold: number;
    colorThreshold?: number;
    polarity?: "dark" | "light";
    fill?: "pyramid" | "rows";
    stains?: boolean;
    /**
     * Da linha `attachedBelow` (escala da imagem) para baixo, só o que se liga às letras
     * de cima entra na máscara (ver `keepAttachedBelow`). A caixa das cartas é medida no
     * terço da esquerda e pode passar da medida fixa; onde o pé dela é mais alto (o fio
     * à direita do selo no Zahur, Passado da Glória, PDFT), o fio e o bisel entravam na
     * máscara e saíam pintados da cor do papel, um retângulo claro.
     */
    attachedBelow?: number;
    /** o fio fino entre as regras e o flavor entra inteiro na máscara (ver `dividerRows`) */
    dividers?: boolean;
    /** retângulos que entram inteiros na máscara (as faixas cinza da tabela de d20) */
    force?: Rect[];
  }[],
  protect: Rect[],
  /** áreas protegidas que também não servem de fonte para o preenchimento */
  opaque: Rect[] = [],
): ("dark" | "light")[] {
  // uma região de cada vez: a máscara da seguinte é medida já sem o texto da anterior
  return regions.map((region) => {
    const [m] = maskRegions(img, [region], [...protect, ...opaque]);
    if (!m.mask.length) return m.polarity;
    // (a ligação é medida acima da folga da máscara: dilatada, a do fio subia além da linha)
    if (region.attachedBelow !== undefined) keepAttachedBelow(m, region.attachedBelow, Math.round((8 * img.height) / 1040));
    if (region.dividers) {
      const w = m.rect.x1 - m.rect.x0;
      const guard = [...protect, ...opaque];
      for (const y of dividerRows(img, m.rect))
        for (let yy = Math.max(m.rect.y0, y - 1); yy <= Math.min(m.rect.y1 - 1, y + 1); yy++)
          for (let x = m.rect.x0; x < m.rect.x1; x++)
            if (!guard.some((g) => x >= g.x0 && x < g.x1 && yy >= g.y0 && yy < g.y1)) m.mask[(yy - m.rect.y0) * w + x - m.rect.x0] = 1;
    }
    if (region.force) {
      const w = m.rect.x1 - m.rect.x0;
      const guard = [...protect, ...opaque];
      for (const r of region.force)
        for (let y = Math.max(m.rect.y0, Math.round(r.y0)); y < Math.min(m.rect.y1, Math.round(r.y1)); y++)
          for (let x = Math.max(m.rect.x0, Math.round(r.x0)); x < Math.min(m.rect.x1, Math.round(r.x1)); x++)
            if (!guard.some((g) => x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y1)) m.mask[(y - m.rect.y0) * w + x - m.rect.x0] = 1;
    }
    let ignore: Uint8Array | undefined;
    if (opaque.length) {
      const w = m.rect.x1 - m.rect.x0;
      ignore = new Uint8Array(m.mask.length);
      for (const o of opaque)
        for (let y = Math.max(Math.round(o.y0), m.rect.y0); y < Math.min(Math.round(o.y1), m.rect.y1); y++)
          for (let x = Math.max(Math.round(o.x0), m.rect.x0); x < Math.min(Math.round(o.x1), m.rect.x1); x++)
            ignore[(y - m.rect.y0) * w + x - m.rect.x0] = 1;
    }
    inpaint(img, m.rect, m.mask, region.fill, ignore);
    return m.polarity;
  });
}

/**
 * Linhas (escala da imagem) do fio fino que separa as regras do flavor: quase toda a
 * largura de `rect` foge, para o mesmo lado, das linhas 3 px acima e 3 px abaixo. A
 * máscara pega o lado escuro do fio, mas nas fichas ele vem com um filete claro embaixo
 * e as pontas esmaecem: a ponta do filete sobrava como um risco claro (Marit Lage, SLD
 * 1681). Letra nenhuma cobre a largura toda, e uma faixa grossa (mais de 4 linhas) é
 * desenho, não fio.
 */
export function dividerRows(img: ImageData, rect: Rect): number[] {
  const x0 = Math.round(rect.x0);
  const x1 = Math.round(rect.x1);
  const d = Math.max(2, Math.round((3 * img.height) / 1040));
  const at = (x: number, y: number) => luminance(img.data, (y * img.width + x) * 4);
  const rows: number[] = [];
  for (let y = Math.round(rect.y0) + d + 1; y < Math.round(rect.y1) - d - 1; y++) {
    let hit = 0;
    let all = 0;
    for (let x = x0; x < x1; x += 2, all++) {
      const v = at(x, y);
      const up = v - at(x, y - d);
      const down = v - at(x, y + d);
      if (Math.abs(up) > 15 && Math.abs(down) > 15 && Math.sign(up) === Math.sign(down)) hit++;
    }
    if (all && hit >= all * 0.6) rows.push(y);
  }
  // só os fios finos: trechos de até 4 linhas seguidas
  const out: number[] = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] - rows[j] <= 2) j++;
    if (rows[j] - rows[i] < 4) out.push(...rows.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

/**
 * Apaga o lembrete de P/R do verso ("3/5") nas cartas de transformar cujo canto da caixa
 * avança para dentro da moldura. Em SOI a caixa tem uma ponta em "<" à direita, onde o
 * lembrete fica, e o fim do "5" passa do lado da caixa medido no resto da altura: sobrava
 * uma lasca dele ao lado do português (Eremita do Monte Rezinga). Em cada linha de
 * `notch` (escala da imagem) o papel vai até a moldura: o primeiro trecho de oito pixels
 * seguidos fora do tom do papel, a partir de `from` (o lado medido da caixa). A moldura
 * fica opaca, sem apagar nem servir de fonte. Muda a imagem no lugar.
 */
export function eraseBackPtNotch(img: ImageData, notch: Rect, from: number): void {
  const x0 = clamp(Math.round(notch.x0), 0, img.width);
  const x1 = clamp(Math.round(notch.x1), 0, img.width);
  const y0 = clamp(Math.round(notch.y0), 0, img.height);
  const y1 = clamp(Math.round(notch.y1), 0, img.height);
  const start = clamp(Math.round(from), x0 + 1, x1);
  if (x1 - x0 < 10 || y1 <= y0) return;
  const run = Math.max(6, Math.round((8 * img.width) / 745));
  const frame: Rect[] = [];
  for (let y = y0; y < y1; y++) {
    const row = new Float32Array(start - x0);
    for (let x = x0; x < start; x++) row[x - x0] = luminance(img.data, (y * img.width + x) * 4);
    const paper = median(row);
    let edge = x1;
    let count = 0;
    for (let x = start; x < x1; x++) {
      count = Math.abs(luminance(img.data, (y * img.width + x) * 4) - paper) > 12 ? count + 1 : 0;
      if (count === run) {
        edge = x - run + 1;
        break;
      }
    }
    frame.push({ x0: edge, y0: y, x1: img.width, y1: y + 1 });
  }
  eraseRegions(img, [{ rect: { x0, y0, x1, y1 }, threshold: 14, colorThreshold: 34 }], [], frame);
}

/**
 * Tira da máscara, a partir da linha `y` (na escala da imagem), o que não se liga ao que
 * está acima dela: o pé de uma letra (a vírgula que desce até o fio da caixa) continua
 * a letra; um pedaço da moldura que só aparece ali embaixo (o canto arredondado da
 * caixa) não. Com `margin`, a ligação é medida `margin` linhas mais acima: a máscara já
 * vem dilatada, e a folga em volta de um fio logo abaixo de `y` sobe até passar dela.
 * Muda a máscara no lugar.
 */
export function keepAttachedBelow(m: RegionMask, y: number, margin = 0): void {
  const { rect, mask } = m;
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const from = Math.max(0, Math.min(h, Math.round(y) - rect.y0));
  if (!mask.length || from <= 0 || from >= h) return;
  const seed = Math.max(0, from - 1 - Math.round(margin));
  const keep = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let k = seed * w; k < (seed + 1) * w; k++)
    if (mask[k]) {
      keep[k] = 1;
      queue.push(k);
    }
  while (queue.length) {
    const k = queue.pop()!;
    const x = k % w;
    const yy = (k - x) / w;
    for (let dy = 0; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = yy + dy;
        if (nx < 0 || nx >= w || ny < seed || ny >= h) continue;
        const q = ny * w + nx;
        if (keep[q] || !mask[q]) continue;
        keep[q] = 1;
        queue.push(q);
      }
  }
  // (a folga de um pedaço solto também sai: pintada de papel, ela puxava a cor do fio)
  for (let k = (seed + 1) * w; k < w * h; k++) if (!keep[k]) mask[k] = 0;
}

/**
 * Junta máscaras de regiões numa máscara da imagem inteira, dilatada em `grow` pixels
 * dentro das regiões. Com `gap`, os vãos de até `gap` pixels entre dois trechos da
 * máscara (na mesma coluna ou na mesma linha) entram nela: um fio de um ou dois pixels
 * da imagem original entre dois pedaços repintados destoa do preenchimento em volta.
 * Na divisa entre duas faixas do planeswalker (Niko Aris, KHM), a arte escura apagada
 * dos dois lados deixava a linha do meio como um tracejado.
 */
export function combineMasks(img: ImageData, masks: RegionMask[], grow = 0, gap = 0): Uint8Array {
  const W = img.width;
  const out = new Uint8Array(W * img.height);
  for (const { rect, mask } of masks) {
    const w = rect.x1 - rect.x0;
    for (let y = rect.y0; y < rect.y1; y++)
      for (let x = rect.x0; x < rect.x1; x++) if (mask[(y - rect.y0) * w + x - rect.x0]) out[y * W + x] = 1;
  }
  if (grow <= 0 && gap <= 0) return out;
  // dilata sem sair das regiões: o que está fora (ex.: os dois-pontos depois do escudo) fica intacto
  const grown = grow > 0 ? morph(out, W, img.height, grow, true) : out;
  const inside = new Uint8Array(out.length);
  for (const { rect } of masks) for (let y = rect.y0; y < rect.y1; y++) inside.fill(1, y * W + rect.x0, y * W + rect.x1);
  for (let i = 0; i < grown.length; i++) grown[i] &= inside[i];
  if (gap > 0) {
    // os vãos são medidos na máscara dilatada; o que entra fica dentro das regiões
    const fill: number[] = [];
    const scan = (start: number, step: number, count: number) => {
      let last = -1;
      for (let j = 0; j < count; j++) {
        const i = start + j * step;
        if (!grown[i]) continue;
        if (last >= 0 && j - last > 1 && j - last - 1 <= gap)
          for (let t = last + 1; t < j; t++) if (inside[start + t * step]) fill.push(start + t * step);
        last = j;
      }
    };
    for (let x = 0; x < W; x++) scan(x, W, img.height);
    for (let y = 0; y < img.height; y++) scan(y * W, 1, W);
    for (const i of fill) grown[i] = 1;
  }
  return grown;
}

/**
 * Tira as pintas que o preenchimento inventa no meio do buraco: um pingo escuro (ou
 * claro, com `polarity` "light") pequeno, bem mais escuro que o papel em volta e
 * cercado de buraco por todos os lados. Encostado na borda do buraco ele pode ser a
 * continuação da arte de fora, e fica; grande, é desenho, e fica. O LaMa deixava um
 * pingo acima do "Quando" do Niko Aris (KHM), onde a carta tinha papel liso. Muda a
 * imagem no lugar e devolve quantas pintas tirou.
 */
export function dropSpecks(img: ImageData, area: Rect, hole: Uint8Array, polarity: "dark" | "light" = "dark"): number {
  const unit = img.width / 745;
  const w = area.x1 - area.x0;
  const h = area.y1 - area.y0;
  const n = w * h;
  const inHole = new Uint8Array(n);
  const lum = new Float32Array(n);
  const rgb = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const g = (area.y0 + y) * img.width + area.x0 + x;
      const i = g * 4;
      inHole[k] = hole[g];
      const l = luminance(img.data, i);
      lum[k] = polarity === "light" ? 255 - l : l;
      for (let c = 0; c < 3; c++) rgb[c][k] = img.data[i + c];
    }
  const radius = Math.max(4, Math.round(8 * unit));
  const keep = new Float32Array(n).fill(1);
  let bg = boxMean(lum, keep, w, h, radius);
  for (let k = 0; k < n; k++) if (lum[k] < bg[k] - 15) keep[k] = 0;
  bg = boxMean(lum, keep, w, h, radius);
  const cand = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (inHole[k] && lum[k] < bg[k] - 30) cand[k] = 1;
  const maxArea = Math.round(80 * unit * unit);
  const maxSide = Math.round(14 * unit);
  const margin = Math.max(2, Math.round(3 * unit));
  const seen = new Uint8Array(n);
  const drop = new Uint8Array(n);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (!cand[s] || seen[s]) continue;
    const comp: number[] = [s];
    seen[s] = 1;
    for (let j = 0; j < comp.length; j++) {
      const k = comp[j];
      const x = k % w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const q = k + dy * w + dx;
          if (nx < 0 || nx >= w || q < 0 || q >= n || seen[q] || !cand[q]) continue;
          seen[q] = 1;
          comp.push(q);
        }
    }
    if (comp.length > maxArea) continue;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    for (const k of comp) {
      x0 = Math.min(x0, k % w);
      x1 = Math.max(x1, k % w);
      y0 = Math.min(y0, Math.floor(k / w));
      y1 = Math.max(y1, Math.floor(k / w));
    }
    if (x1 - x0 >= maxSide || y1 - y0 >= maxSide) continue;
    // cercado de buraco: nada fora dele a menos de `margin` pixels
    let closed = x0 >= margin && y0 >= margin && x1 < w - margin && y1 < h - margin;
    for (let y = y0 - margin; closed && y <= y1 + margin; y++)
      for (let x = x0 - margin; x <= x1 + margin; x++)
        if (!inHole[y * w + x]) {
          closed = false;
          break;
        }
    if (!closed) continue;
    // a pinta e a borda suavizada dela (dentro da folga, todo buraco)
    for (let y = y0 - margin; y <= y1 + margin; y++)
      for (let x = x0 - margin; x <= x1 + margin; x++) {
        const k = y * w + x;
        if (lum[k] < bg[k] - 5) drop[k] = 1;
      }
    count++;
  }
  if (!count) return 0;
  const from = new Float32Array(n);
  for (let k = 0; k < n; k++) from[k] = drop[k] || !keep[k] ? 0 : 1;
  const fill = rgb.map((ch) => boxMean(ch, from, w, h, radius));
  for (let k = 0; k < n; k++) {
    if (!drop[k]) continue;
    const i = ((area.y0 + Math.floor(k / w)) * img.width + area.x0 + (k % w)) * 4;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(fill[c][k]);
  }
  return count;
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

/**
 * Cor média das letras marcadas na máscara (as mais contrastadas, um décimo das
 * marcadas), como "rgb(r,g,b)". Serve para escrever o português na mesma cor
 * de letras coloridas (o nome dourado das fichas antigas). `null` sem letras.
 */
export function averageInk(img: ImageData, m: RegionMask): string | null {
  const { rect, mask, polarity } = m;
  const w = rect.x1 - rect.x0;
  const px: [number, number, number, number][] = [];
  for (let y = rect.y0; y < rect.y1; y++)
    for (let x = rect.x0; x < rect.x1; x++) {
      if (!mask[(y - rect.y0) * w + x - rect.x0]) continue;
      const i = (y * img.width + x) * 4;
      px.push([img.data[i], img.data[i + 1], img.data[i + 2], luminance(img.data, i)]);
    }
  if (px.length < 20) return null;
  // o miolo das letras: as mais claras (texto claro) ou as mais escuras (texto escuro).
  // Um décimo delas: a máscara leva também a borda suavizada e a folga em volta, e com
  // mais que isso o dourado do nome (Inseto de M15) saía puxado para o marrom do fundo
  px.sort((a, b) => (polarity === "light" ? b[3] - a[3] : a[3] - b[3]));
  const core = px.slice(0, Math.ceil(px.length / 10));
  const avg = (c: number) => Math.round(core.reduce((n, p) => n + p[c], 0) / core.length);
  return `rgb(${avg(0)},${avg(1)},${avg(2)})`;
}

/**
 * A cor das letras, só quando ela é claramente colorida (o nome dourado na placa
 * preta das fichas incolores, como o Myr de C18). Letras brancas ou pretas voltam
 * `null`: a média delas puxa um pouco do fundo, e o branco e o preto puros ficam melhores.
 */
export function coloredInk(img: ImageData, m: RegionMask): string | null {
  const ink = averageInk(img, m);
  const [r, g, b] = (ink?.match(/\d+/g) ?? []).map(Number);
  if (r === undefined) return null;
  return Math.max(r, g, b) - Math.min(r, g, b) >= 50 ? ink : null;
}

/**
 * As colunas do bloco de letras do meio (o nome centralizado de uma ficha), separado do
 * resto por lacunas de pelo menos `gap` px. As pontas arredondadas da barra, mais claras
 * que o meio, também viravam "letra": apagadas, ficavam dois retângulos de outro tom nas
 * pontas (fichas de 2025: Tesouro, Soldado). Só contam as manchas da máscara que passam
 * pela faixa do meio da altura (40 a 60%), onde toda letra passa: num nome comprido, o
 * brilho do alto da ponta (Icingdeath, AFR) e o contorno claro da ponta (Sephiroth, FIN)
 * ficavam a menos de `gap` das letras, emendavam o bloco até o fim da barra e saíam
 * apagados como retângulos lisos. A mancha inteira conta (o braço do "T" vai junto com a
 * haste); vírgula e apóstrofo ficam entre letras, dentro do bloco. `null` sem letra nenhuma.
 */
export function centralSpan(m: RegionMask, gap: number): { x0: number; x1: number } | null {
  const w = m.rect.x1 - m.rect.x0;
  const h = m.rect.y1 - m.rect.y0;
  // manchas (vizinhança de 4) que tocam a faixa do meio
  const label = new Int32Array(w * h).fill(-1);
  const core: boolean[] = [];
  const stack: number[] = [];
  const mid0 = Math.floor(h * 0.4);
  const mid1 = Math.ceil(h * 0.6);
  for (let s = 0; s < w * h; s++) {
    if (!m.mask[s] || label[s] >= 0) continue;
    const id = core.length;
    let hits = false;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      if (y >= mid0 && y < mid1) hits = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && m.mask[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
    }
    core.push(hits);
  }
  const col = new Uint8Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (label[y * w + x] >= 0 && core[label[y * w + x]]) col[x] = 1;
  const blocks: [number, number][] = [];
  let start = -1;
  let last = -1;
  for (let x = 0; x < w; x++) {
    if (!col[x]) continue;
    if (start < 0) start = x;
    else if (x - last > gap) {
      blocks.push([start, last]);
      start = x;
    }
    last = x;
  }
  if (start >= 0) blocks.push([start, last]);
  if (!blocks.length) return null;
  // o bloco que cobre o centro (ou o mais perto dele)
  const c = w / 2;
  let best = blocks[0];
  let bestD = Infinity;
  for (const b of blocks) {
    const d = c < b[0] ? b[0] - c : c > b[1] ? c - b[1] : 0;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return { x0: m.rect.x0 + best[0], x1: m.rect.x0 + best[1] + 1 };
}
