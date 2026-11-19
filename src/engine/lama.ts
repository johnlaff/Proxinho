/**
 * Preenchimento por rede neural (LaMa) para apagar texto sobre arte.
 *
 * O push-pull de `erase.ts` preenche os buracos com a média borrada da
 * vizinhança. Em fundo liso (o pergaminho das cartas comuns) isso some, mas nas
 * caixas translúcidas dos planeswalkers a arte aparece por trás do texto, e o
 * borrão fica visível como uma mancha. O LaMa (Suvorov et al., 2021, "Resolution-
 * robust Large Mask Inpainting with Fourier Convolutions") reconstrói a textura
 * em volta, e é o modelo de referência para remover texto e objetos.
 *
 * Roda no navegador com o ONNX Runtime Web, numa worker (lamaWorker.ts) para
 * não travar a página: na placa de vídeo (WebGPU) quando há, senão na CPU. O modelo é uma versão quantizada de 37 MB
 * (pesos int4/int8, licença Apache 2.0), baixada só quando aparece o primeiro
 * planeswalker e guardada pelo navegador. Se não carregar, quem chama volta para o push-pull.
 *
 * O modelo trabalha num quadro de 512 × 512. A caixa de texto (~600 px de
 * largura no PNG do Scryfall, ~400 px na imagem menor das prévias) é recortada
 * com uma margem de contexto, redimensionada para o quadro, e o resultado volta
 * ao tamanho original só nos buracos. Um quadro
 * só, em vez de vários sobrepostos, evita emendas de tom entre eles e corta o
 * tempo pela metade.
 */
import type { Rect } from "./geometry";

const SIZE = 512;

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const pending = new Map<number, (r: { output?: Float32Array; error?: string }) => void>();

function getWorker(): Worker | null {
  if (broken || typeof Worker === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("./lamaWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ id: number; output?: Float32Array; error?: string }>) => {
      pending.get(ev.data.id)?.(ev.data);
      pending.delete(ev.data.id);
    };
    worker.onerror = () => {
      broken = true;
      for (const done of pending.values()) done({ error: "worker" });
      pending.clear();
    };
  }
  return worker;
}

function infer(image: Float32Array, mask: Float32Array): Promise<Float32Array | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, (r) => {
      if (r.error) {
        // modelo indisponível (sem rede, navegador antigo): não tenta de novo nesta página
        broken = true;
        console.warn("Proxinho: preenchimento por rede neural indisponível, usando o simples.", r.error);
      }
      resolve(r.output ?? null);
    });
    w.postMessage({ type: "run", id, image, mask }, [image.buffer, mask.buffer]);
  });
}

/** Recorte quadrado da imagem (canto e lado, em pixels). */
type Crop = { x: number; y: number; size: number };

/** Recorte quadrado em volta de `area`, com margem de contexto, dentro da imagem. */
export function cropAround(area: Rect, width: number, height: number, margin: number): Crop {
  const size = Math.min(Math.max(SIZE, area.x1 - area.x0 + 2 * margin, area.y1 - area.y0 + 2 * margin), width, height);
  const clampTo = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max - size);
  return {
    x: clampTo((area.x0 + area.x1) / 2 - size / 2, width),
    y: clampTo((area.y0 + area.y1) / 2 - size / 2, height),
    size,
  };
}

/**
 * Um quadro do modelo: recorta `crop` da imagem, reduz ou amplia para 512 × 512, roda o
 * modelo e devolve o resultado só nos buracos de `mask` dentro de `fill`. Devolve `false`
 * se o modelo não estiver disponível.
 */
