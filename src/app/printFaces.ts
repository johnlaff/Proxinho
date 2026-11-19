/**
 * Cartas na resolução de impressão para o PDF (o PNG do Scryfall, ~1 MB cada), montadas uma vez
 * por face e qualidade e guardadas enquanto ficam no pedido.
 *
 * O PDF de um deck de 100 cartas levava cerca de 1 minuto depois do clique: cada carta era
 * montada de novo, agora no PNG, duas por vez. Enquanto a pessoa revisa as folhas, `warmPrints`
 * já monta as do pedido em segundo plano, uma de cada vez, só depois que as prévias acabam e só
 * quando a pessoa não está mexendo na página; no clique, `exportPdf` usa as prontas e monta só o
 * que falta. Com a economia de dados ligada no aparelho, nada é baixado antes do clique. E cada
 * face montada fica guardada no navegador para a próxima visita (ver cardStore.ts).
 */
import { fontsVersion } from "../engine/fonts";
import { renderCard } from "../engine/render";
import { cardKey, storeCard, storedCard } from "./cardStore";
import { renderKey, sideCount, sortEntries, type Entry, type Side } from "./model";
import { noteRender, previewUrl, renderInput, waitsForNeuralFill, whenPreviewsIdle } from "./preview";

export type Quality = "padrao" | "alta";
/** pixels de saída por pixel do PNG (745 px ≈ 300 dpi em 63 mm) */
const SCALE: Record<Quality, number> = { padrao: 1, alta: 1.6 };

/** Uma face pronta para o PDF: a imagem e a borda (que decide a cor da sangria). */
export type PrintFace = { image: Blob; border: "black" | "white" | "borderless" };

const faces = new Map<string, Promise<PrintFace>>();
const faceKey = (entry: Entry, side: Side, quality: Quality) => `${renderKey(entry, fontsVersion(), side)}:${quality}`;

/** As faces do pedido na ordem do PDF (cada face de uma carta de duas faces é uma imagem). */
export function printList(entries: Entry[]): { entry: Entry; side: Side }[] {
  return sortEntries(entries).flatMap((entry) => Array.from({ length: sideCount(entry) }, (_, side) => ({ entry, side: side as Side })));
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao montar uma carta."))), "image/jpeg", 0.92),
  );
}

/**
 * A face pronta para o PDF: a guardada, a que já está sendo montada, ou uma montagem nova (que
 * fica guardada; com erro, não). `onNeural` acompanha os quadros da rede neural só numa montagem
 * nova.
 */
export function printFace(
  entry: Entry,
  side: Side,
  quality: Quality,
  onNeural?: (p: { done: number; total: number }) => void,
): Promise<PrintFace> {
  const key = faceKey(entry, side, quality);
  let p = faces.get(key);
  if (!p) {
    p = (async () => {
      const input = renderInput(entry, side);
      if (!input) throw new Error(`Não há imagem para “${entry.card.name_pt ?? entry.card.name_en}”.`);
      const border = input.print.border === "white" || input.print.border === "borderless" ? input.print.border : "black";
      // guardada no navegador numa visita anterior (ver cardStore.ts)
      const id = await cardKey(`impressao:${quality}`, input);
      const stored = await storedCard(id);
      if (stored) {
        if (input.face) noteRender(input.print.id, side, stored.translated);
        return { image: stored.blob, border };
      }
      // (a caixa que a prévia já limpou vem pronta e conta tudo de uma vez)
      const { canvas, translated, reason } = await renderCard({ ...input, imageVersion: "png", scale: SCALE[quality], onNeural });
      if (input.face) noteRender(input.print.id, side, translated, reason);
      const image = await toBlob(canvas);
      // (sem a rede neural a carta saiu na original: noutra visita ela pode rodar)
      if (reason !== "neural") storeCard(id, { blob: image, translated });
      return { image, border };
    })();
    const mine = p;
    p.catch(() => faces.get(key) === mine && faces.delete(key));
    faces.set(key, p);
  }
  return p;
}

/** O aparelho pediu para economizar dados: as imagens de impressão ficam para o clique. */
export function saveData(nav: Navigator = navigator): boolean {
  return Boolean((nav as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
}

/**
 * Quantas cartas o PDF monta ao mesmo tempo: quatro num computador com folga, duas no resto
 * (cada PNG tem ~1 MB e o apagamento usa bastante memória; o celular travava com mais).
 */
export function exportParallel(nav: Navigator = navigator): number {
  const cores = nav.hardwareConcurrency || 2;
  const mobile = /Android|iPhone|iPad|Mobile/.test(nav.userAgent);
  // (só o Chrome diz a memória, e no máximo 8 GB)
  const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return !mobile && cores >= 4 && memory >= 8 ? 4 : 2;
}

let generation = 0;

/**
 * Montar uma carta no PNG prende a página por meio segundo (no celular, até 650 ms): o adiantado
 * só monta a próxima depois de `QUIET_MS` sem toque, rolagem nem tecla, e num respiro do navegador.
 */
const QUIET_MS = 1500;
let lastInput = 0;

/** A pessoa mexeu na página agora (a página chama em todo toque, rolagem e tecla). */
export function noteInput() {
  lastInput = Date.now();
}

if (typeof window !== "undefined")
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart", "scroll"])
    window.addEventListener(type, noteInput, { passive: true, capture: true });

async function breather() {
  for (;;) {
    await new Promise<void>((resolve) =>
      typeof requestIdleCallback === "function" ? requestIdleCallback(() => resolve(), { timeout: 1000 }) : setTimeout(resolve, 50),
    );
    const wait = lastInput + QUIET_MS - Date.now();
    if (wait <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** Para o PDF adiantado (o clique monta o resto com mais cartas ao mesmo tempo). */
export function stopWarm() {
  generation++;
}

/**
 * Adianta o PDF: monta em segundo plano, uma de cada vez, as faces do pedido que ainda não estão
 * prontas, sempre depois que as prévias acabam (a carta da rede neural espera a própria prévia,
 * que limpa a caixa que o PDF usa). Esquece as faces que saíram do pedido ou da qualidade
 * escolhida. Uma nova chamada (o pedido, a qualidade ou as fontes mudaram) substitui a anterior.
 */
export function warmPrints(entries: Entry[], quality: Quality): void {
  const run = ++generation;
  const list = printList(entries);
  const wanted = new Set(list.map(({ entry, side }) => faceKey(entry, side, quality)));
  for (const key of [...faces.keys()]) if (!wanted.has(key)) faces.delete(key);
  if (saveData()) return;
  void (async () => {
    for (const { entry, side } of list) {
      if (faces.has(faceKey(entry, side, quality))) continue;
      // a guardada no navegador não monta nada: não precisa esperar a vez
      const input = renderInput(entry, side);
      if (input && (await storedCard(await cardKey(`impressao:${quality}`, input)))) {
        if (generation !== run) return;
        void printFace(entry, side, quality).catch(() => undefined);
        continue;
      }
      await whenPreviewsIdle();
      await breather();
      if (generation !== run) return;
      try {
        if (waitsForNeuralFill(entry, side)) await previewUrl(entry, side);
        if (generation !== run) return;
        await printFace(entry, side, quality);
      } catch {
        /* sem rede ou sem imagem: o clique tenta de novo */
      }
    }
  })();
}
