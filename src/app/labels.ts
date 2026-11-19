import { etaMs, type LamaStatus } from "../engine/lama";
import type { Backend } from "../engine/lamaFiles";
import type { Outcome } from "./model";
import type { NeuralProgress } from "./preview";

/** Como cada resultado aparece escrito na interface (nunca só pela cor). */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  reescrita: "Reescrita em português",
  "imagem-pt": "Imagem oficial em português",
  "sem-traducao": "Em inglês: ainda sem tradução oficial",
  moldura: "Em inglês: esta moldura ainda não é reescrita",
  apagador: "Em inglês: o apagador de texto não rodou neste navegador",
};

/** Tempo que falta, por extenso e arredondado: "alguns segundos", "cerca de 40 s", "cerca de 2 min". */
export function formatEta(ms: number): string {
  if (ms < 10_000) return "alguns segundos";
  if (ms < 55_000) return `cerca de ${Math.ceil(ms / 5000) * 5} s`;
  return `cerca de ${Math.max(1, Math.round(ms / 60_000))} min`;
}

/**
 * Andamento da rede neural numa carta que espera por ela (artes sem borda e planeswalkers), para a
 * prévia: `text` na gaveta, `short` na folha e `percent` para a barra (`null` sem medida: a barra
 * fica em movimento, sem número). Na fila, só diz que está na fila; na vez da carta, segue a
 * etapa do modelo (download com %, preparo) e depois os quadros da carta, com o tempo que falta
 * pela média dos quadros anteriores. `null` quando não há o que mostrar.
 */
export function neuralLine(
  s: LamaStatus,
  p: NeuralProgress | undefined,
  now = Date.now(),
): { text: string; short: string; percent: number | null } | null {
  if (!p || s.stage === "failed") return null;
  if (p.state === "queued") return { text: "Na fila do acabamento: as cartas antes desta vão primeiro.", short: "Na fila", percent: null };
  if (s.stage === "download") {
    const percent = s.total > 0 ? Math.min(99, Math.floor((100 * s.loaded) / s.total)) : null;
    return percent === null
      ? { text: "Baixando o apagador de texto…", short: "Baixando…", percent }
      : { text: `Baixando o apagador de texto: ${percent}%`, short: `Baixando ${percent}%`, percent };
  }
  if (s.stage === "prepare") return { text: "Preparando o apagador de texto…", short: "Preparando…", percent: null };
  if (!p.total) return { text: "Apagando o inglês…", short: "Apagando…", percent: null };
  const part = Math.min(p.done + 1, p.total);
  const eta = etaMs(s, p.total - p.done, now);
  // o quadro atual conta pelo tempo que já rodou dele (até 95%: a média é estimativa)
  const running = s.stage === "run" && s.since && s.frameMs ? Math.min(0.95, (now - s.since) / s.frameMs) : 0;
  const percent = Math.min(99, Math.floor((100 * (p.done + running)) / p.total));
  return {
    text: `Acabamento: parte ${part} de ${p.total}, ${eta === null ? "calculando o tempo" : formatEta(eta)}`,
    short: `Acabamento ${part}/${p.total}`,
    percent,
  };
}

/** O que o navegador oferece para a rede neural: WebGPU (`navigator.gpu`) e se é o Firefox. */
export type BrowserGpu = { gpu: boolean; firefox: boolean };

export function browserGpu(nav: { gpu?: unknown; userAgent?: string } = navigator): BrowserGpu {
  return { gpu: Boolean(nav.gpu), firefox: /\bFirefox\/\d/.test(nav.userAgent ?? "") };
}

/**
 * Onde o acabamento roda, para a gaveta. No processador a espera é bem maior (no celular, de 15 a
 * 60 s por quadro, contra 1 a 5 s na placa de vídeo), e a frase explica por quê; no Firefox, que
 * ainda não deixa sites usarem a placa de vídeo no Android nem no Linux, aponta o Chrome. `null`
 * antes de o modelo ficar pronto (ainda não se sabe onde ele roda).
 */
export function neuralWhere(backend: Backend | null, env: BrowserGpu): string | null {
  if (backend === "webgpu") return "Rodando na placa de vídeo deste aparelho.";
  if (backend !== "wasm") return null;
  if (env.gpu) return "Rodando no processador: a placa de vídeo deste aparelho não serviu para o acabamento.";
  if (env.firefox)
    return "Rodando no processador: o Firefox ainda não deixa sites usarem a placa de vídeo neste aparelho. No Chrome, o acabamento costuma levar bem menos.";
  return "Rodando no processador: este navegador ainda não deixa sites usarem a placa de vídeo.";
}