async function runFrame(img: ImageData, crop: Crop, mask: Uint8Array, hide: Rect[], fill: Rect): Promise<boolean> {
  const W = img.width;
  const s = SIZE / crop.size; // < 1 reduz (PNG), > 1 amplia (imagem menor das prévias)
  const n = SIZE * SIZE;
  const image = new Float32Array(3 * n);
  const holes = new Float32Array(n);
  // o que fica escondido do modelo, sem ser preenchido: a caixa da lealdade, preta, no
  // canto da caixa de texto. Vista pelo modelo, ela virava fonte do preenchimento e a
  // letra apagada logo acima saía como uma mancha marrom (Tezzeret, AER)
  const hidden = (x: number, y: number) => hide.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  // buraco no quadro: qualquer pixel de buraco da imagem que caia dentro dele
  const span = (d: number) => [Math.floor(d / s), Math.max(Math.floor(d / s), Math.ceil((d + 1) / s) - 1)];
  for (let y = 0; y < SIZE; y++) {
    const [ya, yb] = span(y);
    for (let x = 0; x < SIZE; x++) {
      const [xa, xb] = span(x);
      let hole = 0;
      for (let yy = ya; yy <= yb && !hole; yy++)
        for (let xx = xa; xx <= xb && !hole; xx++) {
          const px = crop.x + Math.min(xx, crop.size - 1);
          const py = crop.y + Math.min(yy, crop.size - 1);
          hole = mask[py * W + px] || (hidden(px, py) ? 1 : 0);
        }
      holes[y * SIZE + x] = hole;
    }
  }
  // amostragem bilinear da imagem original; o buraco vai zerado, como no treino do modelo
  const sample = (fx: number, fy: number, c: number) => {
    const x0 = Math.min(Math.max(0, Math.floor(fx)), W - 1);
    const y0 = Math.min(Math.max(0, Math.floor(fy)), img.height - 1);
    const x1 = Math.min(x0 + 1, W - 1);
    const y1 = Math.min(y0 + 1, img.height - 1);
    const tx = Math.min(Math.max(fx - x0, 0), 1);
    const ty = Math.min(Math.max(fy - y0, 0), 1);
    const d = img.data;
    const a = d[(y0 * W + x0) * 4 + c] * (1 - tx) + d[(y0 * W + x1) * 4 + c] * tx;
    const b = d[(y1 * W + x0) * 4 + c] * (1 - tx) + d[(y1 * W + x1) * 4 + c] * tx;
    return a * (1 - ty) + b * ty;
  };
  let any = false;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const k = y * SIZE + x;
      if (holes[k]) {
        any = true;
        continue;
      }
      const fx = crop.x + (x + 0.5) / s - 0.5;
      const fy = crop.y + (y + 0.5) / s - 0.5;
      for (let c = 0; c < 3; c++) image[c * n + k] = sample(fx, fy, c) / 255;
    }
  }
  if (!any) return true;
  const out = await infer(image, holes);
  if (!out) return false;
  // volta ao tamanho original só nos buracos (bilinear sobre a saída do modelo)
  const at = (x: number, y: number, c: number) => out[c * n + y * SIZE + x];
  for (let y = Math.max(fill.y0, crop.y); y < Math.min(fill.y1, crop.y + crop.size); y++) {
    for (let x = Math.max(fill.x0, crop.x); x < Math.min(fill.x1, crop.x + crop.size); x++) {
      const p = y * W + x;
      if (!mask[p]) continue;
      const fx = Math.min(Math.max((x - crop.x + 0.5) * s - 0.5, 0), SIZE - 1);
      const fy = Math.min(Math.max((y - crop.y + 0.5) * s - 0.5, 0), SIZE - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, SIZE - 1);
      const y1 = Math.min(y0 + 1, SIZE - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      for (let c = 0; c < 3; c++) {
        const a = at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx;
        const b = at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx;
        img.data[p * 4 + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  return true;
}

/**
 * Quadros de 512 px na resolução da própria imagem que cobrem `area`, da esquerda para a
 * direita e de cima para baixo: cada um preenche um pedaço (`fill`) e fica com pelo menos
 * `margin` px de contexto de cada lado dele, salvo na beira da imagem.
 */
export function nativeTiles(area: Rect, width: number, height: number, margin: number): { crop: Crop; fill: Rect }[] {
  const size = Math.min(SIZE, width, height);
  const room = size - 2 * margin;
  const nx = Math.max(1, Math.ceil((area.x1 - area.x0) / room));
  const ny = Math.max(1, Math.ceil((area.y1 - area.y0) / room));
  const out: { crop: Crop; fill: Rect }[] = [];
  const cut = (a: number, b: number, n: number, i: number) => Math.round(a + ((b - a) * i) / n);
  const clampTo = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max - size);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [x0, x1] = [cut(area.x0, area.x1, nx, i), cut(area.x0, area.x1, nx, i + 1)];
      const [y0, y1] = [cut(area.y0, area.y1, ny, j), cut(area.y0, area.y1, ny, j + 1)];
      const crop = { x: clampTo((x0 + x1) / 2 - size / 2, width), y: clampTo((y0 + y1) / 2 - size / 2, height), size };
      out.push({ crop, fill: { x0, y0, x1, y1 } });
    }
  return out;
}

/**
 * Preenche, dentro de `area`, os pixels marcados em `mask` (máscara da imagem
 * inteira). Devolve `false` se o modelo não estiver disponível; nesse caso a
 * imagem fica intacta e quem chama usa o preenchimento simples.
 *
 * Com `native`, o modelo roda na resolução da própria imagem, em quadros de 512 px que se
 * seguem (cada um vê o que o anterior já preencheu), em vez de um quadro só reduzido.
 * Reduzida, a arte fina atrás da caixa sem borda (a gravura e a retícula da impressão do
 * Shivan Dragon da Secret Lair) perdia o desenho e o remendo saía em manchas borradas.
 */
export async function lamaInpaint(img: ImageData, area: Rect, mask: Uint8Array, hide: Rect[] = [], native = false): Promise<boolean> {
  const W = img.width;
  const margin = Math.round(W * 0.03);
  const single = cropAround(area, W, img.height, margin);
  if (!native || single.size <= SIZE) return runFrame(img, single, mask, hide, area);
  // a máscara muda a cada quadro: o que um já preencheu é contexto para o seguinte
  const work = Uint8Array.from(mask);
  for (const { crop, fill } of nativeTiles(area, W, img.height, Math.round(W * 0.043))) {
    if (!(await runFrame(img, crop, work, hide, fill))) return false;
    for (let y = fill.y0; y < fill.y1; y++) work.fill(0, y * W + fill.x0, y * W + fill.x1);
  }
  return true;
}
